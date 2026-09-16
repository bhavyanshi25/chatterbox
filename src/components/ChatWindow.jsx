import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search, Phone, Video } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import AvatarRing from './AvatarRing';
import WallpaperPicker from './WallpaperPicker';
import ChatSearchBar from './ChatSearchBar';
import { getMoodEmoji } from '../data/moods';
import { getWallpaper } from '../data/wallpapers';

export default function ChatWindow({ onBack, className = '' }) {
  const {
    conversations,
    activeConversationId,
    getUserById,
    typingUserIds,
    getConversationWallpaper,
  } = useChat();
  const messagesEndRef = useRef(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [callNotice, setCallNotice] = useState(null);

  const conversation = conversations.find((c) => c.id === activeConversationId);
  const participant = conversation ? getUserById(conversation.participantId) : null;
  const isTyping = typingUserIds[activeConversationId];
  const moodEmoji = getMoodEmoji(participant?.mood);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages.length, isTyping]);

  useEffect(() => {
    setReplyingTo(null);
    setShowSearch(false);
    setHighlightedMessageId(null);
    setCallNotice(null);
  }, [activeConversationId]);

  const handleReply = (message) => {
    setReplyingTo({
      messageId: message.id,
      senderName: message.senderId === 'me' ? 'You' : participant?.name || 'them',
      text: message.text,
    });
  };

  const handleJumpToMessage = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    setTimeout(() => setHighlightedMessageId(null), 1500);
  };

  const handleCallClick = (type) => {
    setCallNotice(type);
    setTimeout(() => setCallNotice(null), 3200);
  };

  if (!conversation || !participant) {
    return (
      <section className={`chat-window chat-window-empty ${className}`}>
        <p>Select a conversation to start chatting.</p>
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

  return (
    <section className={`chat-window ${className}`}>
      <header className="chat-window-header">
        <button className="chat-window-back" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft size={20} />
        </button>
        <AvatarRing src={participant.avatar} alt={participant.name} online={participant.online} size={42} />
        <div className="chat-window-header-info">
          <span className="chat-window-name">
            {participant.name}
            {moodEmoji && moodEmoji !== '💬' && (
              <span className="chat-window-mood-emoji">{moodEmoji}</span>
            )}
          </span>
          <span className="chat-window-status">
            {isTyping ? (
              <span className="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </span>
            ) : participant.online ? (
              'Online'
            ) : (
              'Offline'
            )}
          </span>
        </div>
        <div className="chat-window-header-actions">
          <button
            className="navbar-icon-btn"
            onClick={() => handleCallClick('audio')}
            aria-label="Audio call"
            title="Audio call"
          >
            <Phone size={18} />
          </button>
          <button
            className="navbar-icon-btn"
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
        </div>
      </header>

      {callNotice && (
        <div className="call-notice-bar fade-in">
          {callNotice === 'video' ? <Video size={14} /> : <Phone size={14} />}
          {callNotice === 'video' ? 'Video' : 'Audio'} calling needs a real backend (like WebRTC) —
          not implemented in this demo yet.
        </div>
      )}

      {showSearch && (
        <ChatSearchBar
          conversation={conversation}
          onJumpToMessage={handleJumpToMessage}
          onClose={() => setShowSearch(false)}
        />
      )}

      <div className="chat-window-messages" style={messagesStyle}>
        {conversation.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            conversationId={conversation.id}
            onReply={handleReply}
            onJumpToMessage={handleJumpToMessage}
            isHighlighted={msg.id === highlightedMessageId}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <MessageInput
        conversationId={conversation.id}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
    </section>
  );
}