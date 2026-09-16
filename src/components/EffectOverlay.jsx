import { useEffect, useState } from 'react';

const EFFECT_CONFIG = {
  confetti: { emojis: ['🎉', '🎊', '✨', '⭐'], direction: 'fall', count: 30 },
  hearts: { emojis: ['❤️', '💕', '💖', '💗'], direction: 'rise', count: 24 },
  fire: { emojis: ['🔥'], direction: 'rise', count: 20 },
  balloons: { emojis: ['🎈', '🎂', '🥳'], direction: 'rise', count: 22 },
};

export default function EffectOverlay({ effect, onComplete }) {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (!effect) return;

    const config = EFFECT_CONFIG[effect.type];
    if (!config) return;

    const newParticles = Array.from({ length: config.count }).map((_, i) => ({
      id: `${effect.key}-${i}`,
      emoji: config.emojis[Math.floor(Math.random() * config.emojis.length)],
      left: Math.random() * 100,
      duration: 2 + Math.random() * 1.5,
      delay: Math.random() * 0.6,
      size: 1.2 + Math.random() * 1.4,
      drift: (Math.random() - 0.5) * 80,
    }));

    setParticles(newParticles);

    const timeout = setTimeout(() => {
      setParticles([]);
      onComplete?.();
    }, 3200);

    return () => clearTimeout(timeout);
  }, [effect, onComplete]);

  if (!effect || particles.length === 0) return null;

  const direction = EFFECT_CONFIG[effect.type]?.direction || 'fall';

  return (
    <div className="effect-overlay">
      {particles.map((p) => (
        <span
          key={p.id}
          className={`effect-particle ${direction === 'rise' ? 'rise' : 'fall'}`}
          style={{
            left: `${p.left}%`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            fontSize: `${p.size}rem`,
            '--drift': `${p.drift}px`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}