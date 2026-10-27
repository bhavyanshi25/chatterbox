import { isDemoAccount } from '../utils/demoAccounts.js';

const idOf = (value) => String(value?._id ?? value);

export function serializeUser(user, realtime, { includeEmail = false } = {}) {
  return {
    id: idOf(user),
    name: user.name,
    ...(includeEmail ? { email: user.email } : {}),
    avatar: user.avatar,
    bio: user.bio,
    mood: user.mood,
    online: realtime
      ? isDemoAccount(user)
        ? realtime.isDemoOnline(idOf(user))
        : realtime.isOnline(idOf(user))
      : false,
    lastSeen: user.lastSeen,
  };
}

export function serializeAttachment(attachment) {
  if (!attachment || !attachment._id) return null;
  return {
    id: idOf(attachment),
    url: `/api/attachments/${idOf(attachment)}`,
    name: attachment.originalName,
    type: attachment.mimeType,
    size: attachment.size,
  };
}

// `viewerId` adds viewer-specific fields (starred). Broadcasts to a whole
// conversation room omit it, and clients keep their own starred flag.
export function serializeMessage(message, viewerId) {
  const base = {
    id: idOf(message),
    conversationId: idOf(message.conversation),
    clientId: message.clientId,
    senderId: idOf(message.sender),
    text: message.deleted ? '' : message.text,
    image: message.deleted ? null : serializeAttachment(message.attachment),
    replyTo: message.replyTo?.messageId
      ? {
          messageId: idOf(message.replyTo.messageId),
          senderId: message.replyTo.senderId ? idOf(message.replyTo.senderId) : null,
          senderName: message.replyTo.senderName,
          text: message.replyTo.text,
        }
      : null,
    reactions: message.deleted
      ? []
      : message.reactions.map((r) => ({ emoji: r.emoji, userId: idOf(r.user) })),
    deliveredTo: message.deliveredTo.map(idOf),
    readBy: message.readBy.map(idOf),
    editedAt: message.editedAt,
    deleted: message.deleted,
    createdAt: message.createdAt,
  };
  if (viewerId) base.starred = message.starredBy.some((u) => idOf(u) === String(viewerId));
  return base;
}

export function serializeConversation(conversation, viewerId, realtime, extra = {}) {
  const me = String(viewerId);
  // Skip members whose account no longer exists (populate returns null).
  const members = conversation.members.filter((m) => m.user).map((m) => ({
    user: m.user?.name ? serializeUser(m.user, realtime) : { id: idOf(m.user) },
    role: m.role,
  }));
  const other = conversation.type === 'direct' ? members.find((m) => m.user.id !== me) : null;

  return {
    id: idOf(conversation),
    type: conversation.type,
    name: conversation.name,
    participantId: other ? other.user.id : null,
    members,
    pinnedMessageIds: conversation.pinnedMessages.map(idOf),
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    ...extra,
  };
}
