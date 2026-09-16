import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Mail, Lock, User, Eye, EyeOff, Moon, Sun, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Register() {
  const { register } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      register({ name: name.trim(), email: email.trim(), password });
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
          <p className="auth-subtitle">Create an account to start chatting.</p>

          {error && <div className="auth-error fade-in">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-field">
              <span>Full name</span>
              <div className="auth-input-wrap">
                <User size={16} className="auth-input-icon" />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            </label>

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
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
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

            <label className="auth-field">
              <span>Confirm password</span>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </label>

            <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account? <Link to="/login">Log in</Link>
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