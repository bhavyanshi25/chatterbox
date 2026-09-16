import { useState } from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import EffectOverlay from './EffectOverlay';
import { useChat } from '../context/ChatContext';

export default function ChatLayout() {
  const [showSidebarMobile, setShowSidebarMobile] = useState(true);
  const { activeEffect, clearEffect } = useChat();

  return (
    <div className="chat-app">
      <Navbar />
      <div className="chat-body">
        <Sidebar
          onSelectConversation={() => setShowSidebarMobile(false)}
          className={showSidebarMobile ? 'visible-mobile' : 'hidden-mobile'}
        />
        <ChatWindow
          onBack={() => setShowSidebarMobile(true)}
          className={!showSidebarMobile ? 'visible-mobile' : 'hidden-mobile'}
        />
      </div>
      <EffectOverlay effect={activeEffect} onComplete={clearEffect} />
    </div>
  );
}