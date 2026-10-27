import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useClickOutside } from '../hooks/useClickOutside';
import { MOODS } from '../data/moods';

export default function MoodPicker() {
  const { currentUser, updateMood } = useAuth();
  const { notify } = useChat();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useClickOutside(ref, () => setOpen(false), open);

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
                  updateMood(m.id).catch((err) => notify(err.message || "Couldn't update your mood."));
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