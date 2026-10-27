import { useState } from 'react';
import { Check } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import Modal from './Modal';

// Lets the user pick people (from the directory) and name a new group.
export function PeoplePicker({ people, selected, onToggle }) {
  const [query, setQuery] = useState('');
  const filtered = people.filter((u) => u.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="people-picker">
      <input
        type="text"
        className="input-field"
        placeholder="Search people"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="people-picker-list">
        {filtered.length === 0 && <p className="people-picker-empty">Nobody matches.</p>}
        {filtered.map((u) => {
          const isSelected = selected.includes(u.id);
          return (
            <button
              type="button"
              key={u.id}
              className={`people-picker-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onToggle(u.id)}
              aria-pressed={isSelected}
            >
              <img src={u.avatar} alt="" className="avatar" width={32} height={32} />
              <span className="people-picker-name">{u.name}</span>
              <span className="people-picker-check">{isSelected && <Check size={14} />}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function NewGroupModal({ onClose, onCreated }) {
  const { users, createGroup } = useChat();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleCreate = async () => {
    if (!name.trim()) return setError('Give the group a name.');
    if (selected.length === 0) return setError('Pick at least one person.');
    setSubmitting(true);
    setError('');
    try {
      const id = await createGroup(name.trim(), selected);
      onCreated(id);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="New group"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={submitting}>
            {submitting ? 'Creating…' : `Create${selected.length ? ` (${selected.length + 1})` : ''}`}
          </button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <label className="modal-field">
        <span>Group name</span>
        <input
          type="text"
          className="input-field"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Weekend plans"
          autoFocus
        />
      </label>
      <span className="modal-label">Members</span>
      {users.length === 0 ? (
        <p className="people-picker-empty">No one else has signed up yet.</p>
      ) : (
        <PeoplePicker people={users} selected={selected} onToggle={toggle} />
      )}
    </Modal>
  );
}
