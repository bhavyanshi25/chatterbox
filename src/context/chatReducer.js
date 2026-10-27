// Pure state transitions for ChatContext. Kept separate so the merge rules
// (dedupe by id / clientId, receipts, unread counts) are easy to follow.

export const initialChatState = {
  users: {}, // id -> public user (with live presence)
  conversations: [], // newest activity first
  conversationsStatus: 'loading', // loading | ready | error
  conversationsError: '',
  messages: {}, // conversationId -> { items, hasMore, status, error }
  typing: {}, // conversationId -> { userId: true }
  connection: 'connecting', // connecting | connected | disconnected
};

const activity = (c) => c.lastMessage?.createdAt || c.lastMessageAt || c.createdAt || '';

function sortConversations(list) {
  return [...list].sort((a, b) => {
    const x = activity(a);
    const y = activity(b);
    return x === y ? 0 : x < y ? 1 : -1;
  });
}

function mergeUsers(users, incoming) {
  const next = { ...users };
  for (const u of incoming) {
    if (!u?.id || !u.name) continue;
    next[u.id] = { ...next[u.id], ...u };
  }
  return next;
}

const usersFromConversation = (conversation) => (conversation.members || []).map((m) => m.user);

// A message matches an existing one by server id, or — for my own optimistic
// messages — by the clientId generated when it was sent.
function findMessageIndex(items, message) {
  return items.findIndex(
    (m) =>
      m.id === message.id ||
      (message.clientId && m.clientId === message.clientId && m.senderId === message.senderId)
  );
}

function mergeOne(prev, incoming) {
  return {
    ...prev,
    ...incoming,
    deliveredTo: [...new Set([...(prev.deliveredTo || []), ...(incoming.deliveredTo || [])])],
    readBy: [...new Set([...(prev.readBy || []), ...(incoming.readBy || [])])],
    pending: incoming.pending ?? false,
    failed: incoming.failed ?? false,
    error: incoming.error ?? null,
  };
}

function insertMessage(items, message, { onlyIfExists = false } = {}) {
  const idx = findMessageIndex(items, message);
  if (idx !== -1) {
    const next = [...items];
    next[idx] = mergeOne(items[idx], message);
    return next;
  }
  if (onlyIfExists) return items;
  const last = items[items.length - 1];
  if (!last || last.createdAt <= message.createdAt) return [...items, message];
  const next = [...items];
  const at = next.findIndex((m) => m.createdAt > message.createdAt);
  next.splice(at, 0, message);
  return next;
}

function updateConversation(state, id, update) {
  return {
    ...state,
    conversations: state.conversations.map((c) => (c.id === id ? { ...update(c), liveAt: Date.now() } : c)),
  };
}

function updateItems(state, conversationId, update) {
  const entry = state.messages[conversationId];
  if (!entry) return state;
  return {
    ...state,
    messages: { ...state.messages, [conversationId]: { ...entry, items: update(entry.items) } },
  };
}

function withLastMessage(conversation, message, { onlyIfSame = false } = {}) {
  const last = conversation.lastMessage;
  const same = last && (last.id === message.id || (message.clientId && last.clientId === message.clientId));
  if (same) return { ...conversation, lastMessage: mergeOne(last, message) };
  if (onlyIfSame) return conversation;
  if (!last || last.createdAt <= message.createdAt) return { ...conversation, lastMessage: message };
  return conversation;
}

