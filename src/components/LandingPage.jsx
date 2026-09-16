import { Link } from 'react-router-dom';
import {
  MessageCircle,
  Sparkles,
  Palette,
  Rewind,
  Users,
  ShieldCheck,
  Smile,
  ArrowRight,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const FEATURES = [
  {
    icon: Palette,
    title: 'Mood-based themes',
    desc: 'Switch between Light and Dark — your chat, your vibe.',
  },
  {
    icon: Sparkles,
    title: 'Message effects',
    desc: 'Type "🎉" or "congrats" and watch confetti take over the screen.',
  },
  {
    icon: Rewind,
    title: 'ChatterBox Wrapped',
    desc: 'A fun, animated recap of your chats — your stats, your vibe, your year in messages.',
  },
  {
    icon: Smile,
    title: 'Vibe status',
    desc: 'Set a mood next to your name so people know your energy before they message you.',
  },
  {
    icon: Users,
    title: 'Reactions & replies',
    desc: 'React to any message with a tap — no long-press required.',
  },
  {
    icon: ShieldCheck,
    title: 'You stay in control',
    desc: 'Delete your own messages anytime, with a clear "deleted" trace — nothing vanishes silently.',
  },
];

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-brand">
          <div className="landing-brand-icon">
            <MessageCircle size={20} />
          </div>
          <span>ChatterBox</span>
        </div>
        <div className="landing-nav-actions">
          <Link to="/login" className="btn btn-ghost">
            Log In
          </Link>
          <Link to="/register" className="btn btn-primary">
            Get Started
          </Link>
        </div>
      </nav>

      <section className="landing-hero">
        <span className="landing-hero-badge fade-in">✨ Not your average chat app</span>
        <h1 className="landing-hero-title slide-up">
          Chatting, but make it <span className="landing-hero-accent">fun</span>.
        </h1>
        <p className="landing-hero-subtitle slide-up">
          ChatterBox is a real-time chat app with personality — themes that match your mood,
          effects that celebrate your wins, and your chat wrapup for the day.
        </p>
        <div className="landing-hero-actions slide-up">
          <Link to="/register" className="btn btn-primary landing-cta">
            Start chatting <ArrowRight size={16} />
          </Link>
          <Link to="/login" className="btn btn-ghost landing-cta">
            I already have an account
          </Link>
        </div>
      </section>

      <section className="landing-features">
        <h2 className="landing-features-title">Everything WhatsApp forgot to be fun</h2>
        <div className="landing-features-grid">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="landing-feature-card pop-in">
              <div className="landing-feature-icon">
                <Icon size={22} />
              </div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <button className="btn-ghost landing-theme-toggle" onClick={toggleTheme}>
          Currently previewing: {theme} theme — tap to toggle
        </button>
        <p>WEB INNOVATORS</p>
      </footer>
    </div>
  );
}