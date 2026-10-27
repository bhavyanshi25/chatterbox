import { useState, useMemo, useRef } from 'react';
import { Search, MessageSquarePlus, Users, User, RefreshCw, MessagesSquare } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { formatRelativeTime } from '../utils/formatTime';
import { getMessagePreview } from '../utils/messages';
import AvatarRing from './AvatarRing';
import { getMoodEmoji } from '../data/moods';
import { useLocalStorage } from '../hooks/useLocalStorage';
import NewGroupModal from './NewGroupModal';

const TABS = [
  { id: 'all', label: 'All', icon: MessagesSquare },
  { id: 'direct', label: 'Chats', icon: User },
  { id: 'group', label: 'Groups', icon: Users },
];

export default function Sidebar({ activeConversationId, onSelectConversation, className = '' }) {
  const {
    currentUserId,
    users,
    conversations,
    conversationsStatus,
    conversationsError,
    reloadConversations,
    getConversationInfo,
    getUserById,
    startConversationWith,
    notify,
    typingUserIds,
  } = useChat();
  const [query, setQuery] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const peopleSectionRef = useRef(null);
  // All (the original combined list), or one-to-one chats / groups on their own.
  // The last tab is remembered.
  const [tab, setTab] = useLocalStorage('chatapp_sidebar_tab', 'all');
  const activeTab = TABS.some((t) => t.id === tab) ? tab : 'all';

  const unreadByTab = useMemo(() => {
    const totals = { all: 0, direct: 0, group: 0 };
    for (const c of conversations) {
      totals[c.type] += c.unreadCount || 0;
      totals.all += c.unreadCount || 0;
    }
    return totals;
  }, [conversations]);

  const tabConversations =
    activeTab === 'all' ? conversations : conversations.filter((c) => c.type === activeTab);

  const enrichedConversations = useMemo(() => {
    const q = query.toLowerCase();
    return tabConversations
      .map((c) => ({ ...c, info: getConversationInfo(c) }))
      .filter((c) => c.info.name.toLowerCase().includes(q));
  }, [tabConversations, query, getConversationInfo]);

  // Everyone you haven't started a one-to-one chat with yet (filtered by the
  // search), so the Chats list always shows who you can talk to.
  const otherMatchingPeople = useMemo(() => {
    if (activeTab === 'group') return [];
    const existing = new Set(conversations.filter((c) => c.type === 'direct').map((c) => c.participantId));
    return users.filter(
      (u) => !existing.has(u.id) && u.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [users, conversations, query, activeTab]);

  const handleStartNew = async (userId) => {
    try {
      const id = await startConversationWith(userId);
      setQuery('');
      onSelectConversation(id);
    } catch (err) {
      notify(err.message);
    }
  };

  const handleNewChat = () => {
    peopleSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const previewFor = (c) => {
    const typing = Object.keys(typingUserIds[c.id] || {});
    if (typing.length > 0) {
      return c.type === 'group'
        ? `${getUserById(typing[0])?.name?.split(' ')[0] || 'Someone'} is typing…`
        : 'typing…';
    }
    const last = c.lastMessage;
    if (!last) return c.type === 'group' ? 'Group created — say hi 👋' : 'Say hi 👋';
    const mine = last.senderId === currentUserId;
    const prefix = mine
      ? 'You: '
      : c.type === 'group'
        ? `${getUserById(last.senderId)?.name?.split(' ')[0] || 'Someone'}: `
        : '';
    return `${prefix}${getMessagePreview(last)}`;
  };

  const noResultsAtAll =
    conversationsStatus === 'ready' &&
    enrichedConversations.length === 0 &&
    otherMatchingPeople.length === 0;

  return (
    <aside className={`sidebar ${className}`}>
      <div className="sidebar-search">
        <Search size={16} className="sidebar-search-icon" />
        <input
          type="text"
          placeholder={
            activeTab === 'group'
              ? 'Search groups'
              : activeTab === 'direct'
                ? 'Search chats or people'
                : 'Search conversations or people'
          }
          className="input-field sidebar-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="sidebar-tabs" role="tablist" aria-label="Conversation type">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            className={`sidebar-tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={15} />
            {label}
            {unreadByTab[id] > 0 && <span className="badge">{unreadByTab[id]}</span>}
          </button>
        ))}
      </div>

      {(activeTab === 'direct' || activeTab === 'group') && (
        <div className="sidebar-actions">
          {activeTab === 'direct' ? (
            <button type="button" className="btn btn-ghost sidebar-action-btn" onClick={handleNewChat}>
              <MessageSquarePlus size={15} /> New chat
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost sidebar-action-btn"
              onClick={() => setShowNewGroup(true)}
            >
              <Users size={15} /> Create group
            </button>
          )}
        </div>
      )}

      <div className="sidebar-list">
        {conversationsStatus === 'loading' && (
          <div className="sidebar-skeleton" aria-label="Loading conversations">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="sidebar-skeleton-row">
                <span className="skeleton-circle" />
                <span className="skeleton-lines">
                  <span />
                  <span />
                </span>
              </div>
            ))}
          </div>
        )}

        {conversationsStatus === 'error' && (
          <div className="sidebar-empty">
            <p>Couldn't load your conversations.</p>
            <p className="sidebar-empty-detail">{conversationsError}</p>
            <button className="btn btn-ghost sidebar-retry" onClick={reloadConversations}>
              <RefreshCw size={14} /> Try again
            </button>
          </div>
        )}

        {conversationsStatus === 'ready' && tabConversations.length === 0 && !query && activeTab === 'group' && (
          <div className="sidebar-empty">
            <p>No groups yet.</p>
            <p className="sidebar-empty-detail">Create a group to start a conversation.</p>
          </div>
        )}

        {conversationsStatus === 'ready' && tabConversations.length === 0 && otherMatchingPeople.length === 0 && !query && activeTab === 'all' && (
          <div className="sidebar-empty">
            <p>No conversations yet.</p>
            <p className="sidebar-empty-detail">Start a chat or create a group above.</p>
          </div>
        )}

        {conversationsStatus === 'ready' && tabConversations.length === 0 && otherMatchingPeople.length === 0 && !query && activeTab === 'direct' && (
          <div className="sidebar-empty">
            <p>No one to chat with yet.</p>
            <p className="sidebar-empty-detail">
              People show up here as soon as they create an account.
            </p>
          </div>
        )}

        {noResultsAtAll && query && <p className="sidebar-empty">No matches found.</p>}

        {enrichedConversations.map((c) => {
          const moodEmoji = getMoodEmoji(c.info.mood);
          return (
            <button
              key={c.id}
              className={`sidebar-item ${c.id === activeConversationId ? 'active' : ''}`}
              onClick={() => onSelectConversation(c.id)}
              aria-current={c.id === activeConversationId ? 'page' : undefined}
            >
              <AvatarRing
                src={c.info.avatar}
                alt={c.info.name}
                online={c.info.online}
                showStatus={!c.info.isGroup}
                size={46}
              />

              <div className="sidebar-item-content">
                <div className="sidebar-item-top">
                  <span className="sidebar-item-name">
                    {c.info.name}
                    {moodEmoji && moodEmoji !== '💬' && (
                      <span className="sidebar-mood-emoji">{moodEmoji}</span>
                    )}
                  </span>
                  {c.lastMessage && (
                    <span className="sidebar-item-time">
                      {formatRelativeTime(c.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <div className="sidebar-item-bottom">
                  <span className="sidebar-item-preview">{previewFor(c)}</span>
                  {c.unreadCount > 0 && <span className="badge">{c.unreadCount}</span>}
                </div>
              </div>
            </button>
          );
        })}

        {otherMatchingPeople.length > 0 && (
          <section ref={peopleSectionRef}>
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
          </section>
        )}
      </div>

      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreated={(id) => {
            setShowNewGroup(false);
            onSelectConversation(id);
          }}
        />
      )}
    </aside>
  );
}
