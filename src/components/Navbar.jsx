import { LogOut, MessageCircle, Settings, Sparkles, Users, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import MoodPicker from './MoodPicker';
import AvatarRing from './AvatarRing';
import { getMoodEmoji } from '../data/moods';

export default function Navbar() {
  const { currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const moodEmoji = getMoodEmoji(currentUser?.mood);

  return (
    <header className="navbar">
      <div className="navbar-brand">
        <div className="navbar-brand-icon">
          <MessageCircle size={20} />
        </div>
        <span>ChatterBox</span>
      </div>

      <div className="navbar-actions">
        <button
          className="navbar-icon-btn"
          onClick={() => navigate('/contacts')}
          aria-label="People"
          title="People"
        >
          <Users size={18} />
        </button>

        <button
          className="navbar-icon-btn navbar-wrapped-btn"
          onClick={() => navigate('/wrapped')}
          aria-label="Your ChatterBox Wrapped"
          title="Your ChatterBox Wrapped"
        >
          <Sparkles size={18} />
        </button>

        <MoodPicker />

        <button
          className="navbar-icon-btn"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title="Toggle light/dark"
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <button
          className="navbar-icon-btn"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={18} />
        </button>

        <button className="navbar-user navbar-user-btn" onClick={() => navigate('/profile')}>
          <AvatarRing src={currentUser?.avatar} alt={currentUser?.name} online size={30} />
          <span className="navbar-username">
            {currentUser?.name}
            {moodEmoji && moodEmoji !== '💬' && (
              <span className="navbar-mood-emoji">{moodEmoji}</span>
            )}
          </span>
        </button>

        <button
          className="navbar-icon-btn"
          onClick={handleLogout}
          aria-label="Log out"
          title="Log out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}