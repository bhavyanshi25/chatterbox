import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('chatapp_current_user');
    if (stored) setCurrentUser(JSON.parse(stored));
    setLoading(false);
  }, []);

  const getStoredUsers = () => {
    const raw = localStorage.getItem('chatapp_users');
    return raw ? JSON.parse(raw) : [];
  };

  const register = ({ name, email, password }) => {
    const users = getStoredUsers();
    if (users.some((u) => u.email === email)) {
      throw new Error('An account with this email already exists.');
    }
    const newUser = {
      id: 'me',
      name,
      email,
      password, // mock only — see earlier warning about real auth
      avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(email)}`,
      mood: 'none',
      bio: '',
    };
    localStorage.setItem('chatapp_users', JSON.stringify([...users, newUser]));
    localStorage.setItem('chatapp_current_user', JSON.stringify(newUser));
    setCurrentUser(newUser);
    return newUser;
  };

  const login = ({ email, password }) => {
    const users = getStoredUsers();
    const found = users.find((u) => u.email === email && u.password === password);
    if (!found) {
      throw new Error('Invalid email or password.');
    }
    localStorage.setItem('chatapp_current_user', JSON.stringify(found));
    setCurrentUser(found);
    return found;
  };

  const logout = () => {
    localStorage.removeItem('chatapp_current_user');
    setCurrentUser(null);
  };

  const updateMood = (mood) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, mood };
      localStorage.setItem('chatapp_current_user', JSON.stringify(updated));
      const users = getStoredUsers();
      const updatedUsers = users.map((u) => (u.id === prev.id ? { ...u, mood } : u));
      localStorage.setItem('chatapp_users', JSON.stringify(updatedUsers));
      return updated;
    });
  };

  // Updates any subset of profile fields (name, bio, avatar).
  const updateProfile = (fields) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...fields };
      localStorage.setItem('chatapp_current_user', JSON.stringify(updated));
      const users = getStoredUsers();
      const updatedUsers = users.map((u) => (u.id === prev.id ? { ...u, ...fields } : u));
      localStorage.setItem('chatapp_users', JSON.stringify(updatedUsers));
      return updated;
    });
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, loading, login, register, logout, updateMood, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}