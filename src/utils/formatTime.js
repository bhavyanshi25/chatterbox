export function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

export function formatMessageTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatLastSeen(isoString) {
  if (!isoString) return 'Offline';
  const rel = formatRelativeTime(isoString);
  if (rel === 'now') return 'Last seen just now';
  return /\d+[mhd]$/.test(rel) ? `Last seen ${rel} ago` : `Last seen ${rel}`;
}

// Local calendar-day key, so messages are grouped by the user's own timezone.
export function getDayKey(isoString) {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// "Today", "Yesterday", or e.g. "Monday, September 14" (year added if not this year).
export function formatDateDivider(isoString, now = new Date()) {
  const date = new Date(isoString);
  const dayKey = getDayKey(isoString);
  if (dayKey === getDayKey(now.toISOString())) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey === getDayKey(yesterday.toISOString())) return 'Yesterday';

  return date.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}
