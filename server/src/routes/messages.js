import { Router } from 'express';
import { z } from 'zod';
import { Attachment } from '../models/Attachment.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { objectId, parse } from '../middleware/validate.js';
import { badRequest, forbidden } from '../utils/errors.js';
import { getVisibleMessage, MAX_MESSAGE_LENGTH } from '../services/messages.js';
import { serializeMessage } from '../services/serialize.js';
import { broadcastConversation } from '../services/conversations.js';

const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '🙏'];

const editSchema = z.object({
  text: z.string().max(MAX_MESSAGE_LENGTH, `Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`),
});
const reactionSchema = z.object({ emoji: z.enum(ALLOWED_REACTIONS, 'Unsupported reaction.') });
const starredQuery = z.object({ conversationId: objectId.optional() });

const idOf = (value) => String(value?._id ?? value);

export function messagesRouter(realtime, storage) {
  const router = Router();

  const broadcastUpdate = (message) =>
    realtime.toConversation(idOf(message.conversation), 'message:updated', {
      message: serializeMessage(message),
    });

  // Every message the current user starred, newest first (optionally per conversation).
  router.get('/starred', async (req, res) => {
    const { conversationId } = parse(starredQuery, req.query);
    const myConversations = await Conversation.find({ 'members.user': req.user._id }).select('_id');
    const allowed = myConversations.map((c) => c._id);
    const filter = {
      starredBy: req.user._id,
      deleted: false,
      conversation: conversationId
        ? { $in: allowed.filter((id) => idOf(id) === conversationId) }
        : { $in: allowed },
    };
    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('attachment')
      .populate('sender', 'name avatar');
    res.json({
      messages: messages.map((m) => ({
        ...serializeMessage(m, req.user._id),
        senderName: m.sender?.name || 'Unknown',
      })),
    });
  });

  router.patch('/:id', async (req, res) => {
    const { message } = await getVisibleMessage(req.params.id, req.user._id);
    if (idOf(message.sender) !== idOf(req.user)) throw forbidden('You can only edit your own messages.');
    if (message.deleted) throw badRequest('Deleted messages cannot be edited.');
    const text = parse(editSchema, req.body).text.trim();
    if (!text && !message.attachment) throw badRequest('Message cannot be empty.');
    if (text !== message.text) {
      message.text = text;
      message.editedAt = new Date();
      await message.save();
      broadcastUpdate(message);
    }
    res.json({ message: serializeMessage(message, req.user._id) });
  });

  // Soft delete: the bubble stays as "This message was deleted". The image
  // file itself is removed from storage.
  router.delete('/:id', async (req, res) => {
    const { message, conversation } = await getVisibleMessage(req.params.id, req.user._id);
    if (idOf(message.sender) !== idOf(req.user)) throw forbidden('You can only delete your own messages.');
    if (!message.deleted) {
      const attachment = message.attachment;
      message.deleted = true;
      message.text = '';
      message.reactions = [];
      message.attachment = null;
      message.starredBy = [];
      await message.save();
      if (attachment?._id) {
        await storage.remove(attachment.storageKey);
        await Attachment.deleteOne({ _id: attachment._id });
      }
      if (conversation.pinnedMessages.some((id) => idOf(id) === idOf(message))) {
        conversation.pinnedMessages = conversation.pinnedMessages.filter((id) => idOf(id) !== idOf(message));
        await conversation.save();
        await broadcastConversation(conversation, realtime);
      }
      broadcastUpdate(message);
    }
    res.json({ message: serializeMessage(message, req.user._id) });
  });

  // Toggles the current user's reaction with this emoji.
  router.post('/:id/reactions', async (req, res) => {
    const { message } = await getVisibleMessage(req.params.id, req.user._id);
    if (message.deleted) throw badRequest("You can't react to a deleted message.");
    const { emoji } = parse(reactionSchema, req.body);
    const me = idOf(req.user);
    const has = message.reactions.some((r) => r.emoji === emoji && idOf(r.user) === me);
    const update = has
      ? { $pull: { reactions: { emoji, user: req.user._id } } }
      : { $addToSet: { reactions: { emoji, user: req.user._id } } };
    const updated = await Message.findByIdAndUpdate(message._id, update, { returnDocument: 'after' }).populate('attachment');
    broadcastUpdate(updated);
    res.json({ message: serializeMessage(updated, req.user._id) });
  });

  const setStar = (starred) => async (req, res) => {
    const { message } = await getVisibleMessage(req.params.id, req.user._id);
    if (message.deleted && starred) throw badRequest("You can't star a deleted message.");
    const updated = await Message.findByIdAndUpdate(
      message._id,
      starred ? { $addToSet: { starredBy: req.user._id } } : { $pull: { starredBy: req.user._id } },
      { returnDocument: 'after' }
    ).populate('attachment');
    const payload = serializeMessage(updated, req.user._id);
    // Stars are private — only the user's own sessions hear about them.
    realtime.toUser(idOf(req.user), 'message:starred', {
      conversationId: payload.conversationId,
      messageId: payload.id,
      starred,
    });
    res.json({ message: payload });
  };

  router.put('/:id/star', setStar(true));
  router.delete('/:id/star', setStar(false));

  return router;
}

export { ALLOWED_REACTIONS };
