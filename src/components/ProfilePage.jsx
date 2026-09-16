import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AvatarRing from './AvatarRing';
import { MOODS } from '../data/moods';

export default function ProfilePage() {
  const { currentUser, updateProfile, updateMood } = useAuth();
  const navigate = useNavigate();

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(currentUser?.name || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar || '');
  const [savedFlash, setSavedFlash] = useState(false);

  const currentMoodId = currentUser?.mood || 'none';

  const flashSaved = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const handleSaveName = () => {
    if (!name.trim()) return;
    updateProfile({ name: name.trim() });
    setEditingName(false);
    flashSaved();
  };

  const handleSaveBio = () => {
    updateProfile({ bio: bio.trim() });
    flashSaved();
  };

  const handleSaveAvatar = () => {
    if (!avatarUrl.trim()) return;
    updateProfile({ avatar: avatarUrl.trim() });
    flashSaved();
  };

  return (
    <div className="profile-page">
      <header className="profile-page-header">
        <button className="btn-ghost profile-back" onClick={() => navigate('/chat')}>
          <ArrowLeft size={18} /> Back to chat
        </button>
        {savedFlash && <span className="profile-saved-flash fade-in">Saved ✓</span>}
      </header>

      <div className="profile-card slide-up">
        <div className="profile-avatar-section">
          <AvatarRing src={currentUser?.avatar} alt={currentUser?.name} online size={90} />
          <div className="profile-avatar-input-row">
            <input
              type="text"
              className="input-field"
              placeholder="Paste an image URL"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleSaveAvatar}>
              Update photo
            </button>
          </div>
          <p className="profile-avatar-hint">
            No file upload yet (needs a backend) — paste a direct image link for now, e.g. from{' '}
            <a href="https://i.pravatar.cc" target="_blank" rel="noreferrer">
              i.pravatar.cc
            </a>
            .
          </p>
        </div>

        <div className="profile-field-block">
          <span className="profile-field-label">Name</span>
          {editingName ? (
            <div className="profile-inline-edit">
              <input
                type="text"
                className="input-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <button className="profile-inline-save" onClick={handleSaveName}>
                <Check size={16} />
              </button>
            </div>
          ) : (
            <button className="profile-field-value profile-field-editable" onClick={() => setEditingName(true)}>
              {currentUser?.name}
              <Pencil size={14} />
            </button>
          )}
        </div>

        <div className="profile-field-block">
          <span className="profile-field-label">Email</span>
          <span className="profile-field-value profile-field-static">{currentUser?.email}</span>
        </div>

        <div className="profile-field-block">
          <span className="profile-field-label">Status / bio</span>
          <textarea
            className="input-field profile-bio-textarea"
            placeholder="Tell people a bit about yourself…"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={140}
            rows={3}
          />
          <div className="profile-bio-footer">
            <span>{bio.length}/140</span>
            <button className="btn btn-primary profile-bio-save" onClick={handleSaveBio}>
              Save bio
            </button>
          </div>
        </div>

        <div className="profile-field-block">
          <span className="profile-field-label">Current vibe</span>
          <div className="profile-mood-grid">
            {MOODS.map((m) => (
              <button
                key={m.id}
                className={`mood-picker-option ${currentMoodId === m.id ? 'active' : ''}`}
                onClick={() => {
                  updateMood(m.id);
                  flashSaved();
                }}
              >
                <span className="mood-picker-emoji">{m.emoji}</span>
                <span className="mood-picker-label">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}