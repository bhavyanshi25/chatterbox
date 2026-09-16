import { useState, useRef, useEffect } from 'react';
import { Image, Check } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { WALLPAPERS } from '../data/wallpapers';

export default function WallpaperPicker({ conversationId }) {
  const { getConversationWallpaper, setConversationWallpaper } = useChat();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentId = getConversationWallpaper(conversationId);

  return (
    <div className="wallpaper-picker" ref={ref}>
      <button
        className="navbar-icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change wallpaper"
        title="Change wallpaper"
      >
        <Image size={18} />
      </button>

      {open && (
        <div className="wallpaper-picker-popup fade-in">
          <p className="wallpaper-picker-title">Chat wallpaper</p>
          <div className="wallpaper-picker-grid">
            {WALLPAPERS.map((w) => (
              <button
                key={w.id}
                className={`wallpaper-swatch ${currentId === w.id ? 'active' : ''}`}
                style={{
                  background: w.background,
                  backgroundSize: w.backgroundSize || 'cover',
                }}
                onClick={() => {
                  setConversationWallpaper(conversationId, w.id);
                  setOpen(false);
                }}
                title={w.name}
              >
                {currentId === w.id && <Check size={16} className="wallpaper-swatch-check" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}