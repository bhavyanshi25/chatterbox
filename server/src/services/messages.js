import mongoose from 'mongoose';
import { Attachment } from '../models/Attachment.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { getMemberConversation } from './conversations.js';
import { serializeMessage } from './serialize.js';

const idOf = (value) => String(value?._id ?? value);
const DEMO_AUTO_REPLY = 'Got it 👍';
const DEMO_AUTO_REPLY_DELAY_MS = 5000;

export const MAX_MESSAGE_LENGTH = 4000;

// Loads a message the user is allowed to see (they're in its conversation).
export async function getVisibleMessage(messageId, userId) {
  if (!mongoose.isValidObjectId(messageId)) throw notFound('Message not found.');
  const message = await Message.findById(messageId).populate('attachment');
  if (!message) throw notFound('Message not found.');
  const conversation = await getMemberConversation(message.conversation, userId).catch(() => {
    throw notFound('Message not found.');
  });
  return { message, conversation };
}

function replySnippet(original) {
  if (original.deleted) return 'Deleted message';
  const text = original.text || (original.attachment ? '📷 Photo' : '');
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

// Persists a message. Idempotent per (sender, clientId): retrying the same
// send — after a reconnect, a lost ack, or a double click — returns the
// original message instead of creating a duplicate.
export async function createMessage({ conversation, sender, clientId, text = '', replyToId, attachmentId }) {
  const findExisting = () =>
    Message.findOne({ sender: sender._id, clientId }).populate('attachment');

  const existing = await findExisting();
  if (existing) {
    if (idOf(existing.conversation) !== idOf(conversation)) {
      throw conflict('clientId was already used for another conversation.');
    }
    return { message: existing, duplicate: true };
  }

  const trimmed = text.trim();
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw badRequest(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }

  let attachment = null;
  if (attachmentId) {
    if (!mongoose.isValidObjectId(attachmentId)) throw badRequest('Invalid attachment.');
    attachment = await Attachment.findOne({
      _id: attachmentId,
      uploader: sender._id,
      conversation: conversation._id,
      message: null,
    });
    if (!attachment) throw badRequest('That attachment is missing or was already sent.');
  }

  if (!trimmed && !attachment) throw badRequest('Message cannot be empty.');

  let replyTo = null;
  if (replyToId) {
    if (!mongoose.isValidObjectId(replyToId)) throw badRequest('Invalid reply target.');
    const original = await Message.findOne({ _id: replyToId, conversation: conversation._id })
      .populate('sender', 'name')
      .populate('attachment');
    if (!original) throw badRequest('The message you replied to no longer exists.');
    replyTo = {
      messageId: original._id,
      senderId: original.sender?._id,
      senderName: original.sender?.name || 'Unknown',
      text: replySnippet(original),
    };
  }

  let message;
  try {
    message = await Message.create({
      conversation: conversation._id,
      sender: sender._id,
      clientId,
      text: trimmed,
      attachment: attachment?._id ?? null,
      replyTo,
      deliveredTo: [],
      readBy: [],
    });
  } catch (err) {
    // Two concurrent sends with the same clientId: the unique index lets one
    // through; the other returns the winner.
    if (err?.code === 11000) {
      const winner = await findExisting();
      if (winner) return { message: winner, duplicate: true };
    }
    throw err;
  }

  if (attachment) {
    attachment.message = message._id;
    await attachment.save();
  }

  // The sender has obviously read everything up to their own message.
  await Conversation.updateOne(
    { _id: conversation._id, 'members.user': sender._id },
    { $set: { lastMessageAt: message.createdAt, 'members.$.lastReadAt': message.createdAt } }
  );

  await message.populate('attachment');
  return { message, duplicate: false };
}

// Persist first, broadcast second: nobody (including the sender's ack) hears
// about a message that isn't safely in the database.
export async function sendMessage(realtime, { conversation, sender, ...input }) {
  const result = await createMessage({ conversation, sender, ...input });
  if (!result.duplicate) {
    realtime.toConversation(idOf(conversation), 'message:new', {
      message: serializeMessage(result.message),
    });
  }

  if (!result.duplicate && conversation.type === 'direct') {
    const recipientId = conversation.members.find((member) => idOf(member.user) !== idOf(sender))?.user;
    const demoRecipient = recipientId
      ? await User.findOne({ _id: recipientId, email: { $regex: /@demo\.chatterbox\.test$/i } })
      : null;

    if (demoRecipient) {
      const demoRecipientId = idOf(demoRecipient);
      if (realtime.addDemoPresence(demoRecipientId)) {
        realtime.toAll('presence', {
          userId: demoRecipientId,
          online: true,
          lastSeen: demoRecipient.lastSeen,
        });
      }

      const delivered = await markDelivered(demoRecipient._id, {
        messageIds: [result.message._id],
      });
      for (const receipt of delivered) {
        realtime.toConversation(receipt.conversationId, 'messages:delivered', {
          ...receipt,
          userId: idOf(demoRecipient),
        });
      }
      result.message.deliveredTo.push(demoRecipient._id);

      setTimeout(async () => {
        try {
          const read = await markRead(demoRecipient._id, conversation);
          realtime.toConversation(read.conversationId, 'messages:read', read);

          const autoReply = await createMessage({
            conversation,
            sender: demoRecipient,
            clientId: `demo-auto-reply-${idOf(result.message)}`,
            text: DEMO_AUTO_REPLY,
            replyToId: result.message._id,
          });
          if (!autoReply.duplicate) {
            realtime.toConversation(idOf(conversation), 'message:new', {
              message: serializeMessage(autoReply.message),
            });
          }
        } catch (err) {
          console.error('[demo auto-reply]', err);
        } finally {
          try {
            if (realtime.removeDemoPresence(demoRecipientId)) {
              const lastSeen = new Date();
              await User.updateOne({ _id: demoRecipient._id }, { $set: { lastSeen } });
              realtime.toAll('presence', { userId: demoRecipientId, online: false, lastSeen });
            }
          } catch (err) {
            console.error('[demo presence]', err);
          }
        }
      }, DEMO_AUTO_REPLY_DELAY_MS);
    }
  }

  return result;
}

function groupByConversation(messages) {
  const groups = new Map();
  for (const m of messages) {
    const key = idOf(m.conversation);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(idOf(m._id));
  }
  return [...groups].map(([conversationId, messageIds]) => ({ conversationId, messageIds }));
}

// Marks messages from others as delivered to `userId`. Scope with
// `conversationIds` and/or `messageIds`. Returns [{ conversationId, messageIds }].
export async function markDelivered(userId, { conversationIds, messageIds } = {}) {
  const filter = { sender: { $ne: userId }, deliveredTo: { $ne: userId } };
  if (conversationIds) filter.conversation = { $in: conversationIds };
  if (messageIds) filter._id = { $in: messageIds.filter((id) => mongoose.isValidObjectId(id)) };

  const pending = await Message.find(filter).select('_id conversation').lean();
  if (pending.length === 0) return [];
  await Message.updateMany(
    { _id: { $in: pending.map((m) => m._id) } },
    { $addToSet: { deliveredTo: userId } }
  );
  return groupByConversation(pending);
}

// Marks everything in the conversation as read by `userId` and moves their
// unread marker forward. Returns the ids that changed state.
export async function markRead(userId, conversation) {
  const at = new Date();
  const pending = await Message.find({
    conversation: conversation._id,
    sender: { $ne: userId },
    readBy: { $ne: userId },
  })
    .select('_id')
    .lean();

  if (pending.length > 0) {
    await Message.updateMany(
      { _id: { $in: pending.map((m) => m._id) } },
      { $addToSet: { readBy: userId, deliveredTo: userId } }
    );
  }
  await Conversation.updateOne(
    { _id: conversation._id, 'members.user': userId },
    { $set: { 'members.$.lastReadAt': at } }
  );
  return { conversationId: idOf(conversation), userId: String(userId), messageIds: pending.map((m) => idOf(m._id)), at };
}
