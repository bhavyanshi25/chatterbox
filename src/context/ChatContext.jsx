import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
} from 'react';
import { io } from 'socket.io-client';
import { api, ApiError, SESSION_EXPIRED_EVENT } from '../api/client';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { chatReducer, initialChatState } from './chatReducer';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { detectEffect, createEffect } from '../utils/messageEffects';
import { playSendSound, playReceiveSound, playEffectSound } from '../utils/soundEffects';
import { createClientId } from '../utils/messages';
import { initialsAvatar } from '../utils/avatar';

const ChatContext = createContext(null);
const WALLPAPER_STORAGE_KEY = 'chatapp_wallpapers';
const SEND_TIMEOUT_MS = 10000;
const TYPING_EXPIRY_MS = 6000;

export function ChatProvider({ children }) {
  const { currentUser, syncUser } = useAuth();
  const myId = currentUser?.id ?? null;
  const { soundEnabled, effectsEnabled } = useSettings();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [activeEffect, setActiveEffect] = useState(null);
  const [notice, setNotice] = useState(null);
  const [wallpapers, setWallpapers] = useLocalStorage(WALLPAPER_STORAGE_KEY, {});
  const socketRef = useRef(null);
  // Outgoing messages that aren't confirmed yet: clientId -> job.
  const jobsRef = useRef(new Map());
  const activeConversationRef = useRef(null);
  const typingTimersRef = useRef({});
  const noticeTimerRef = useRef(null);
  const loadingRef = useRef(new Set());

  // ---- Small helpers ---------------------------------------------------------

  const notify = useCallback((message) => {
    clearTimeout(noticeTimerRef.current);
    setNotice({ message, key: Date.now() });
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4500);
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const triggerEffect = useCallback(
    (type) => {
      if (!type || !effectsEnabled) return;
      const effect = createEffect(type);
      if (!effect) return;
      setActiveEffect(effect);
      if (soundEnabled) playEffectSound();
    },
    [effectsEnabled, soundEnabled]
  );

  const clearEffect = useCallback(() => setActiveEffect(null), []);

  const getUserById = useCallback(
    (id) => state.users[id] || (id === myId ? currentUser : undefined),
    [state.users, myId, currentUser]
  );

  const getConversationInfo = useCallback(
    (conversation) => {
      if (!conversation) return null;
      if (conversation.type === 'group') {
        const name = conversation.name || 'Group';
        return {
          isGroup: true,
          name,
          avatar: initialsAvatar(name),
          online: false,
          mood: null,
          memberCount: conversation.members.length,
        };
      }
      const user = getUserById(conversation.participantId);
      const name = user?.name || 'Unknown user';
      return {
        isGroup: false,
        name,
        avatar: user?.avatar || initialsAvatar(name),
        online: Boolean(user?.online),
        lastSeen: user?.lastSeen ?? null,
        mood: user?.mood ?? null,
        user,
      };
    },
    [getUserById]
  );

  // ---- Loading data ----------------------------------------------------------

  const loadConversations = useCallback(async () => {
    const requestedAt = Date.now();
    try {
      const { conversations } = await api.get('/api/conversations');
      dispatch({ type: 'CONVERSATIONS_LOADED', conversations, requestedAt });
    } catch (err) {
      if (err.status !== 401) dispatch({ type: 'CONVERSATIONS_ERROR', error: err.message });
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const { users } = await api.get('/api/users');
      dispatch({ type: 'USERS_LOADED', users });
    } catch {
      // The directory is non-critical; conversations still carry member info.
    }
  }, []);

  const loadConversation = useCallback(async (conversationId) => {
    try {
      const { conversation } = await api.get(`/api/conversations/${conversationId}`);
      dispatch({ type: 'CONVERSATION_UPSERT', conversation });
    } catch {
      // It'll show up on the next full refresh.
    }
  }, []);

  // Latest page by default; pass `before` (ISO date of the oldest loaded
  // message) to load the page before it.
  const loadMessages = useCallback(async (conversationId, before) => {
    const key = `${conversationId}:${before || 'latest'}`;
    if (loadingRef.current.has(key)) return;
    loadingRef.current.add(key);
    dispatch({ type: 'MESSAGES_LOADING', conversationId, older: Boolean(before) });
    try {
      const qs = before ? `?before=${encodeURIComponent(before)}` : '';
      const { messages, hasMore } = await api.get(`/api/conversations/${conversationId}/messages${qs}`);
      dispatch({ type: 'MESSAGES_LOADED', conversationId, messages, hasMore, older: Boolean(before) });
    } catch (err) {
      dispatch({ type: 'MESSAGES_ERROR', conversationId, error: err.message });
    } finally {
      loadingRef.current.delete(key);
    }
  }, []);

  // ---- Sending (optimistic, idempotent, survives reconnects) -----------------

  const deliver = useCallback(async (job) => {
    if (job.inFlight) return;
    job.inFlight = true;
    const fail = (error) =>
      dispatch({
        type: 'MESSAGE_LOCAL_PATCH',
        conversationId: job.conversationId,
        clientId: job.clientId,
        patch: { pending: false, failed: true, error },
      });
    try {
      if (job.file && !job.attachmentId) {
        const form = new FormData();
        form.append('image', job.file);
        const { attachment } = await api.upload(`/api/conversations/${job.conversationId}/attachments`, form);
        job.attachmentId = attachment.id;
      }

      const socket = socketRef.current;
      if (!socket?.connected) return; // stays "pending"; flushed when we reconnect

      const ack = await socket.timeout(SEND_TIMEOUT_MS).emitWithAck('message:send', {
        conversationId: job.conversationId,
        clientId: job.clientId,
        text: job.text,
        replyToId: job.replyToId,
        attachmentId: job.attachmentId,
      });
      if (!ack?.ok) {
        fail(ack?.error || "Couldn't send this message.");
        return;
      }
      dispatch({ type: 'MESSAGE_UPSERT', message: ack.message });
      jobsRef.current.delete(job.clientId);
      if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
    } catch (err) {
      // Offline: keep it pending and retry on reconnect. Anything else is a
      // real failure the user can retry by hand.
      const offline = (err instanceof ApiError && err.status === 0) || !socketRef.current?.connected;
      if (!offline) fail(err instanceof ApiError ? err.message : "Couldn't send — tap retry.");
    } finally {
      job.inFlight = false;
    }
  }, []);

  const sendMessage = useCallback(
    (conversationId, { text = '', replyTo = null, file = null }) => {
      const trimmed = text.trim();
      if (!trimmed && !file) return;
      const clientId = createClientId();
      const previewUrl = file ? URL.createObjectURL(file) : null;

      dispatch({
        type: 'MESSAGE_UPSERT',
        message: {
          id: clientId,
          clientId,
          conversationId,
          senderId: myId,
          text: trimmed,
          createdAt: new Date().toISOString(),
          pending: true,
          replyTo: replyTo
            ? { messageId: replyTo.messageId, senderId: replyTo.senderId, senderName: replyTo.senderName, text: replyTo.text }
            : null,
          image: file ? { url: previewUrl, name: file.name, type: file.type, size: file.size } : null,
          reactions: [],
          deliveredTo: [],
          readBy: [],
        },
      });

      const job = {
        clientId,
        conversationId,
        text: trimmed,
        replyToId: replyTo?.messageId ?? null,
        file,
        attachmentId: null,
        previewUrl,
      };
      jobsRef.current.set(clientId, job);

      if (soundEnabled) playSendSound();
      if (trimmed) triggerEffect(detectEffect(trimmed));
      deliver(job);
    },
    [myId, soundEnabled, triggerEffect, deliver]
  );

  const retryMessage = useCallback(
    (clientId) => {
      const job = jobsRef.current.get(clientId);
      if (!job) return;
      dispatch({
        type: 'MESSAGE_LOCAL_PATCH',
        conversationId: job.conversationId,
        clientId,
        patch: { pending: true, failed: false, error: null },
      });
      deliver(job);
    },
    [deliver]
  );

  const discardMessage = useCallback((clientId) => {
    const job = jobsRef.current.get(clientId);
    if (!job) return;
    jobsRef.current.delete(clientId);
    if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
    dispatch({ type: 'MESSAGE_LOCAL_REMOVE', conversationId: job.conversationId, clientId });
  }, []);

  // ---- Socket.IO: connect while logged in -------------------------------------

  const onReady = useEffectEvent(() => {
    dispatch({ type: 'CONNECTION', status: 'connected' });
    // Catch up on anything missed while disconnected.
    loadConversations();
    loadUsers();
    for (const [conversationId, entry] of Object.entries(state.messages)) {
      if (entry.status === 'loaded') loadMessages(conversationId);
    }
    for (const job of jobsRef.current.values()) {
      if (!job.inFlight) deliver(job);
    }
    const active = activeConversationRef.current;
    if (active && document.visibilityState === 'visible') {
      socketRef.current?.emit('conversation:read', { conversationId: active });
    }
  });

  const onMessageNew = useEffectEvent((message) => {
    const known = state.conversations.some((c) => c.id === message.conversationId);
    dispatch({ type: 'MESSAGE_UPSERT', message });
    if (!known) loadConversation(message.conversationId);
    if (message.senderId === myId) return;

    if (soundEnabled) playReceiveSound();
    const socket = socketRef.current;
    const viewing =
      activeConversationRef.current === message.conversationId && document.visibilityState === 'visible';
    if (viewing) {
      socket?.emit('conversation:read', { conversationId: message.conversationId });
      dispatch({ type: 'UNREAD_SET', conversationId: message.conversationId, count: 0 });
      if (message.text) triggerEffect(detectEffect(message.text));
    } else {
      socket?.emit('messages:delivered', { conversationId: message.conversationId, messageIds: [message.id] });
      dispatch({ type: 'UNREAD_INCREMENT', conversationId: message.conversationId });
    }
  });

  const onUserUpdated = useEffectEvent((user) => {
    dispatch({ type: 'USER_UPSERT', user });
    if (user.id === myId) syncUser(user);
  });

  const onTyping = useEffectEvent(({ conversationId, userId, isTyping }) => {
    const key = `${conversationId}:${userId}`;
    clearTimeout(typingTimersRef.current[key]);
    dispatch({ type: 'TYPING', conversationId, userId, isTyping });
    if (isTyping) {
      // If the "stopped typing" event is lost, expire the indicator anyway.
      typingTimersRef.current[key] = setTimeout(
        () => dispatch({ type: 'TYPING', conversationId, userId, isTyping: false }),
        TYPING_EXPIRY_MS
      );
    }
  });

  useEffect(() => {
    if (!myId) return;
    const jobs = jobsRef.current;
    const typingTimers = typingTimersRef.current;
    const socket = io({ withCredentials: true });
    socketRef.current = socket;

    socket.on('ready', () => onReady());
    socket.on('disconnect', () => dispatch({ type: 'CONNECTION', status: 'disconnected' }));
    socket.on('connect_error', (err) => {
      dispatch({ type: 'CONNECTION', status: 'disconnected' });
      if (err?.message === 'unauthorized') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    });
    socket.io.on('reconnect_attempt', () => dispatch({ type: 'CONNECTION', status: 'connecting' }));

    socket.on('message:new', ({ message }) => onMessageNew(message));
    socket.on('message:updated', ({ message }) => dispatch({ type: 'MESSAGE_UPSERT', message, onlyIfExists: true }));
    socket.on('messages:delivered', (p) => dispatch({ type: 'RECEIPT', field: 'deliveredTo', ...p }));
    socket.on('messages:read', (p) => dispatch({ type: 'RECEIPT', field: 'readBy', ...p }));
    socket.on('conversation:new', (conversation) => dispatch({ type: 'CONVERSATION_UPSERT', conversation }));
    socket.on('conversation:updated', (conversation) => dispatch({ type: 'CONVERSATION_UPSERT', conversation }));
    socket.on('conversation:removed', ({ conversationId }) => dispatch({ type: 'CONVERSATION_REMOVED', id: conversationId }));
    socket.on('conversation:read', ({ conversationId }) => dispatch({ type: 'UNREAD_SET', conversationId, count: 0 }));
    socket.on('typing', (p) => onTyping(p));
    socket.on('presence', (p) => dispatch({ type: 'PRESENCE', ...p }));
    socket.on('user:updated', ({ user }) => onUserUpdated(user));

    // Don't wait for the socket to show something.
    loadConversations();
    loadUsers();

    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      for (const job of jobs.values()) if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
      jobs.clear();
      Object.values(typingTimers).forEach(clearTimeout);
      dispatch({ type: 'RESET' });
    };
  }, [myId, loadConversations, loadUsers]);

  // ---- Conversation actions ---------------------------------------------------

  const setActiveConversation = useCallback((conversationId) => {
    activeConversationRef.current = conversationId || null;
  }, []);

  const markConversationRead = useCallback(async (conversationId) => {
    dispatch({ type: 'UNREAD_SET', conversationId, count: 0 });
    const socket = socketRef.current;
    try {
      if (socket?.connected) socket.emit('conversation:read', { conversationId });
      else await api.post(`/api/conversations/${conversationId}/read`);
    } catch {
      // Will be retried next time the conversation is opened.
    }
  }, []);

  const sendTyping = useCallback((conversationId, isTyping) => {
    socketRef.current?.emit('typing', { conversationId, isTyping });
  }, []);

  // Wraps an API call: applies the result, or shows the error as a notice.
  const run = useCallback(
    async (fn) => {
      try {
        return await fn();
      } catch (err) {
        notify(err.message || 'Something went wrong.');
        return null;
      }
    },
    [notify]
  );

  const startConversationWith = useCallback(
    async (userId) => {
      const { conversation } = await api.post('/api/conversations/direct', { userId });
      dispatch({ type: 'CONVERSATION_UPSERT', conversation });
      return conversation.id;
    },
    []
  );

  const createGroup = useCallback(async (name, memberIds) => {
    const { conversation } = await api.post('/api/conversations/group', { name, memberIds });
    dispatch({ type: 'CONVERSATION_UPSERT', conversation });
    return conversation.id;
  }, []);

  const applyConversation = (res) => {
    if (res?.conversation) dispatch({ type: 'CONVERSATION_UPSERT', conversation: res.conversation });
    return res;
  };

  const renameGroup = (conversationId, name) =>
    api.patch(`/api/conversations/${conversationId}`, { name }).then(applyConversation);

  const addGroupMembers = (conversationId, userIds) =>
    api.post(`/api/conversations/${conversationId}/members`, { userIds }).then(applyConversation);

  const setMemberRole = (conversationId, userId, role) =>
    api.patch(`/api/conversations/${conversationId}/members/${userId}`, { role }).then(applyConversation);

  const removeGroupMember = async (conversationId, userId) => {
    await api.delete(`/api/conversations/${conversationId}/members/${userId}`);
    if (userId === myId) dispatch({ type: 'CONVERSATION_REMOVED', id: conversationId });
    else loadConversation(conversationId);
  };

  // ---- Message actions --------------------------------------------------------

  const upsertFrom = (res) => {
    if (res?.message) dispatch({ type: 'MESSAGE_UPSERT', message: res.message, onlyIfExists: true });
    return res;
  };

  const editMessage = (_conversationId, messageId, text) =>
    run(() => api.patch(`/api/messages/${messageId}`, { text }).then(upsertFrom));

  const deleteMessage = (_conversationId, messageId) =>
    run(() => api.delete(`/api/messages/${messageId}`).then(upsertFrom));

  const addReaction = (_conversationId, messageId, emoji) =>
    run(() => api.post(`/api/messages/${messageId}/reactions`, { emoji }).then(upsertFrom));

  const setPinned = (conversationId, messageId, pinned) =>
    run(async () => {
      const res = pinned
        ? await api.post(`/api/conversations/${conversationId}/pins`, { messageId })
        : await api.delete(`/api/conversations/${conversationId}/pins/${messageId}`);
      dispatch({ type: 'CONVERSATION_PATCH', id: conversationId, patch: { pinnedMessageIds: res.pinnedMessageIds } });
      return res;
    });

  const fetchStats = useCallback(() => api.get('/api/users/me/stats').then((r) => r.stats), []);

  // ---- Wallpapers (local preference) ------------------------------------------

  const getConversationWallpaper = useCallback(
    (conversationId) => wallpapers[conversationId] || 'default',
    [wallpapers]
  );

  const setConversationWallpaper = useCallback(
    (conversationId, wallpaperId) => {
      setWallpapers((prev) => ({ ...prev, [conversationId]: wallpaperId }));
    },
    [setWallpapers]
  );

  const users = Object.values(state.users)
    .filter((u) => u.id !== myId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const value = {
    currentUserId: myId,
    users,
    conversations: state.conversations,
    conversationsStatus: state.conversationsStatus,
    conversationsError: state.conversationsError,
    reloadConversations: loadConversations,
    messagesByConversation: state.messages,
    loadMessages,
    connection: state.connection,
    typingUserIds: state.typing,
    getUserById,
    getConversationInfo,
    setActiveConversation,
    sendMessage,
    retryMessage,
    discardMessage,
    editMessage,
    deleteMessage,
    addReaction,
    setPinned,
    markConversationRead,
    sendTyping,
    startConversationWith,
    createGroup,
    renameGroup,
    addGroupMembers,
    setMemberRole,
    removeGroupMember,
    fetchStats,
    notice,
    notify,
    dismissNotice,
    activeEffect,
    clearEffect,
    triggerEffect,
    getConversationWallpaper,
    setConversationWallpaper,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
