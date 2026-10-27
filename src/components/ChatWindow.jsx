import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowDown,
  Search,
  Phone,
  Video,
  MessageSquareOff,
  Info,
  Pin,
  X,
  RefreshCw,
} from 'lucide-react';
import { useChat } from '../context/ChatContext';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import AvatarRing from './AvatarRing';
import WallpaperPicker from './WallpaperPicker';
import ChatSearchBar from './ChatSearchBar';
import GroupInfoModal from './GroupInfoModal';
import { getMoodEmoji } from '../data/moods';
import { getWallpaper } from '../data/wallpapers';
import { formatDateDivider, formatLastSeen, getDayKey } from '../utils/formatTime';
import { getMessagePreview, toViewMessage } from '../utils/messages';

// How close (px) to the bottom still counts as "at the latest messages".
const NEAR_BOTTOM_THRESHOLD = 120;
const EMPTY_ENTRY = { items: [], hasMore: false, status: 'idle', error: '' };

// Rendered with key={conversationId}, so all local state (reply, search,
// editing, scroll position) resets automatically when switching chats.
export default function ChatWindow({ conversationId, onBack, className = '' }) {
  const {
    currentUserId,
    conversations,
    conversationsStatus,
    messagesByConversation,
    loadMessages,
    getUserById,
    getConversationInfo,
    typingUserIds,
    getConversationWallpaper,
    editMessage,
    setPinned,
    retryMessage,
    discardMessage,
    notify,
  } = useChat();
  const location = useLocation();
  const navigate = useNavigate();
  const messagesRef = useRef(null);
  const nearBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [callNotice, setCallNotice] = useState(null);
  const [pinIndex, setPinIndex] = useState(0);
  // A message to scroll to once it's loaded (from pins or search).
  const [pendingJumpId, setPendingJumpId] = useState(() => location.state?.jumpTo ?? null);

  const conversation = conversations.find((c) => c.id === conversationId);
  const info = getConversationInfo(conversation);
  const entry = messagesByConversation[conversationId] || EMPTY_ENTRY;
  const rawMessages = entry.items;
  const loaded = entry.status === 'loaded';

  // Memoized by the React Compiler.
  const messages = rawMessages.map((m) => toViewMessage(m, conversation, currentUserId, getUserById));

  const typingNames = Object.keys(typingUserIds[conversationId] || {}).map(
    (id) => getUserById(id)?.name?.split(' ')[0] || 'Someone'
  );
  const isTyping = typingNames.length > 0;
  const moodEmoji = getMoodEmoji(info?.mood);
  const lastMessage = messages[messages.length - 1];
  const lastMessageId = lastMessage?.id;
  const lastMessageIsMine = Boolean(lastMessage?.isMine);
  const myRole = conversation?.members.find((m) => m.user.id === currentUserId)?.role;
  const canPin = conversation?.type === 'direct' || myRole === 'admin';
  const pinnedIds = conversation?.pinnedMessageIds || [];

  // Fetch history the first time this conversation is opened.
  const conversationExists = Boolean(conversation);
  const entryStatus = entry.status;
  useEffect(() => {
    if (conversationExists && entryStatus === 'idle') loadMessages(conversationId);
  }, [conversationExists, entryStatus, conversationId, loadMessages]);

  // Open the conversation at the latest message once history arrives.
  useLayoutEffect(() => {
    if (!loaded || didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [loaded]);

  // Follow new messages only if the user is already at the bottom (or sent it
  // themselves) — never yank them away while they're reading older messages.
  useEffect(() => {
    if (!lastMessageId) return;
    if (!lastMessageIsMine && !nearBottomRef.current) return;
    const el = messagesRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [lastMessageId, lastMessageIsMine]);

  const flashMessage = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    setTimeout(() => setHighlightedMessageId(null), 1500);
    return true;
  };

  // Resolve a pending jump: scroll to it if loaded, otherwise page back
  // through history until it appears (or there's nothing older).
  const oldestCreatedAt = rawMessages[0]?.createdAt;
  const hasMore = entry.hasMore;
  const loadingOlder = Boolean(entry.loadingOlder);
  useEffect(() => {
    if (!pendingJumpId || !loaded) return;
    if (rawMessages.some((m) => m.id === pendingJumpId)) {
      const frame = requestAnimationFrame(() => {
        flashMessage(pendingJumpId);
        setPendingJumpId(null);
        if (location.state?.jumpTo) navigate(location.pathname, { replace: true, state: null });
      });
      return () => cancelAnimationFrame(frame);
    }
    if (hasMore && !loadingOlder) {
      loadMessages(conversationId, oldestCreatedAt);
      return;
    }
    if (!hasMore) {
      const frame = requestAnimationFrame(() => {
        setPendingJumpId(null);
        notify("That message isn't available any more.");
      });
      return () => cancelAnimationFrame(frame);
    }
  });

  const handleScroll = (e) => {
    const el = e.currentTarget;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
    nearBottomRef.current = near;
    setIsNearBottom(near);
  };

  const scrollToBottom = () => {
    const el = messagesRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  // Keep the viewport anchored on the same message while older ones are prepended.
  const handleLoadOlder = async () => {
    const el = messagesRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    await loadMessages(conversationId, oldestCreatedAt);
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - prevHeight;
    });
  };

  // Images change the content height once they load; keep pinned if we were at the bottom.
  const handleImageLoad = () => {
    if (!nearBottomRef.current) return;
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const handleReply = (message) => {
    setReplyingTo({
      messageId: message.id,
      senderId: message.senderId,
      senderName: message.isMine ? 'You' : message.senderName,
      text: getMessagePreview(message),
    });
  };

  const handleSaveEdit = async (messageId, text) => {
    setEditingMessageId(null);
    await editMessage(conversationId, messageId, text);
  };

  const handleJumpToMessage = (messageId) => {
    if (!flashMessage(messageId)) setPendingJumpId(messageId);
  };

  const handleCallClick = (type) => {
    setCallNotice(type);
    setTimeout(() => setCallNotice(null), 3200);
  };

  if (!conversationId) {
    return (
      <section className={`chat-window chat-window-empty ${className}`}>
        <p>Select a conversation to start chatting.</p>
      </section>
    );
  }

  if (!conversation && conversationsStatus === 'loading') {
    return (
      <section className={`chat-window chat-window-empty ${className}`}>
        <p role="status">Loading conversation…</p>
      </section>
    );
  }

  if (!conversation) {
    return (
      <section className={`chat-window chat-window-empty ${className}`}>
        <div className="chat-not-found fade-in">
          <MessageSquareOff size={36} />
          <h2>Conversation not found</h2>
          <p>This chat doesn't exist or you don't have access to it.</p>
          <button className="btn btn-primary" onClick={onBack}>
            Back to conversations
          </button>
        </div>
      </section>
    );
  }

  const wallpaperId = getConversationWallpaper(conversation.id);
  const wallpaper = getWallpaper(wallpaperId);
  const messagesStyle =
    wallpaper.id === 'default'
      ? {}
      : {
          backgroundImage: wallpaper.background,
          backgroundSize: wallpaper.backgroundSize || 'cover',
        };

  const statusText = isTyping
    ? null
    : info.isGroup
      ? `${info.memberCount} members`
      : info.online
        ? 'Online'
        : formatLastSeen(info.lastSeen);

  const safePinIndex = Math.min(pinIndex, Math.max(0, pinnedIds.length - 1));
  const shownPinId = pinnedIds[pinnedIds.length - 1 - safePinIndex];
  const shownPin = messages.find((m) => m.id === shownPinId);

  return (
    <section className={`chat-window ${className}`}>
      <header className="chat-window-header">
        <button className="chat-window-back" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft size={20} />
        </button>
        <AvatarRing
          src={info.avatar}
          alt={info.name}
          online={info.online}
          showStatus={!info.isGroup}
          size={42}
        />
        <div className="chat-window-header-info">
          <span className="chat-window-name">
            <span className="chat-window-name-text">{info.name}</span>
            {moodEmoji && moodEmoji !== '💬' && (
              <span className="chat-window-mood-emoji">{moodEmoji}</span>
            )}
          </span>
          <span className="chat-window-status">
            {isTyping ? (
              <>
                {info.isGroup && (
                  <span className="chat-window-typing-name">
                    {typingNames.length === 1 ? `${typingNames[0]} is typing` : 'Several people are typing'}
                  </span>
                )}
                <span className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </>
            ) : (
              statusText
            )}
          </span>
        </div>
        <div className="chat-window-header-actions">
          <button
            className="navbar-icon-btn header-call-btn"
            onClick={() => handleCallClick('audio')}
            aria-label="Audio call"
            title="Audio call"
          >
            <Phone size={18} />
          </button>
          <button
            className="navbar-icon-btn header-call-btn"
            onClick={() => handleCallClick('video')}
            aria-label="Video call"
            title="Video call"
          >
            <Video size={18} />
          </button>
          <button
            className="navbar-icon-btn"
            onClick={() => setShowSearch((s) => !s)}
            aria-label="Search in conversation"
            title="Search in conversation"
          >
            <Search size={18} />
          </button>
          <WallpaperPicker conversationId={conversation.id} />
          {info.isGroup && (
            <button
              className="navbar-icon-btn"
              onClick={() => setShowInfo(true)}
              aria-label="Group info"
              title="Group info"
            >
              <Info size={18} />
            </button>
          )}
        </div>
      </header>

      {callNotice && (
        <div className="call-notice-bar fade-in">
          {callNotice === 'video' ? <Video size={14} /> : <Phone size={14} />}
          <span>
            {callNotice === 'video' ? 'Video' : 'Audio'} calling needs a real-time media backend (like WebRTC) —
            not implemented yet.
          </span>
        </div>
      )}

      {pinnedIds.length > 0 && (
        <div className="pinned-bar fade-in">
          <Pin size={15} className="pinned-bar-icon" />
          <button
            className="pinned-bar-content"
            onClick={() => {
              handleJumpToMessage(shownPinId);
              if (pinnedIds.length > 1) setPinIndex((i) => (i + 1) % pinnedIds.length);
            }}
            title="Jump to pinned message"
          >
            <span className="pinned-bar-label">
              Pinned{pinnedIds.length > 1 ? ` (${safePinIndex + 1}/${pinnedIds.length})` : ''}
            </span>
            <span className="pinned-bar-text">{shownPin ? getMessagePreview(shownPin) : 'Pinned message'}</span>
          </button>
          {canPin && (
            <button
              className="pinned-bar-unpin"
              onClick={() => setPinned(conversation.id, shownPinId, false)}
              aria-label="Unpin message"
              title="Unpin"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {showSearch && (
        <ChatSearchBar
          messages={messages}
          onJumpToMessage={handleJumpToMessage}
          onClose={() => setShowSearch(false)}
        />
      )}

      <div className="chat-window-messages-wrap">
        <div
          className="chat-window-messages"
          style={messagesStyle}
          ref={messagesRef}
          onScroll={handleScroll}
        >
          {loaded && entry.hasMore && (
            <button className="load-older-btn" onClick={handleLoadOlder} disabled={loadingOlder}>
              {loadingOlder ? 'Loading…' : 'Load older messages'}
            </button>
          )}

          {(entry.status === 'loading' || entry.status === 'idle') && (
            <p className="chat-window-no-messages" role="status">
              Loading messages…
            </p>
          )}

          {entry.status === 'error' && (
            <div className="chat-window-no-messages">
              <p>Couldn't load messages. {entry.error}</p>
              <button className="btn btn-ghost sidebar-retry" onClick={() => loadMessages(conversationId)}>
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          )}

          {loaded && messages.length === 0 && (
            <p className="chat-window-no-messages">No messages yet — say hi 👋</p>
          )}

          {messages.map((msg, i) => {
            const prev = messages[i - 1];
            const isNewDay = !prev || getDayKey(prev.timestamp) !== getDayKey(msg.timestamp);
            return (
              <Fragment key={msg.clientId || msg.id}>
                {isNewDay && (
                  <div className="date-divider" role="separator">
                    <span>{formatDateDivider(msg.timestamp)}</span>
                  </div>
                )}
                <MessageBubble
                  message={msg}
                  conversationId={conversation.id}
                  showSenderName={info.isGroup && !msg.isMine && prev?.senderId !== msg.senderId}
                  canPin={canPin}
                  isPinned={pinnedIds.includes(msg.id)}
                  onReply={handleReply}
                  onJumpToMessage={handleJumpToMessage}
                  onTogglePin={() => setPinned(conversation.id, msg.id, !pinnedIds.includes(msg.id))}
                  onRetry={() => retryMessage(msg.clientId)}
                  onDiscard={() => discardMessage(msg.clientId)}
                  isHighlighted={msg.id === highlightedMessageId}
                  isEditing={msg.id === editingMessageId}
                  onStartEdit={() => setEditingMessageId(msg.id)}
                  onCancelEdit={() => setEditingMessageId(null)}
                  onSaveEdit={(text) => handleSaveEdit(msg.id, text)}
                  onImageLoad={handleImageLoad}
                />
              </Fragment>
            );
          })}
        </div>

        {!isNearBottom && (
          <button
            className="jump-to-bottom-btn fade-in"
            onClick={scrollToBottom}
            aria-label="Jump to latest messages"
            title="Jump to latest messages"
          >
            <ArrowDown size={18} />
          </button>
        )}
      </div>

      <MessageInput
        conversationId={conversation.id}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />

      {showInfo && info.isGroup && (
        <GroupInfoModal conversation={conversation} onClose={() => setShowInfo(false)} />
      )}
    </section>
  );
}
