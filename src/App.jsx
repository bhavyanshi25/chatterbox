import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';
import { ChatProvider } from './context/ChatContext';
import LandingPage from './components/LandingPage';
import Login from './components/Login';
import Register from './components/Register';
import ChatLayout from './components/ChatLayout';
import ProfilePage from './components/ProfilePage';
import SettingsPage from './components/SettingsPage';
import WrappedPage from './components/WrappedPage';
import ContactsPage from './components/ContactsPage';
import ProtectedRoute from './components/ProtectedRoute';
import './index.css';

function AppRoutes() {
  const { currentUser, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route
        path="/"
        element={currentUser ? <Navigate to="/chat" replace /> : <LandingPage />}
      />
      <Route
        path="/login"
        element={currentUser ? <Navigate to="/chat" replace /> : <Login />}
      />
      <Route
        path="/register"
        element={currentUser ? <Navigate to="/chat" replace /> : <Register />}
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <ChatLayout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wrapped"
        element={
          <ProtectedRoute>
            <WrappedPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <ProtectedRoute>
            <ContactsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="*"
        element={<Navigate to={currentUser ? '/chat' : '/'} replace />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AuthProvider>
          <ChatProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </ChatProvider>
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}