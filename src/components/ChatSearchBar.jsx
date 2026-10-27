import { useState, useMemo } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

function findMatches(messages, query) {
  if (!query.trim()) return [];
  const lower = query.toLowerCase();
  return messages.filter((m) => !m.deleted && m.text?.toLowerCase().includes(lower));
}

export default function ChatSearchBar({ messages, onJumpToMessage, onClose }) {
  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  const matches = useMemo(
    () => findMatches(messages, query),
    [query, messages]
  );
  // Messages can change (edits/deletes) while searching — keep the index in range.
  const safeIndex = matches.length === 0 ? 0 : Math.min(currentIndex, matches.length - 1);

  const handleQueryChange = (value) => {
    setQuery(value);
    setCurrentIndex(0);
    const next = findMatches(messages, value);
    if (next.length > 0) onJumpToMessage(next[0].id);
  };

  const goNext = () => {
    if (matches.length === 0) return;
    const next = (safeIndex + 1) % matches.length;
    setCurrentIndex(next);
    onJumpToMessage(matches[next].id);
  };

  const goPrev = () => {
    if (matches.length === 0) return;
    const prev = (safeIndex - 1 + matches.length) % matches.length;
    setCurrentIndex(prev);
    onJumpToMessage(matches[prev].id);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) goPrev();
      else goNext();
    }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="chat-search-bar fade-in">
      <Search size={16} className="chat-search-icon" />
      <input
        type="text"
        className="chat-search-input"
        placeholder="Search loaded messages"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      {query.trim() && (
        <span className="chat-search-count">
          {matches.length === 0 ? '0 results' : `${safeIndex + 1} of ${matches.length}`}
        </span>
      )}
      <button className="chat-search-nav-btn" onClick={goPrev} disabled={matches.length === 0} aria-label="Previous match">
        <ChevronUp size={16} />
      </button>
      <button className="chat-search-nav-btn" onClick={goNext} disabled={matches.length === 0} aria-label="Next match">
        <ChevronDown size={16} />
      </button>
      <button className="chat-search-nav-btn" onClick={onClose} aria-label="Close search">
        <X size={16} />
      </button>
    </div>
  );
}
