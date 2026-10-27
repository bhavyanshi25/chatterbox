import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { Conversation } from './models/Conversation.js';
import { User } from './models/User.js';
import { AUTH_COOKIE, readCookie, verifyToken } from './auth/tokens.js';
import { convRoom, userRoom } from './realtime.js';
import { getMemberConversation } from './services/conversations.js';
import { markDelivered, markRead, sendMessage } from './services/messages.js';
import { serializeMessage } from './services/serialize.js';
import { sendSchema } from './routes/conversations.js';
import { parse } from './middleware/validate.js';
import { isDemoAccount } from './utils/demoAccounts.js';

const idOf = (value) => String(value?._id ?? value);

// Wraps a handler so it always answers its ack with { ok, ... } and never
// crashes the socket on bad input.
function withAck(handler) {
  return async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      reply({ ok: true, ...(await handler(payload ?? {})) });
    } catch (err) {
      const status = err?.status || 500;
      if (status >= 500) console.error('[socket]', err);
      reply({ ok: false, status, error: status >= 500 ? 'Something went wrong.' : err.message });
    }
  };
}

export function createSocketServer(httpServer, config, realtime) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigins, credentials: true },
    maxHttpBufferSize: 64 * 1024, // images go over HTTP; socket payloads are small
  });
  realtime.attach(io);

  // Authenticate the handshake with the same httpOnly cookie as the REST API.
  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, AUTH_COOKIE);
      const userId = verifyToken(token, config);
      if (!userId || !mongoose.isValidObjectId(userId)) return next(new Error('unauthorized'));
      const user = await User.findById(userId);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user;
    const me = idOf(user);

    // Register handlers synchronously so no early event is dropped while the
    // async setup below runs.
    socket.on(
      'message:send',
      withAck(async (payload) => {
        const input = parse(sendSchema, payload);
        const conversation = await getMemberConversation(payload.conversationId, user._id);
        const { message, duplicate } = await sendMessage(realtime, { conversation, sender: user, ...input });
        return { message: serializeMessage(message, user._id), duplicate };
      })
    );

    socket.on('typing', async (payload) => {
      const conversationId = String(payload?.conversationId || '');
      if (!socket.rooms.has(convRoom(conversationId))) return;
      socket.to(convRoom(conversationId)).emit('typing', {
        conversationId,
        userId: me,
        isTyping: Boolean(payload?.isTyping),
      });
    });

    // Client confirms it received messages live.
    socket.on(
      'messages:delivered',
      withAck(async (payload) => {
        const conversationId = String(payload?.conversationId || '');
        const ids = Array.isArray(payload?.messageIds) ? payload.messageIds.slice(0, 500).map(String) : [];
        await getMemberConversation(conversationId, user._id);
        const results = await markDelivered(user._id, { conversationIds: [conversationId], messageIds: ids });
        for (const r of results) realtime.toConversation(r.conversationId, 'messages:delivered', { ...r, userId: me });
        return {};
      })
    );

    socket.on(
      'conversation:read',
      withAck(async (payload) => {
        const conversation = await getMemberConversation(payload?.conversationId, user._id);
        const result = await markRead(user._id, conversation);
        realtime.toConversation(result.conversationId, 'messages:read', result);
        realtime.toUser(me, 'conversation:read', { conversationId: result.conversationId });
        return {};
      })
    );

    socket.on('disconnect', async () => {
      if (!socket.data.counted) return;
      if (realtime.removeConnection(me) && !isDemoAccount(user)) {
        const lastSeen = new Date();
        await User.updateOne({ _id: user._id }, { $set: { lastSeen } }).catch(() => {});
        realtime.toAll('presence', { userId: me, online: false, lastSeen });
      }
    });

    socket.join(userRoom(me));
    const conversations = await Conversation.find({ 'members.user': user._id }).select('_id');
    socket.join(conversations.map((c) => convRoom(idOf(c))));

    // The client may have gone away while we were querying.
    if (socket.disconnected) return;
    socket.data.counted = true;
    if (realtime.addConnection(me) && !isDemoAccount(user)) {
      realtime.toAll('presence', { userId: me, online: true, lastSeen: user.lastSeen });
    }

    // Anything sent while this user was offline is now delivered.
    const delivered = await markDelivered(user._id, { conversationIds: conversations.map((c) => c._id) });
    for (const d of delivered) realtime.toConversation(d.conversationId, 'messages:delivered', { ...d, userId: me });

    socket.emit('ready');
  });

  return io;
}
