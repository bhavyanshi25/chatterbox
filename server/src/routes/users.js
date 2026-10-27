import { Router } from 'express';
import { z } from 'zod';
import { User, MOOD_IDS } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { parse } from '../middleware/validate.js';
import { serializeUser } from '../services/serialize.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const profileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(60),
    bio: z.string().trim().max(140, 'Bio can be at most 140 characters.'),
    avatar: z
      .string()
      .trim()
      .max(500)
      .refine((v) => /^https?:\/\/\S+$/i.test(v), 'Avatar must be an http(s) image URL.'),
    mood: z.enum(MOOD_IDS),
  })
  .partial()
  .strict();

export function usersRouter(realtime) {
  const router = Router();

  // Directory of everyone else (for Contacts and starting chats).
  router.get('/', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const filter = { _id: { $ne: req.user._id } };
    if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' };
    const users = await User.find(filter).sort({ name: 1 }).limit(200);
    res.json({ users: users.map((u) => serializeUser(u, realtime)) });
  });

  router.patch('/me', async (req, res) => {
    const updates = parse(profileSchema, req.body);
    Object.assign(req.user, updates);
    await req.user.save();
    realtime.toAll('user:updated', { user: serializeUser(req.user, realtime) });
    res.json({ user: serializeUser(req.user, realtime, { includeEmail: true }) });
  });

  // Numbers for the "Wrapped" recap, computed from the user's real history.
  router.get('/me/stats', async (req, res) => {
    const me = req.user._id;
    const conversations = await Conversation.find({ 'members.user': me }).populate('members.user');
    const convIds = conversations.map((c) => c._id);

    const [sent, received, deletedCount, perConversation, longest, reactionAgg] = await Promise.all([
      Message.countDocuments({ conversation: { $in: convIds }, sender: me, deleted: false }),
      Message.countDocuments({ conversation: { $in: convIds }, sender: { $ne: me }, deleted: false }),
      Message.countDocuments({ conversation: { $in: convIds }, sender: me, deleted: true }),
      Message.aggregate([
        { $match: { conversation: { $in: convIds }, deleted: false } },
        { $group: { _id: '$conversation', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]),
      Message.aggregate([
        { $match: { conversation: { $in: convIds }, sender: me, deleted: false } },
        { $project: { text: 1, len: { $strLenCP: '$text' } } },
        { $sort: { len: -1 } },
        { $limit: 1 },
      ]),
      Message.aggregate([
        { $match: { conversation: { $in: convIds } } },
        { $unwind: '$reactions' },
        { $match: { 'reactions.user': me } },
        { $group: { _id: '$reactions.emoji', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]),
    ]);

    let mostActive = null;
    if (perConversation[0]) {
      const conv = conversations.find((c) => String(c._id) === String(perConversation[0]._id));
      const other =
        conv?.type === 'direct'
          ? conv.members.find((m) => String(m.user._id) !== String(me))?.user
          : null;
      mostActive = conv && {
        name: conv.type === 'group' ? conv.name : other?.name || 'Someone',
        avatar: conv.type === 'group' ? null : other?.avatar || null,
        count: perConversation[0].count,
      };
    }

    res.json({
      stats: {
        totalSent: sent,
        totalReceived: received,
        totalMessages: sent + received,
        deletedCount,
        mostActiveParticipant: mostActive ? { name: mostActive.name, avatar: mostActive.avatar } : null,
        mostActiveCount: mostActive?.count || 0,
        favoriteEmoji: reactionAgg[0]?._id || null,
        favoriteEmojiCount: reactionAgg[0]?.count || 0,
        longestMessage: longest[0]?.text || '',
        conversationCount: conversations.length,
      },
    });
  });

  return router;
}
