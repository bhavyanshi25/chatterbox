import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { objectId, parse } from '../middleware/validate.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import {
  broadcastConversation,
  canPin,
  conversationPayload,
  getMemberConversation,
  isAdmin,
  isMember,
  listConversations,
  memberIds,
  requireGroupAdmin,
} from '../services/conversations.js';
import { markDelivered, markRead, MAX_MESSAGE_LENGTH, sendMessage } from '../services/messages.js';
import { serializeMessage } from '../services/serialize.js';

const MAX_GROUP_MEMBERS = 100;
const MAX_PINS = 20;

const directSchema = z.object({ userId: objectId });
const groupSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required.').max(80),
  memberIds: z.array(objectId).min(1, 'Add at least one other person.').max(MAX_GROUP_MEMBERS),
});
const renameSchema = z.object({ name: z.string().trim().min(1, 'Group name is required.').max(80) });
const addMembersSchema = z.object({ userIds: z.array(objectId).min(1).max(MAX_GROUP_MEMBERS) });
const roleSchema = z.object({ role: z.enum(['admin', 'member']) });
const pinSchema = z.object({ messageId: objectId });
export const sendSchema = z.object({
  clientId: z.string().trim().min(1).max(64),
  text: z.string().max(MAX_MESSAGE_LENGTH, `Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`).default(''),
  replyToId: objectId.nullish(),
  attachmentId: objectId.nullish(),
});
const historySchema = z.object({
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const idOf = (value) => String(value?._id ?? value);

export function conversationsRouter(realtime) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json({ conversations: await listConversations(req.user._id, realtime) });
  });

  // Find-or-create the one-to-one conversation with another user.
  router.post('/direct', async (req, res) => {
    const { userId } = parse(directSchema, req.body);
    const me = idOf(req.user);
    if (userId === me) throw badRequest("You can't start a conversation with yourself.");
    if (!(await User.exists({ _id: userId }))) throw notFound('User not found.');

    const directKey = [me, userId].sort().join(':');
    let conversation = await Conversation.findOne({ directKey });
    let created = false;
    if (!conversation) {
      try {
        conversation = await Conversation.create({
          type: 'direct',
          directKey,
          createdBy: req.user._id,
          members: [
            { user: req.user._id, role: 'member' },
            { user: userId, role: 'member' },
          ],
        });
        created = true;
      } catch (err) {
        if (err?.code !== 11000) throw err;
        conversation = await Conversation.findOne({ directKey });
      }
    }

    if (created) {
      realtime.joinConversation(memberIds(conversation), idOf(conversation));
      await broadcastConversation(conversation, realtime, 'conversation:new');
    }
    res.status(created ? 201 : 200).json({
      conversation: await conversationPayload(conversation, req.user._id, realtime),
    });
  });

  router.post('/group', async (req, res) => {
    const { name, memberIds: requested } = parse(groupSchema, req.body);
    const me = idOf(req.user);
    const others = [...new Set(requested)].filter((id) => id !== me);
    if (others.length === 0) throw badRequest('Add at least one other person.');
    const found = await User.countDocuments({ _id: { $in: others } });
    if (found !== others.length) throw badRequest('Some of those users do not exist.');

    const conversation = await Conversation.create({
      type: 'group',
      name,
      createdBy: req.user._id,
      lastMessageAt: new Date(),
      members: [
        { user: req.user._id, role: 'admin' },
        ...others.map((user) => ({ user, role: 'member' })),
      ],
    });
    realtime.joinConversation(memberIds(conversation), idOf(conversation));
    await broadcastConversation(conversation, realtime, 'conversation:new');
    res.status(201).json({ conversation: await conversationPayload(conversation, req.user._id, realtime) });
  });

  router.get('/:id', async (req, res) => {
    const conversation = await getMemberConversation(req.params.id, req.user._id);
    res.json({ conversation: await conversationPayload(conversation, req.user._id, realtime) });
  });

  router.patch('/:id', async (req, res) => {
    const conversation = await getMemberConversation(req.params.id, req.user._id);
    requireGroupAdmin(conversation, req.user._id);
    const { name } = parse(renameSchema, req.body);
    conversation.name = name;
    await conversation.save();
    await broadcastConversation(conversation, realtime);
    res.json({ conversation: await conversationPayload(conversation, req.user._id, realtime) });
  });

  // ---- Group membership -------------------------------------------------

  router.post('/:id/members', async (req, res) => {
    const conversation = await getMemberConversation(req.params.id, req.user._id);
    requireGroupAdmin(conversation, req.user._id);
    const { userIds } = parse(addMembersSchema, req.body);
    const toAdd = [...new Set(userIds)].filter((id) => !isMember(conversation, id));
    if (conversation.members.length + toAdd.length > MAX_GROUP_MEMBERS) {
      throw badRequest(`Groups can have at most ${MAX_GROUP_MEMBERS} members.`);
    }
    const found = await User.countDocuments({ _id: { $in: toAdd } });
    if (found !== toAdd.length) throw badRequest('Some of those users do not exist.');

    // New members only count messages from now on as unread.
    toAdd.forEach((user) => conversation.members.push({ user, role: 'member', lastReadAt: new Date() }));
    await conversation.save();
    realtime.joinConversation(toAdd, idOf(conversation));
    await broadcastConversation(conversation, realtime, 'conversation:new', toAdd);
    await broadcastConversation(
      conversation,
      realtime,
      'conversation:updated',
      memberIds(conversation).filter((id) => !toAdd.includes(id))
    );
    res.json({ conversation: await conversationPayload(conversation, req.user._id, realtime) });
  });

  // Admins can remove anyone; anyone can remove themselves (leave).
  router.delete('/:id/members/:userId', async (req, res) => {
    const conversation = await getMemberConversation(req.params.id, req.user._id);
    if (conversation.type !== 'group') throw badRequest("You can't leave a direct conversation.");
    const targetId = req.params.userId;
    const me = idOf(req.user);
    if (targetId !== me && !isAdmin(conversation, me)) throw forbidden('Only group admins can remove members.');
    if (!isMember(conversation, targetId)) throw notFound('That person is not in this group.');

    conversation.members = conversation.members.filter((m) => idOf(m.user) !== targetId);
    // Never leave a group without an admin: promote the longest-standing member.
    if (conversation.members.length > 0 && !conversation.members.some((m) => m.role === 'admin')) {
      const oldest = [...conversation.members].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      oldest.role = 'admin';
    }
    await conversation.save();

    realtime.leaveConversation([targetId], idOf(conversation));
    realtime.toUser(targetId, 'conversation:removed', { conversationId: idOf(conversation) });
    await broadcastConversation(conversation, realtime);
    res.status(204).end();
  });

  router.patch('/:id/members/:userId', async (req, res) => {
    const conversation = await getMemberConversation(req.params.id, req.user._id);
    requireGroupAdmin(conversation, req.user._id);
    const { role } = parse(roleSchema, req.body);
    const member = conversation.members.find((m) => idOf(m.user) === req.params.userId);
    if (!member) throw notFound('That person is not in this group.');
    if (role === 'member' && member.role === 'admin') {
      const admins = conversation.members.filter((m) => m.role === 'admin').length;
      if (admins <= 1) throw badRequest('A group needs at least one admin.');
    }
    member.role = role;
    await conversation.save();
    await broadcastConversation(conversation, realtime);
    res.json({ conversation: await conversationPayload(conversation, req.user._id, realtime) });
  });

  // ---- Messages ---------------------------------------------------------

  router.get('/:id/messages', async (req, res) => {
    const conversation = await getMemberConversation(req.params.id, req.user._id);
    const { before, limit } = parse(historySchema, req.query);
    const filter = { conversation: conversation._id };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const page = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('attachment');
    const hasMore = page.length > limit;
    const messages = page.slice(0, limit).reverse();

    // Fetching history counts as receiving it (covers users who were offline).
    const delivered = await markDelivered(req.user._id, { conversationIds: [conversation._id] });
    for (const d of delivered) {
      realtime.toConversation(d.conversationId, 'messages:delivered', { ...d, userId: idOf(req.user) });
    }
    const deliveredIds = new Set(delivered.flatMap((d) => d.messageIds));

    res.json({
      messages: messages.map((m) => {
        if (deliveredIds.has(idOf(m)) && !m.deliveredTo.some((u) => idOf(u) === idOf(req.user))) {
          m.deliveredTo.push(req.user._id);
        }
        return serializeMessage(m, req.user._id);
      }),
      hasMore,
    });
  });

  // REST equivalent of the `message:send` socket event (same idempotency rules).
  router.post('/:id/messages', async (req, res) => {
    const conversation = await getMemberConversation(req.params.id, req.user._id);
    const input = parse(sendSchema, req.body);
    const { message, duplicate } = await sendMessage(realtime, { conversation, sender: req.user, ...input });
    res.status(duplicate ? 200 : 201).json({ message: serializeMessage(message, req.user._id), duplicate });
  });

  router.post('/:id/read', async (req, res) => {
    const conversation = await getMemberConversation(req.params.id, req.user._id);
    const result = await markRead(req.user._id, conversation);
    realtime.toConversation(result.conversationId, 'messages:read', result);
    realtime.toUser(idOf(req.user), 'conversation:read', { conversationId: result.conversationId });
    res.json(result);
  });

  // ---- Pins ---------------------------------------------------------------

  router.post('/:id/pins', async (req, res) => {
    const conversation = await getMemberConversation(req.params.id, req.user._id);
    if (!canPin(conversation, req.user._id)) throw forbidden('Only group admins can pin messages.');
    const { messageId } = parse(pinSchema, req.body);
    const message = await Message.findOne({ _id: messageId, conversation: conversation._id, deleted: false });
    if (!message) throw notFound('Message not found.');
    if (!conversation.pinnedMessages.some((id) => idOf(id) === messageId)) {
      if (conversation.pinnedMessages.length >= MAX_PINS) {
        throw badRequest(`You can pin at most ${MAX_PINS} messages.`);
      }
      conversation.pinnedMessages.push(message._id);
      await conversation.save();
      await broadcastConversation(conversation, realtime);
    }
    res.json({ pinnedMessageIds: conversation.pinnedMessages.map(idOf) });
  });

  router.delete('/:id/pins/:messageId', async (req, res) => {
    const conversation = await getMemberConversation(req.params.id, req.user._id);
    if (!canPin(conversation, req.user._id)) throw forbidden('Only group admins can unpin messages.');
    if (!mongoose.isValidObjectId(req.params.messageId)) throw notFound('Message not found.');
    conversation.pinnedMessages = conversation.pinnedMessages.filter((id) => idOf(id) !== req.params.messageId);
    await conversation.save();
    await broadcastConversation(conversation, realtime);
    res.json({ pinnedMessageIds: conversation.pinnedMessages.map(idOf) });
  });

  return router;
}
