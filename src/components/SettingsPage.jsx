import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Volume2, Sparkles, LogOut, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { soundEnabled, toggleSound, effectsEnabled, toggleEffects } = useSettings();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <button className="btn-ghost profile-back" onClick={() => navigate('/chat')}>
          <ArrowLeft size={18} /> Back to chat
        </button>
      </header>

      <div className="settings-container slide-up">
        <h1 className="settings-title">Settings</h1>

        <section className="settings-section">
          <h2 className="settings-section-title">Preferences</h2>

          <div className="settings-row">
            <div className="settings-row-info">
              <Volume2 size={18} className="settings-row-icon" />
              <div>
                <span className="settings-row-label">Sound effects</span>
                <span className="settings-row-desc">Chimes on send/receive and effects</span>
              </div>
            </div>
            <button
              className={`toggle-switch ${soundEnabled ? 'on' : ''}`}
              onClick={toggleSound}
              role="switch"
              aria-checked={soundEnabled}
              aria-label="Toggle sound effects"
            >
              <span className="toggle-switch-thumb" />
            </button>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <Sparkles size={18} className="settings-row-icon" />
              <div>
                <span className="settings-row-label">Message effects</span>
                <span className="settings-row-desc">Confetti, hearts, fire on keyword triggers</span>
              </div>
            </div>
            <button
              className={`toggle-switch ${effectsEnabled ? 'on' : ''}`}
              onClick={toggleEffects}
              role="switch"
              aria-checked={effectsEnabled}
              aria-label="Toggle message effects"
            >
              <span className="toggle-switch-thumb" />
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Appearance</h2>
          <div className="settings-row">
            <div className="settings-row-info">
              <Moon size={18} className="settings-row-icon" />
              <div>
                <span className="settings-row-label">Dark mode</span>
                <span className="settings-row-desc">Switch between light and dark</span>
              </div>
            </div>
            <button
              className={`toggle-switch ${theme === 'dark' ? 'on' : ''}`}
              onClick={toggleTheme}
              role="switch"
              aria-checked={theme === 'dark'}
              aria-label="Toggle dark mode"
            >
              <span className="toggle-switch-thumb" />
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Account</h2>
          <div className="settings-account-info">
            <div>
              <span className="settings-row-label">{currentUser?.name}</span>
              <span className="settings-row-desc">{currentUser?.email}</span>
            </div>
          </div>
          <button className="btn btn-ghost settings-logout-btn" onClick={handleLogout}>
            <LogOut size={16} /> Log out
          </button>
        </section>
      </div>
    </div>
  );
}