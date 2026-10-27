import { useEffect } from 'react';

const EFFECT_DURATION = 3200;

// `effect` is { type, key, direction, particles } — particles are generated once
// in ChatContext.triggerEffect so rendering stays pure.
export default function EffectOverlay({ effect, onComplete }) {
  useEffect(() => {
    if (!effect) return;
    const timeout = setTimeout(() => onComplete?.(), EFFECT_DURATION);
    return () => clearTimeout(timeout);
  }, [effect, onComplete]);

  if (!effect?.particles?.length) return null;

  return (
    <div className="effect-overlay" aria-hidden="true">
      {effect.particles.map((p) => (
        <span
          key={p.id}
          className={`effect-particle ${effect.direction === 'rise' ? 'rise' : 'fall'}`}
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
