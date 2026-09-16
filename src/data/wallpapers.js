export const WALLPAPERS = [
  {
    id: 'default',
    name: 'Default',
    background: 'none',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    background: 'linear-gradient(160deg, #ff9a7b 0%, #ff6a88 45%, #a86bd6 100%)',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    background: 'linear-gradient(160deg, #7fd6e0 0%, #4facfe 55%, #2b6cb0 100%)',
  },
  {
    id: 'forest',
    name: 'Forest',
    background: 'linear-gradient(160deg, #a8e063 0%, #56ab2f 60%, #2f6b1f 100%)',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    background: 'linear-gradient(160deg, #e0c3fc 0%, #b993f4 55%, #7b5fc4 100%)',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    background: 'linear-gradient(160deg, #232946 0%, #121629 60%, #0a0c17 100%)',
  },
  {
    id: 'dots',
    name: 'Dotted',
    background:
      'radial-gradient(circle, rgba(99,102,241,0.25) 1.5px, transparent 1.5px)',
    backgroundSize: '18px 18px',
  },
  {
    id: 'waves',
    name: 'Waves',
    background:
      'repeating-linear-gradient(135deg, rgba(99,102,241,0.08) 0px, rgba(99,102,241,0.08) 2px, transparent 2px, transparent 14px)',
  },
];

export function getWallpaper(id) {
  return WALLPAPERS.find((w) => w.id === id) || WALLPAPERS[0];
}