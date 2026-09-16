import { useState, useMemo } from 'react';
import { Search, MessageSquarePlus } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { formatRelativeTime } from '../utils/formatTime';
import AvatarRing from './AvatarRing';
import { getMoodEmoji } from '../data/moods';

export default function Sidebar({ onSelectConversation, className = '' }) {
  const {
    users,
    conversations,
    getUserById,
    activeConversationId,
    setActiveConversationId,
    markConversationRead,
    startConversationWith,
  } = useChat();
  const [query, setQuery] = useState('');

  const enrichedConversations = useMemo(() => {
    return conversations
      .map((c) => {
        const participant = getUserById(c.participantId);
        const lastMessage = c.messages[c.messages.length - 1];
        return { ...c, participant, lastMessage };
      })
      .filter((c) =>
        c.participant?.name.toLowerCase().includes(query.toLowerCase())
      )
      .sort((a, b) => {
        const aTime = a.lastMessage ? new Date(a.lastMessage.timestamp) : 0;
        const bTime = b.lastMessage ? new Date(b.lastMessage.timestamp) : 0;
        return bTime - aTime;
      });
  }, [conversations, query, getUserById]);

  // People matching the search who don't have a conversation yet —
  // only shown once the user actually types something.
  const otherMatchingPeople = useMemo(() => {
    if (!query.trim()) return [];
    const existingParticipantIds = new Set(conversations.map((c) => c.participantId));
    return users.filter(
      (u) =>
        !existingParticipantIds.has(u.id) &&
        u.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [users, conversations, query]);

  const handleSelect = (id) => {
    setActiveConversationId(id);
    markConversationRead(id);
    onSelectConversation?.();
  };

  const handleStartNew = (userId) => {
    startConversationWith(userId);
    setQuery('');
    onSelectConversation?.();
  };

  const noResultsAtAll = enrichedConversations.length === 0 && otherMatchingPeople.length === 0;

  return (
    <aside className={`sidebar ${className}`}>
      <div className="sidebar-search">
        <Search size={16} className="sidebar-search-icon" />
        <input
          type="text"
          placeholder="Search conversations or people"
          className="input-field sidebar-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="sidebar-list">
        {noResultsAtAll && <p className="sidebar-empty">No matches found.</p>}

        {enrichedConversations.map((c) => {
          const moodEmoji = getMoodEmoji(c.participant?.mood);
          return (
            <button
              key={c.id}
              className={`sidebar-item ${c.id === activeConversationId ? 'active' : ''}`}
              onClick={() => handleSelect(c.id)}
            >
              <AvatarRing
                src={c.participant?.avatar}
                alt={c.participant?.name}
                online={c.participant?.online}
                size={46}
              />

              <div className="sidebar-item-content">
                <div className="sidebar-item-top">
                  <span className="sidebar-item-name">
                    {c.participant?.name}
                    {moodEmoji && moodEmoji !== '💬' && (
                      <span className="sidebar-mood-emoji">{moodEmoji}</span>
                    )}
                  </span>
                  {c.lastMessage && (
                    <span className="sidebar-item-time">
                      {formatRelativeTime(c.lastMessage.timestamp)}
                    </span>
                  )}
                </div>
                <div className="sidebar-item-bottom">
                  <span className="sidebar-item-preview">
                    {c.lastMessage
                      ? `${c.lastMessage.senderId === 'me' ? 'You: ' : ''}${c.lastMessage.text}`
                      : 'Say hi 👋'}
                  </span>
                  {c.unreadCount > 0 && <span className="badge">{c.unreadCount}</span>}
                </div>
              </div>
            </button>
          );
        })}

        {otherMatchingPeople.length > 0 && (
          <>
            <p className="sidebar-section-label">People</p>
            {otherMatchingPeople.map((u) => {
              const moodEmoji = getMoodEmoji(u.mood);
              return (
                <button
                  key={u.id}
                  className="sidebar-item sidebar-item-person"
                  onClick={() => handleStartNew(u.id)}
                >
                  <AvatarRing src={u.avatar} alt={u.name} online={u.online} size={46} />

                  <div className="sidebar-item-content">
                    <div className="sidebar-item-top">
                      <span className="sidebar-item-name">
                        {u.name}
                        {moodEmoji && moodEmoji !== '💬' && (
                          <span className="sidebar-mood-emoji">{moodEmoji}</span>
                        )}
                      </span>
                    </div>
                    <div className="sidebar-item-bottom">
                      <span className="sidebar-item-preview sidebar-item-new-chat">
                        <MessageSquarePlus size={13} /> Start a conversation
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>
    </aside>
  );
}