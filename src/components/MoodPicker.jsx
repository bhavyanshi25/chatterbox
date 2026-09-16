import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { MOODS } from '../data/moods';

export default function MoodPicker() {
  const { currentUser, updateMood } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentMoodId = currentUser?.mood || 'none';
  const currentMood = MOODS.find((m) => m.id === currentMoodId) || MOODS[0];

  return (
    <div className="mood-picker" ref={ref}>
      <button
        className="navbar-icon-btn mood-picker-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label="Set your mood"
        title="Set your vibe"
      >
        <span className="mood-emoji">{currentMood.emoji}</span>
      </button>

      {open && (
        <div className="mood-picker-popup fade-in">
          <p className="mood-picker-title">Set your vibe</p>
          <div className="mood-picker-grid">
            {MOODS.map((m) => (
              <button
                key={m.id}
                className={`mood-picker-option ${currentMoodId === m.id ? 'active' : ''}`}
                onClick={() => {
                  updateMood(m.id);
                  setOpen(false);
                }}
                title={m.label}
              >
                <span className="mood-picker-emoji">{m.emoji}</span>
                <span className="mood-picker-label">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}