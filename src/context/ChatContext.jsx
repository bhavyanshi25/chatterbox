import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { usersData, conversationsData } from '../data/mockData';
import { detectEffect } from '../utils/messageEffects';
import { playSendSound, playReceiveSound, playEffectSound } from '../utils/soundEffects';
import { useSettings } from './SettingsContext';

const ChatContext = createContext(null);
const WALLPAPER_STORAGE_KEY = 'chatapp_wallpapers';

export function ChatProvider({ children }) {
  const { soundEnabled, effectsEnabled } = useSettings();
  const [users, setUsers] = useState(usersData);
  const [conversations, setConversations] = useState(conversationsData);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [typingUserIds, setTypingUserIds] = useState({});
  const [activeEffect, setActiveEffect] = useState(null);
  const [wallpapers, setWallpapers] = useState({});
  const typingTimeouts = useRef({});
  const revertOnlineTimeouts = useRef({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WALLPAPER_STORAGE_KEY);
      if (raw) setWallpapers(JSON.parse(raw));
    } catch {
      // ignore malformed storage
    }
  }, []);

  const getUserById = useCallback(
    (id) => users.find((u) => u.id === id),
    [users]
  );

  const setUserOnlineStatus = useCallback((userId, online) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, online, lastSeen: online ? null : new Date().toISOString() } : u))
    );
  }, []);

  const triggerEffect = useCallback(
    (type) => {
      if (!type || !effectsEnabled) return;
      setActiveEffect({ type, key: Date.now() });
      if (soundEnabled) playEffectSound();
    },
    [effectsEnabled, soundEnabled]
  );

  const clearEffect = useCallback(() => setActiveEffect(null), []);

  const sendMessage = useCallback(
    (conversationId, text, replyTo = null) => {
      if (!text.trim()) return;
      const newMessage = {
        id: `m${Date.now()}`,
        senderId: 'me',
        text: text.trim(),
        timestamp: new Date().toISOString(),
        status: 'sent',
        ...(replyTo ? { replyTo } : {}),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, messages: [...c.messages, newMessage] }
            : c
        )
      );

      if (soundEnabled) playSendSound();

      const effectType = detectEffect(text);
      if (effectType) triggerEffect(effectType);

      const conv = conversations.find((c) => c.id === conversationId);
      if (!conv) return;

      const participant = users.find((u) => u.id === conv.participantId);
      const wasOffline = participant && !participant.online;

      clearTimeout(typingTimeouts.current[conversationId]);
      clearTimeout(revertOnlineTimeouts.current[conversationId]);

      setTypingUserIds((prev) => ({ ...prev, [conversationId]: true }));

      // If they were offline, they "come online" right as they start typing a reply.
      if (wasOffline) {
        setUserOnlineStatus(conv.participantId, true);
      }

      typingTimeouts.current[conversationId] = setTimeout(() => {
        setTypingUserIds((prev) => ({ ...prev, [conversationId]: false }));
        if (soundEnabled) playReceiveSound();
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: [
                    ...c.messages,
                    {
                      id: `m${Date.now() + 1}`,
                      senderId: conv.participantId,
                      text: 'Got it 👍',
                      timestamp: new Date().toISOString(),
                      status: 'sent',
                    },
                  ],
                }
              : c
          )
        );

        // If they came online just for this, drift back offline after a bit —
        // mimics someone checking their phone, replying, then putting it away.
        if (wasOffline) {
          revertOnlineTimeouts.current[conversationId] = setTimeout(() => {
            setUserOnlineStatus(conv.participantId, false);
          }, 10000);
        }
      }, 1800);
    },
    [conversations, users, triggerEffect, soundEnabled, setUserOnlineStatus]
  );

  const markConversationRead = useCallback((conversationId) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const addReaction = useCallback((conversationId, messageId, emoji) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      reactions: {
                        ...(m.reactions || {}),
                        [emoji]: (m.reactions?.[emoji] || 0) + 1,
                      },
                    }
                  : m
              ),
            }
          : c
      )
    );
  }, []);

  const deleteMessage = useCallback((conversationId, messageId) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId && m.senderId === 'me'
                  ? { ...m, deleted: true, text: '', reactions: {} }
                  : m
              ),
            }
          : c
      )
    );
  }, []);

  const getConversationWallpaper = useCallback(
    (conversationId) => wallpapers[conversationId] || 'default',
    [wallpapers]
  );

  const setConversationWallpaper = useCallback((conversationId, wallpaperId) => {
    setWallpapers((prev) => {
      const updated = { ...prev, [conversationId]: wallpaperId };
      localStorage.setItem(WALLPAPER_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const startConversationWith = useCallback(
    (participantId) => {
      const existing = conversations.find((c) => c.participantId === participantId);
      if (existing) {
        setActiveConversationId(existing.id);
        return existing.id;
      }
      const newId = `c${Date.now()}`;
      setConversations((prev) => [
        ...prev,
        { id: newId, participantId, unreadCount: 0, messages: [] },
      ]);
      setActiveConversationId(newId);
      return newId;
    },
    [conversations]
  );

  const value = {
    users,
    conversations,
    activeConversationId,
    setActiveConversationId,
    getUserById,
    sendMessage,
    deleteMessage,
    markConversationRead,
    addReaction,
    typingUserIds,
    activeEffect,
    clearEffect,
    triggerEffect,
    getConversationWallpaper,
    setConversationWallpaper,
    startConversationWith,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}