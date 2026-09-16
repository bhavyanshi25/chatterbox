import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, MessageSquarePlus } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import AvatarRing from './AvatarRing';
import { getMoodEmoji } from '../data/moods';

export default function ContactsPage() {
  const navigate = useNavigate();
  const { users, startConversationWith } = useChat();
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase())),
    [users, query]
  );

  const handleMessage = (userId) => {
    startConversationWith(userId);
    navigate('/chat');
  };

  return (
    <div className="contacts-page">
      <header className="contacts-page-header">
        <button className="btn-ghost profile-back" onClick={() => navigate('/chat')}>
          <ArrowLeft size={18} /> Back to chat
        </button>
      </header>

      <div className="contacts-container slide-up">
        <h1 className="contacts-title">People</h1>
        <p className="contacts-subtitle">Browse everyone on ChatterBox and start a conversation.</p>

        <div className="contacts-search">
          <Search size={16} className="sidebar-search-icon" />
          <input
            type="text"
            className="input-field sidebar-search-input"
            placeholder="Search people"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="contacts-list">
          {filtered.length === 0 && <p className="sidebar-empty">No one matches that search.</p>}

          {filtered.map((u) => {
            const moodEmoji = getMoodEmoji(u.mood);
            return (
              <div key={u.id} className="contact-card pop-in">
                <AvatarRing src={u.avatar} alt={u.name} online={u.online} size={52} />

                <div className="contact-card-info">
                  <span className="contact-card-name">
                    {u.name}
                    {moodEmoji && moodEmoji !== '💬' && (
                      <span className="sidebar-mood-emoji">{moodEmoji}</span>
                    )}
                    {u.isGroup && <span className="contact-card-badge">Group</span>}
                  </span>
                  <span className="contact-card-status">
                    {u.online ? 'Online now' : 'Offline'}
                  </span>
                </div>

                <button
                  className="btn btn-primary contact-card-btn"
                  onClick={() => handleMessage(u.id)}
                >
                  <MessageSquarePlus size={15} /> Message
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}