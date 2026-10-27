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
const EFFECT_CONFIG = {
  confetti: { emojis: ['🎉', '🎊', '✨', '⭐'], direction: 'fall', count: 30 },
  hearts: { emojis: ['❤️', '💕', '💖', '💗'], direction: 'rise', count: 24 },
  fire: { emojis: ['🔥'], direction: 'rise', count: 20 },
  balloons: { emojis: ['🎈', '🎂', '🥳'], direction: 'rise', count: 22 },
};

let nextEffectKey = 0;

// Builds the full-screen effect object (with randomized particles) for EffectOverlay.
export function createEffect(type) {
  const config = EFFECT_CONFIG[type];
  if (!config) return null;
  const key = ++nextEffectKey;
  return {
    type,
    key,
    direction: config.direction,
    particles: Array.from({ length: config.count }, (_, i) => ({
      id: `${key}-${i}`,
      emoji: config.emojis[Math.floor(Math.random() * config.emojis.length)],
      left: Math.random() * 100,
      duration: 2 + Math.random() * 1.5,
      delay: Math.random() * 0.6,
      size: 1.2 + Math.random() * 1.4,
      drift: (Math.random() - 0.5) * 80,
    })),
  };
}
