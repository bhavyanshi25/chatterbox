import { createContext, useContext, useEffect, useState } from 'react';
import { api, SESSION_EXPIRED_EVENT } from '../api/client';

const AuthContext = createContext(null);

// The session lives in an httpOnly cookie set by the server, so the browser
// never sees the token. On load we ask the server who we are.
export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/api/auth/me')
      .then((data) => {
        if (!cancelled) setCurrentUser(data.user);
      })
      .catch((err) => {
        // 401 just means "not logged in"; anything else is worth surfacing.
        if (!cancelled && err.status !== 401) setSessionError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onExpired = () => setCurrentUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const register = async ({ name, email, password }) => {
    const { user } = await api.post('/api/auth/register', { name, email, password });
    setSessionError('');
    setCurrentUser(user);
    return user;
  };

  const login = async ({ email, password }) => {
    const { user } = await api.post('/api/auth/login', { email, password });
    setSessionError('');
    setCurrentUser(user);
    return user;
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      // Even if the request fails, forget the user locally.
      setCurrentUser(null);
    }
  };

  // Updates any subset of profile fields (name, bio, avatar, mood).
  const updateProfile = async (fields) => {
    const { user } = await api.patch('/api/users/me', fields);
    setCurrentUser(user);
    return user;
  };

  const updateMood = (mood) => updateProfile({ mood });

  // Applies profile changes made in another tab/device (via the socket).
  const syncUser = (user) => {
    setCurrentUser((prev) => (prev && prev.id === user.id ? { ...prev, ...user } : prev));
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        sessionError,
        login,
        register,
        logout,
        updateMood,
        updateProfile,
        syncUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
