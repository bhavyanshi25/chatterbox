import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, LogOut, UserMinus, UserPlus, Pencil, Check } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import Modal from './Modal';
import { PeoplePicker } from './NewGroupModal';
import { formatLastSeen } from '../utils/formatTime';

// Members, roles and admin controls for a group conversation.
export default function GroupInfoModal({ conversation, onClose }) {
  const navigate = useNavigate();
  const {
    currentUserId,
    users,
    getUserById,
    renameGroup,
    addGroupMembers,
    setMemberRole,
    removeGroupMember,
  } = useChat();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(conversation.name);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const me = conversation.members.find((m) => m.user.id === currentUserId);
  const iAmAdmin = me?.role === 'admin';
  const memberIds = new Set(conversation.members.map((m) => m.user.id));
  const candidates = users.filter((u) => !memberIds.has(u.id));

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!name.trim()) return setError('Group name is required.');
    if (await act(() => renameGroup(conversation.id, name.trim()))) setEditingName(false);
  };

  const handleAdd = async () => {
    if (toAdd.length === 0) return;
    if (await act(() => addGroupMembers(conversation.id, toAdd))) {
      setAdding(false);
      setToAdd([]);
    }
  };

  const handleLeave = async () => {
    if (!window.confirm(`Leave "${conversation.name}"? You'll lose access to its messages.`)) return;
    if (await act(() => removeGroupMember(conversation.id, currentUserId))) {
      onClose();
      navigate('/chat');
    }
  };

  const sortedMembers = [...conversation.members].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
    return (getUserById(a.user.id)?.name || '').localeCompare(getUserById(b.user.id)?.name || '');
  });

  return (
    <Modal title="Group info" onClose={onClose}>
      {error && <div className="auth-error">{error}</div>}

      <div className="group-info-name">
        {editingName ? (
          <div className="profile-inline-edit">
            <input
              className="input-field"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              autoFocus
            />
            <button className="profile-inline-save" onClick={handleRename} disabled={busy} aria-label="Save name">
              <Check size={16} />
            </button>
          </div>
        ) : (
          <>
            <h3>{conversation.name}</h3>
            {iAmAdmin && (
              <button className="navbar-icon-btn" onClick={() => setEditingName(true)} aria-label="Rename group">
                <Pencil size={15} />
              </button>
            )}
          </>
        )}
      </div>
      <p className="group-info-count">{conversation.members.length} members</p>

      <div className="group-member-list">
        {sortedMembers.map(({ user, role }) => {
          const u = getUserById(user.id) || user;
          const isMe = user.id === currentUserId;
          return (
            <div key={user.id} className="group-member">
              <img src={u.avatar} alt="" className="avatar" width={36} height={36} />
              <div className="group-member-info">
                <span className="group-member-name">
                  {isMe ? 'You' : u.name}
                  {role === 'admin' && (
                    <span className="group-member-badge">
                      <Crown size={11} /> Admin
                    </span>
                  )}
                </span>
                <span className="group-member-status">
                  {isMe ? 'Online' : u.online ? 'Online' : formatLastSeen(u.lastSeen)}
                </span>
              </div>
              {iAmAdmin && !isMe && (
                <div className="group-member-actions">
                  <button
                    className="btn btn-ghost group-member-btn"
                    disabled={busy}
                    onClick={() => act(() => setMemberRole(conversation.id, user.id, role === 'admin' ? 'member' : 'admin'))}
                  >
                    {role === 'admin' ? 'Remove admin' : 'Make admin'}
                  </button>
                  <button
                    className="navbar-icon-btn group-member-remove"
                    disabled={busy}
                    onClick={() => act(() => removeGroupMember(conversation.id, user.id))}
                    aria-label={`Remove ${u.name}`}
                    title="Remove from group"
                  >
                    <UserMinus size={16} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {iAmAdmin &&
        (adding ? (
          <div className="group-add">
            {candidates.length === 0 ? (
              <p className="people-picker-empty">Everyone is already in this group.</p>
            ) : (
              <PeoplePicker
                people={candidates}
                selected={toAdd}
                onToggle={(id) => setToAdd((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
              />
            )}
            <div className="modal-inline-actions">
              <button className="btn btn-ghost" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={busy || toAdd.length === 0}>
                Add {toAdd.length || ''}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-ghost group-action-btn" onClick={() => setAdding(true)}>
            <UserPlus size={16} /> Add members
          </button>
        ))}

      <button className="btn btn-ghost group-action-btn group-leave-btn" onClick={handleLeave} disabled={busy}>
        <LogOut size={16} /> Leave group
      </button>
    </Modal>
  );
}
