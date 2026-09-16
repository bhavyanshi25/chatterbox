import { useState, useMemo, useEffect } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

export default function ChatSearchBar({ conversation, onJumpToMessage, onClose }) {
  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return conversation.messages.filter((m) => !m.deleted && m.text.toLowerCase().includes(lower));
  }, [query, conversation.messages]);

  useEffect(() => {
    setCurrentIndex(0);
    if (matches.length > 0) {
      onJumpToMessage(matches[0].id);
    }
  }, [matches]);

  const goNext = () => {
    if (matches.length === 0) return;
    const next = (currentIndex + 1) % matches.length;
    setCurrentIndex(next);
    onJumpToMessage(matches[next].id);
  };

  const goPrev = () => {
    if (matches.length === 0) return;
    const prev = (currentIndex - 1 + matches.length) % matches.length;
    setCurrentIndex(prev);
    onJumpToMessage(matches[prev].id);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.shiftKey ? goPrev() : goNext();
    }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="chat-search-bar fade-in">
      <Search size={16} className="chat-search-icon" />
      <input
        type="text"
        className="chat-search-input"
        placeholder="Search in this conversation"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      {query.trim() && (
        <span className="chat-search-count">
          {matches.length === 0 ? '0 results' : `${currentIndex + 1} of ${matches.length}`}
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