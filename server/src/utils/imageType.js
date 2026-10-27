// Identifies an image from its first bytes, so a renamed .exe can't slip
// through just by claiming `Content-Type: image/png`.
const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  },
  { mime: 'image/gif', ext: 'gif', test: (b) => ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6)) },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

export const ALLOWED_IMAGE_TYPES = SIGNATURES.map((s) => s.mime);

export function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buffer)) || null;
}
