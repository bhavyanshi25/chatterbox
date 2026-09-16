import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Mail, Lock, Eye, EyeOff, Moon, Sun, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const REMEMBERED_EMAIL_KEY = 'chatapp_remembered_email';

export default function Login() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      login({ email: email.trim(), password });

      if (rememberMe) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      navigate('/chat');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page auth-page-split">
      <Link to="/" className="auth-back-link">
        <ArrowLeft size={16} /> Back to ChatterBox
      </Link>

      <button className="theme-toggle-fab" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <div className="auth-split-left">
        <div className="auth-card slide-up">
          <p className="auth-subtitle">Welcome back. Log in to keep the conversation going.</p>

          {error && <div className="auth-error fade-in">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-field">
              <span>Email</span>
              <div className="auth-input-wrap">
                <Mail size={16} className="auth-input-icon" />
                <input
                  type="email"
                  className="input-field"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </label>

            <label className="auth-field">
              <span>Password</span>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-input-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <label className="auth-remember-row">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember my email on this device</span>
            </label>

            <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Log In'}
            </button>
          </form>

          <p className="auth-switch">
            Don't have an account? <Link to="/register">Create one</Link>
          </p>
        </div>
      </div>

      <div className="auth-split-right">
        <div className="auth-brand-panel">
          <div className="auth-brand-icon-large">
            <MessageCircle size={36} />
          </div>
          <h1 className="auth-brand-title">ChatterBox</h1>
          <p className="auth-brand-tagline">The new Gen-Z chatting app 💬✨</p>
        </div>
      </div>
    </div>
  );
}