// Computes fun personal stats from the user's conversations.
export function computeChatStats(conversations, getUserById) {
  let totalSent = 0;
  let totalReceived = 0;
  let deletedCount = 0;
  let longestMessage = { text: '', length: 0 };
  const reactionCounts = {};
  const conversationCounts = [];

  conversations.forEach((conv) => {
    let count = 0;
    conv.messages.forEach((m) => {
      if (m.deleted) {
        deletedCount++;
        return;
      }
      count++;
      if (m.senderId === 'me') {
        totalSent++;
        if (m.text.length > longestMessage.length) {
          longestMessage = { text: m.text, length: m.text.length };
        }
      } else {
        totalReceived++;
      }
      if (m.reactions) {
        Object.entries(m.reactions).forEach(([emoji, c]) => {
          reactionCounts[emoji] = (reactionCounts[emoji] || 0) + c;
        });
      }
    });
    conversationCounts.push({ id: conv.id, participantId: conv.participantId, count });
  });

  const mostActive = [...conversationCounts].sort((a, b) => b.count - a.count)[0];
  const mostActiveParticipant = mostActive?.count ? getUserById(mostActive.participantId) : null;

  const favoriteEmojiEntry = Object.entries(reactionCounts).sort((a, b) => b[1] - a[1])[0];

  return {
    totalSent,
    totalReceived,
    totalMessages: totalSent + totalReceived,
    deletedCount,
    mostActiveParticipant,
    mostActiveCount: mostActive?.count || 0,
    favoriteEmoji: favoriteEmojiEntry ? favoriteEmojiEntry[0] : null,
    favoriteEmojiCount: favoriteEmojiEntry ? favoriteEmojiEntry[1] : 0,
    longestMessage: longestMessage.text,
    conversationCount: conversations.length,
  };
}