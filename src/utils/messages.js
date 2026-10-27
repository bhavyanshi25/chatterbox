// Turns a stored message (server shape, or a local pending one) into what
// MessageBubble renders: counts per reaction, whether it's mine, and the
// sent / delivered / read state as seen by the sender.

export function getOtherMemberIds(conversation, myId) {
  return (conversation?.members || []).map((m) => m.user.id).filter((id) => id !== myId);
}

export function getMessageStatus(message, conversation, myId) {
  if (message.failed) return 'failed';
  if (message.pending) return 'pending';
  const others = getOtherMemberIds(conversation, myId);
  if (others.length === 0) return 'sent';
  const readBy = new Set(message.readBy || []);
  if (others.every((id) => readBy.has(id))) return 'read';
  const delivered = new Set([...(message.deliveredTo || []), ...readBy]);
  if (others.every((id) => delivered.has(id))) return 'delivered';
  return 'sent';
}

export function toViewMessage(message, conversation, myId, getUserById) {
  const reactions = {};
  const myReactions = [];
  for (const r of message.reactions || []) {
    reactions[r.emoji] = (reactions[r.emoji] || 0) + 1;
    if (r.userId === myId) myReactions.push(r.emoji);
  }
  const isMine = message.senderId === myId;
  return {
    ...message,
    timestamp: message.createdAt,
    isMine,
    senderName: isMine ? 'You' : getUserById(message.senderId)?.name || 'Former member',
    status: isMine ? getMessageStatus(message, conversation, myId) : null,
    replyTo: message.replyTo
      ? { ...message.replyTo, senderName: message.replyTo.senderId === myId ? 'You' : message.replyTo.senderName }
      : null,
    reactions,
    myReactions,
  };
}

export function getMessagePreview(message) {
  if (!message) return '';
  if (message.deleted) return 'This message was deleted';
  if (message.image) return message.text ? `📷 ${message.text}` : '📷 Photo';
  return message.text;
}

export function createClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `c${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
}
