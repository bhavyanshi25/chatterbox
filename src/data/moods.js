export const MOODS = [
  { id: 'none', emoji: '💬', label: 'No status' },
  { id: 'happy', emoji: '😄', label: 'Feeling good' },
  { id: 'focused', emoji: '🎯', label: 'Focused' },
  { id: 'sleepy', emoji: '😴', label: 'Sleepy' },
  { id: 'celebrating', emoji: '🎉', label: 'Celebrating' },
  { id: 'busy', emoji: '⚡', label: 'Busy' },
  { id: 'chilling', emoji: '🌴', label: 'Chilling' },
  { id: 'love', emoji: '🥰', label: 'In love' },
];

export function getMoodEmoji(moodId) {
  return MOODS.find((m) => m.id === moodId)?.emoji || null;
}