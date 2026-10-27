import { useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  SmilePlus,
  Trash2,
  Reply,
  Pencil,
  ImageOff,
  MoreHorizontal,
  Pin,
} from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useClickOutside } from '../hooks/useClickOutside';
import { formatMessageTime } from '../utils/formatTime';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

function MessageEditor({ initialText, allowEmpty, onSave, onCancel }) {
  const [draft, setDraft] = useState(initialText);
  const canSave = allowEmpty || draft.trim().length > 0;

  const handleSave = () => {
    if (canSave) onSave(draft);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="message-edit">
      <textarea
        className="message-edit-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          const end = e.target.value.length;
          e.target.setSelectionRange(end, end);
        }}
        rows={Math.min(6, Math.max(2, draft.split('\n').length))}
        maxLength={4000}
        aria-label="Edit message"
        autoFocus
      />
      <div className="message-edit-actions">
        <button type="button" className="btn-ghost message-edit-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="message-edit-save"
          onClick={handleSave}
          disabled={!canSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function StatusIcon({ status }) {
  if (status === 'pending') return <Clock size={13} aria-label="Sending" />;
  if (status === 'failed') return <AlertCircle size={14} className="status-failed" aria-label="Not sent" />;
  if (status === 'read') return <CheckCheck size={14} className="status-read" aria-label="Read" />;
  if (status === 'delivered') return <CheckCheck size={14} aria-label="Delivered" />;
  return <Check size={14} aria-label="Sent" />;
}

export default function MessageBubble({
  message,
  conversationId,
  showSenderName,
  canPin,
  isPinned,
  onReply,
  onJumpToMessage,
  onTogglePin,
  onRetry,
  onDiscard,
  isHighlighted,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onImageLoad,
}) {
  const { addReaction, deleteMessage } = useChat();
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const bubbleRef = useRef(null);
  const isMine = message.isMine;
  const isLocal = message.pending || message.failed;

  const closePopups = () => {
    setShowReactionPicker(false);
    setShowMenu(false);
    setShowDeleteConfirm(false);
  };

  useClickOutside(bubbleRef, closePopups, showReactionPicker || showMenu || showDeleteConfirm);

  const handleReact = (emoji) => {
    addReaction(conversationId, message.id, emoji);
    setShowReactionPicker(false);
  };

  const handleConfirmDelete = () => {
    deleteMessage(conversationId, message.id);
    setShowDeleteConfirm(false);
  };

  const menuAction = (fn) => () => {
    closePopups();
    fn();
  };

  const rowClass = `message-row ${isMine ? 'mine' : 'theirs'}`;

  if (message.deleted) {
    return (
      <div className={rowClass} id={`msg-${message.id}`}>
        <div className="message-bubble-wrap">
          <div className={`message-bubble deleted ${isHighlighted ? 'highlight-flash' : ''}`}>
            <p className="message-text message-text-deleted">This message was deleted</p>
            <div className="message-meta">
              <span className="message-time">{formatMessageTime(message.timestamp)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${rowClass} pop-in ${showReactionPicker || showMenu || showDeleteConfirm ? 'has-popup' : ''}`}
      id={`msg-${message.id}`}
    >
      <div className={`message-bubble-wrap ${isEditing ? 'editing' : ''}`}>
        {showSenderName && <span className="message-sender-name">{message.senderName}</span>}
        <div
          ref={bubbleRef}
          className={`message-bubble ${isMine ? 'sent' : 'received'} ${
            isHighlighted ? 'highlight-flash' : ''
          } ${message.image ? 'has-image' : ''} ${message.failed ? 'failed' : ''}`}
          tabIndex={isEditing ? undefined : 0}
        >
          {isPinned && (
            <span className="message-flags" aria-label="Pinned">
              <Pin size={11} />
            </span>
          )}

          {message.replyTo && (
            <button
              type="button"
              className="message-reply-quote"
              onClick={() => onJumpToMessage(message.replyTo.messageId)}
            >
              <span className="message-reply-quote-name">{message.replyTo.senderName}</span>
              <span className="message-reply-quote-text">{message.replyTo.text}</span>
            </button>
          )}

          {message.image &&
            (message.image.url ? (
              <a
                href={message.image.url}
                target="_blank"
                rel="noreferrer"
                className="message-image-link"
              >
                <img
                  src={message.image.url}
                  alt={message.image.name || 'Image attachment'}
                  className={`message-image ${message.pending ? 'uploading' : ''}`}
                  onLoad={onImageLoad}
                />
              </a>
            ) : (
              <div className="message-image-unavailable">
                <ImageOff size={16} />
                <span>Image unavailable</span>
              </div>
            ))}

          {isEditing ? (
            <MessageEditor
              initialText={message.text}
              allowEmpty={Boolean(message.image)}
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
            />
          ) : (
            message.text && <p className="message-text">{message.text}</p>
          )}

          <div className="message-meta">
            {message.editedAt && <span className="message-edited">edited</span>}
            <span className="message-time">{formatMessageTime(message.timestamp)}</span>
            {isMine && (
              <span className="message-status">
                <StatusIcon status={message.status} />
              </span>
            )}
          </div>

          {message.failed && (
            <div className="message-failed">
              <span>{message.error || 'Not sent.'}</span>
              <button onClick={onRetry}>Retry</button>
              <button onClick={onDiscard}>Discard</button>
            </div>
          )}

          {!isEditing && !isLocal && (
            <div className="message-hover-actions">
              <button
                className="message-action-btn"
                onClick={() => {
                  setShowMenu(false);
                  setShowDeleteConfirm(false);
                  setShowReactionPicker((s) => !s);
                }}
                aria-label="Add reaction"
                title="React"
              >
                <SmilePlus size={14} />
              </button>

              <button
                className="message-action-btn"
                onClick={() => onReply(message)}
                aria-label="Reply to message"
                title="Reply"
              >
                <Reply size={14} />
              </button>

              <button
                className="message-action-btn"
                onClick={() => {
                  setShowReactionPicker(false);
                  setShowDeleteConfirm(false);
                  setShowMenu((s) => !s);
                }}
                aria-label="More actions"
                aria-expanded={showMenu}
                title="More"
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          )}

          {showMenu && (
            <div className="message-menu fade-in" role="menu">
              {canPin && (
                <button role="menuitem" onClick={menuAction(onTogglePin)}>
                  <Pin size={14} /> {isPinned ? 'Unpin' : 'Pin'}
                </button>
              )}
              {isMine && (
                <button role="menuitem" onClick={menuAction(onStartEdit)}>
                  <Pencil size={14} /> Edit
                </button>
              )}
              {isMine && (
                <button
                  role="menuitem"
                  className="message-menu-danger"
                  onClick={() => {
                    setShowMenu(false);
                    setShowDeleteConfirm(true);
                  }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          )}

          {showReactionPicker && (
            <div className="message-react-popup fade-in">
              {QUICK_REACTIONS.map((emoji) => (
                <button key={emoji} onClick={() => handleReact(emoji)} aria-label={`React ${emoji}`}>
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {showDeleteConfirm && (
            <div className="message-delete-popup fade-in">
              <p>Delete this message?</p>
              <div className="message-delete-popup-actions">
                <button
                  className="btn-ghost message-delete-cancel"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  className="message-delete-confirm"
                  onClick={handleConfirmDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {Object.keys(message.reactions).length > 0 && (
          <div className="message-reactions">
            {Object.entries(message.reactions).map(([emoji, count]) => (
              <button
                key={emoji}
                className={`message-reaction-chip ${message.myReactions.includes(emoji) ? 'mine' : ''}`}
                onClick={() => handleReact(emoji)}
                aria-label={`${emoji} ${count}${message.myReactions.includes(emoji) ? ', including you' : ''}`}
              >
                {emoji} {count}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
