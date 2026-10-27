import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { forbidden, notFound } from '../utils/errors.js';
import { serializeConversation, serializeMessage } from './serialize.js';

const idOf = (value) => String(value?._id ?? value);

export const memberIds = (conversation) => conversation.members.map((m) => idOf(m.user));

export const isMember = (conversation, userId) =>
  conversation.members.some((m) => idOf(m.user) === String(userId));

export const isAdmin = (conversation, userId) =>
  conversation.members.some((m) => idOf(m.user) === String(userId) && m.role === 'admin');

// Loads a conversation the user belongs to. Non-members get the same 404 as a
// missing conversation so ids can't be probed.
export async function getMemberConversation(conversationId, userId) {
  if (!mongoose.isValidObjectId(conversationId)) throw notFound('Conversation not found.');
  const conversation = await Conversation.findOne({ _id: conversationId, 'members.user': userId });
  if (!conversation) throw notFound('Conversation not found.');
  return conversation;
}

export function requireGroupAdmin(conversation, userId) {
  if (conversation.type !== 'group') throw forbidden('Only group conversations have admins.');
  if (!isAdmin(conversation, userId)) throw forbidden('Only group admins can do that.');
}

// Pinning: anyone in a direct chat, admins in a group.
export function canPin(conversation, userId) {
  return conversation.type === 'direct' || isAdmin(conversation, userId);
}

export async function unreadCountFor(conversation, userId) {
  const member = conversation.members.find((m) => idOf(m.user) === String(userId));
  if (!member) return 0;
  return Message.countDocuments({
    conversation: conversation._id,
    sender: { $ne: userId },
    deleted: false,
    createdAt: { $gt: member.lastReadAt },
  });
}

// Full, viewer-specific conversation payload (members, unread count, last message).
export async function conversationPayload(conversation, userId, realtime) {
  await conversation.populate('members.user');
  const [unreadCount, last] = await Promise.all([
    unreadCountFor(conversation, userId),
    Message.findOne({ conversation: conversation._id })
      .sort({ createdAt: -1 })
      .populate('attachment'),
  ]);
  return serializeConversation(conversation, userId, realtime, {
    unreadCount,
    lastMessage: last ? serializeMessage(last, userId) : null,
  });
}

export async function listConversations(userId, realtime) {
  const conversations = await Conversation.find({ 'members.user': userId }).sort({
    lastMessageAt: -1,
    updatedAt: -1,
  });
  return Promise.all(conversations.map((c) => conversationPayload(c, userId, realtime)));
}

// Sends each member their own view of the conversation (unread counts differ).
export async function broadcastConversation(conversation, realtime, event = 'conversation:updated', userIds) {
  const targets = userIds || memberIds(conversation);
  await Promise.all(
    targets.map(async (uid) => {
      realtime.toUser(uid, event, await conversationPayload(conversation, uid, realtime));
    })
  );
}
