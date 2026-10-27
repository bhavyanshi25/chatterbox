import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEffect, detectEffect } from './messageEffects.js';

describe('message effects', () => {
  it('detects celebration emojis and case-insensitive keywords', () => {
    assert.equal(detectEffect('🎉'), 'confetti');
    assert.equal(detectEffect('CONGRATULATIONS!'), 'confetti');
    assert.equal(detectEffect('We did it!'), 'confetti');
  });

  it('detects the other supported message effects', () => {
    assert.equal(detectEffect('I love you ❤️'), 'hearts');
    assert.equal(detectEffect('That is fire 🔥'), 'fire');
    assert.equal(detectEffect('Happy birthday!'), 'balloons');
  });

  it('does not trigger an effect for ordinary messages', () => {
    assert.equal(detectEffect('See you tomorrow.'), null);
  });

  it('creates fresh confetti particles for each trigger', () => {
    const first = createEffect('confetti');
    const second = createEffect('confetti');

    assert.equal(first.type, 'confetti');
    assert.equal(first.direction, 'fall');
    assert.equal(first.particles.length, 30);
    assert.notEqual(first.key, second.key);
    assert.equal(new Set(first.particles.map((particle) => particle.id)).size, 30);
    assert.ok(first.particles.every((particle) => particle.emoji && particle.duration > 0));
  });

  it('ignores unknown effects', () => {
    assert.equal(createEffect('unknown'), null);
  });
});
