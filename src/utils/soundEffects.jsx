// Lightweight sound effects using the Web Audio API.
// No external audio files required.

let audioCtx;

function getContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playTone({ frequency, duration, type = 'sine', volume = 0.15, delay = 0 }) {
  try {
    const ctx = getContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + delay);

    gainNode.gain.setValueAtTime(0, ctx.currentTime + delay);
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(ctx.currentTime + delay);
    oscillator.stop(ctx.currentTime + delay + duration);
  } catch (e) {
    // Audio isn't critical to functionality — fail silently if blocked.
  }
}

export function playSendSound() {
  playTone({ frequency: 700, duration: 0.08, type: 'sine', volume: 0.12 });
  playTone({ frequency: 1000, duration: 0.1, type: 'sine', volume: 0.1, delay: 0.06 });
}

export function playReceiveSound() {
  playTone({ frequency: 500, duration: 0.09, type: 'sine', volume: 0.12 });
  playTone({ frequency: 350, duration: 0.12, type: 'sine', volume: 0.1, delay: 0.07 });
}

export function playEffectSound() {
  playTone({ frequency: 600, duration: 0.06, type: 'triangle', volume: 0.1 });
  playTone({ frequency: 800, duration: 0.06, type: 'triangle', volume: 0.1, delay: 0.05 });
  playTone({ frequency: 1000, duration: 0.08, type: 'triangle', volume: 0.1, delay: 0.1 });
}