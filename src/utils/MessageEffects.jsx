// Detects "trigger" keywords/emojis in a message and returns which
// full-screen effect (if any) should play.

const EFFECT_RULES = [
  {
    type: 'confetti',
    emojis: ['🎉', '🎊', '✨', '🎈'],
    keywords: ['congrats', 'congratulations', 'we did it', 'yay'],
  },
  {
    type: 'hearts',
    emojis: ['❤️', '💕', '💖', '😍'],
    keywords: ['love you', 'i love', 'love ya'],
  },
  {
    type: 'fire',
    emojis: ['🔥'],
    keywords: ['lit', 'fire', 'on fire'],
  },
  {
    type: 'balloons',
    emojis: ['🎂', '🥳'],
    keywords: ['happy birthday', 'birthday'],
  },
];

export function detectEffect(text) {
  const lower = text.toLowerCase();

  for (const rule of EFFECT_RULES) {
    const hasKeyword = rule.keywords.some((k) => lower.includes(k));
    const hasEmoji = rule.emojis.some((e) => text.includes(e));
    if (hasKeyword || hasEmoji) {
      return rule.type;
    }
  }
  return null;
}