export function chatReducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return initialChatState;

    case 'CONNECTION':
      return { ...state, connection: action.status };

    case 'USERS_LOADED':
      return { ...state, users: mergeUsers(state.users, action.users) };

    case 'USER_UPSERT':
      return { ...state, users: mergeUsers(state.users, [action.user]) };

    case 'PRESENCE': {
      const user = state.users[action.userId];
      if (!user) return state;
      return {
        ...state,
        users: { ...state.users, [action.userId]: { ...user, online: action.online, lastSeen: action.lastSeen ?? user.lastSeen } },
      };
    }

    case 'CONVERSATIONS_LOADED': {
      // A live update (socket event) that arrived after this request started
      // is newer than the response — keep it rather than letting a stale list
      // drop a just-created conversation.
      const fresh = state.conversations.filter((c) => (c.liveAt || 0) > action.requestedAt);
      const freshById = new Map(fresh.map((c) => [c.id, c]));
      const loadedIds = new Set(action.conversations.map((c) => c.id));
      const conversations = [
        ...action.conversations.map((c) => (freshById.has(c.id) ? { ...c, ...freshById.get(c.id) } : c)),
        ...fresh.filter((c) => !loadedIds.has(c.id)),
      ];
      return {
        ...state,
        conversationsStatus: 'ready',
        conversationsError: '',
        conversations: sortConversations(conversations),
        users: mergeUsers(state.users, action.conversations.flatMap(usersFromConversation)),
      };
    }

    case 'CONVERSATIONS_ERROR':
      // Keep showing what we have if this was a background refresh.
      return {
        ...state,
        conversationsStatus: state.conversationsStatus === 'ready' ? 'ready' : 'error',
        conversationsError: action.error,
      };

    case 'CONVERSATION_UPSERT': {
      const incoming = { ...action.conversation, liveAt: Date.now() };
      const exists = state.conversations.some((c) => c.id === incoming.id);
      const conversations = exists
        ? state.conversations.map((c) => (c.id === incoming.id ? { ...c, ...incoming } : c))
        : [...state.conversations, incoming];
      return {
        ...state,
        conversations: sortConversations(conversations),
        users: mergeUsers(state.users, usersFromConversation(action.conversation)),
      };
    }

    case 'CONVERSATION_PATCH':
      return updateConversation(state, action.id, (c) => ({ ...c, ...action.patch }));

    case 'CONVERSATION_REMOVED': {
      const messages = { ...state.messages };
      delete messages[action.id];
      return { ...state, conversations: state.conversations.filter((c) => c.id !== action.id), messages };
    }

    case 'UNREAD_SET':
      return updateConversation(state, action.conversationId, (c) => ({ ...c, unreadCount: action.count }));

    case 'UNREAD_INCREMENT':
      return updateConversation(state, action.conversationId, (c) => ({ ...c, unreadCount: (c.unreadCount || 0) + 1 }));

    case 'MESSAGES_LOADING': {
      const entry = state.messages[action.conversationId] || { items: [], hasMore: false };
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: { ...entry, status: entry.status === 'loaded' ? 'loaded' : 'loading', loadingOlder: Boolean(action.older), error: '' },
        },
      };
    }

    case 'MESSAGES_LOADED': {
      const entry = state.messages[action.conversationId];
      let items;
      let hasMore;
      if (action.older && entry) {
        const known = new Set(entry.items.map((m) => m.id));
        items = [...action.messages.filter((m) => !known.has(m.id)), ...entry.items];
        hasMore = action.hasMore;
      } else if (entry?.items.length) {
        // Merge rather than replace: keeps older pages after a re-sync, and
        // keeps live/optimistic messages that arrived while this was loading.
        items = action.messages.reduce((acc, m) => insertMessage(acc, m), entry.items);
        hasMore = entry.status === 'loaded' ? entry.hasMore : action.hasMore;
      } else {
        items = action.messages;
        hasMore = action.hasMore;
      }
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: { items, hasMore, status: 'loaded', loadingOlder: false, error: '' },
        },
      };
    }

    case 'MESSAGES_ERROR': {
      const entry = state.messages[action.conversationId] || { items: [], hasMore: false };
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: {
            ...entry,
            status: entry.status === 'loaded' ? 'loaded' : 'error',
            loadingOlder: false,
            error: action.error,
          },
        },
      };
    }

    case 'MESSAGE_UPSERT': {
      const { message, onlyIfExists } = action;
      let next = updateItems(state, message.conversationId, (items) => insertMessage(items, message, { onlyIfExists }));
      next = updateConversation(next, message.conversationId, (c) => withLastMessage(c, message, { onlyIfSame: onlyIfExists }));
      return { ...next, conversations: sortConversations(next.conversations) };
    }

    case 'MESSAGE_LOCAL_PATCH': {
      // Local (unsent) messages use their clientId as id until the server assigns one.
      const patch = (m) => (m.id === action.clientId ? { ...m, ...action.patch } : m);
      let next = updateItems(state, action.conversationId, (items) => items.map(patch));
      next = updateConversation(next, action.conversationId, (c) =>
        c.lastMessage?.id === action.clientId ? { ...c, lastMessage: { ...c.lastMessage, ...action.patch } } : c
      );
      return next;
    }

    case 'MESSAGE_LOCAL_REMOVE':
      return updateItems(state, action.conversationId, (items) => items.filter((m) => m.id !== action.clientId));

    case 'RECEIPT': {
      // field is 'deliveredTo' or 'readBy'; reading also implies delivery.
      const ids = new Set(action.messageIds);
      const fields = action.field === 'readBy' ? ['readBy', 'deliveredTo'] : ['deliveredTo'];
      const apply = (m) => {
        if (!ids.has(m.id)) return m;
        const next = { ...m };
        for (const f of fields) {
          if (!(next[f] || []).includes(action.userId)) next[f] = [...(next[f] || []), action.userId];
        }
        return next;
      };
      let next = updateItems(state, action.conversationId, (items) => items.map(apply));
      next = updateConversation(next, action.conversationId, (c) => (c.lastMessage ? { ...c, lastMessage: apply(c.lastMessage) } : c));
      return next;
    }

    case 'TYPING': {
      const current = { ...(state.typing[action.conversationId] || {}) };
      if (action.isTyping) current[action.userId] = true;
      else delete current[action.userId];
      return { ...state, typing: { ...state.typing, [action.conversationId]: current } };
    }

    default:
      return state;
  }
}
