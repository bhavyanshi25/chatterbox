const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];

const escapeXml = (s) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

// Group chats have no photo: draw their initials on a colour picked from the name.
export function initialsAvatar(name = '?') {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => [...w][0] || '')
      .join('')
      .toUpperCase() || '?';
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) | 0;
  const color = COLORS[Math.abs(hash) % COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${color}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="38" font-weight="700" fill="#fff">${escapeXml(initials)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
