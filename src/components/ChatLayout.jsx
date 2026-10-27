import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WifiOff, X } from 'lucide-react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import EffectOverlay from './EffectOverlay';
import { useChat } from '../context/ChatContext';

// The URL is the single source of truth for which conversation is open:
// /chat shows just the list (on mobile), /chat/:conversationId opens that chat.
export default function ChatLayout() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const {
    conversations,
    getConversationInfo,
    activeEffect,
    clearEffect,
    markConversationRead,
    setActiveConversation,
    connection,
    notice,
    dismissNotice,
  } = useChat();

  const conversation = conversationId
    ? conversations.find((c) => c.id === conversationId)
    : null;
  const unreadCount = conversation?.unreadCount ?? 0;
  const conversationName = conversation ? getConversationInfo(conversation)?.name : null;

  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation]);

  // Opening a conversation (or coming back to the tab) marks it read.
  useEffect(() => {
    if (!conversationId || unreadCount === 0) return;
    const markIfVisible = () => {
      if (document.visibilityState === 'visible') markConversationRead(conversationId);
    };
    markIfVisible();
    document.addEventListener('visibilitychange', markIfVisible);
    return () => document.removeEventListener('visibilitychange', markIfVisible);
  }, [conversationId, unreadCount, markConversationRead]);

  useEffect(() => {
    document.title = conversationName ? `${conversationName} · ChatterBox` : 'ChatterBox';
    return () => {
      document.title = 'ChatterBox';
    };
  }, [conversationName]);

  const handleSelectConversation = (id) => {
    if (id !== conversationId) navigate(`/chat/${id}`);
  };

  // On mobile only one pane is visible: the chat when a conversation is in the URL.
  const showChatOnMobile = Boolean(conversationId);

  return (
    <div className="chat-app">
      <Navbar />
      {connection !== 'connected' && (
        <div className={`connection-banner ${connection}`} role="status">
          <WifiOff size={15} />
          {connection === 'connecting'
            ? 'Connecting…'
            : "You're offline. Messages you send will go out when the connection is back."}
        </div>
      )}
      <div className="chat-body">
        <Sidebar
          activeConversationId={conversationId}
          onSelectConversation={handleSelectConversation}
          className={showChatOnMobile ? 'hidden-mobile' : 'visible-mobile'}
        />
        <ChatWindow
          key={conversationId ?? 'none'}
          conversationId={conversationId}
          onBack={() => navigate('/chat')}
          className={showChatOnMobile ? 'visible-mobile' : 'hidden-mobile'}
        />
      </div>
      {notice && (
        <div className="app-toast fade-in" role="alert" key={notice.key}>
          <span>{notice.message}</span>
          <button onClick={dismissNotice} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
      <EffectOverlay effect={activeEffect} onComplete={clearEffect} />
    </div>
  );
}
