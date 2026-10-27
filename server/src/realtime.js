// Thin wrapper around the Socket.IO server so HTTP routes and socket handlers
// can broadcast without importing each other. Presence is tracked in memory,
// which is correct for a single server process (see README → Limitations).
export const convRoom = (id) => `conv:${id}`;
export const userRoom = (id) => `user:${id}`;

export function createRealtime() {
  let io = null;
  const connections = new Map(); // userId -> number of open sockets
  const demoPresence = new Map(); // demo userId -> active simulated conversations

  return {
    attach(server) {
      io = server;
    },

    toConversation(conversationId, event, payload) {
      io?.to(convRoom(conversationId)).emit(event, payload);
    },

    toUser(userId, event, payload) {
      io?.to(userRoom(userId)).emit(event, payload);
    },

    toAll(event, payload) {
      io?.emit(event, payload);
    },

    // Make every open socket of these users join/leave a conversation room —
    // used when conversations are created or group membership changes.
    joinConversation(userIds, conversationId) {
      for (const id of userIds) io?.in(userRoom(id)).socketsJoin(convRoom(conversationId));
    },

    leaveConversation(userIds, conversationId) {
      for (const id of userIds) io?.in(userRoom(id)).socketsLeave(convRoom(conversationId));
    },

    // Returns true when this is the user's first open connection.
    addConnection(userId) {
      const count = (connections.get(userId) || 0) + 1;
      connections.set(userId, count);
      return count === 1;
    },

    // Returns true when the user's last connection just closed.
    removeConnection(userId) {
      const count = (connections.get(userId) || 1) - 1;
      if (count <= 0) {
        connections.delete(userId);
        return true;
      }
      connections.set(userId, count);
      return false;
    },

    isOnline(userId) {
      return connections.has(String(userId));
    },

    addDemoPresence(userId) {
      const key = String(userId);
      const count = (demoPresence.get(key) || 0) + 1;
      demoPresence.set(key, count);
      return count === 1;
    },

    removeDemoPresence(userId) {
      const key = String(userId);
      const count = (demoPresence.get(key) || 1) - 1;
      if (count <= 0) {
        demoPresence.delete(key);
        return true;
      }
      demoPresence.set(key, count);
      return false;
    },

    isDemoOnline(userId) {
      return demoPresence.has(String(userId));
    },
  };
}
