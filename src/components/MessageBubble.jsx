import { useState } from 'react';
import { Check, CheckCheck, SmilePlus, Trash2 } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { formatMessageTime } from '../utils/formatTime';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

export default function MessageBubble({ message, conversationId }) {
  const { addReaction, deleteMessage } = useChat();
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isMine = message.senderId === 'me';

  const handleReact = (emoji) => {
    addReaction(conversationId, message.id, emoji);
    setShowReactionPicker(false);
  };

  const handleConfirmDelete = () => {
    deleteMessage(conversationId, message.id);
    setShowDeleteConfirm(false);
  };

  if (message.deleted) {
    return (
      <div className={`message-row ${isMine ? 'mine' : 'theirs'}`}>
        <div className="message-bubble-wrap">
          <div className="message-bubble deleted">
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
    <div className={`message-row ${isMine ? 'mine' : 'theirs'} pop-in`}>
      <div className="message-bubble-wrap">
        <div className={`message-bubble ${isMine ? 'sent' : 'received'}`}>
          <p className="message-text">{message.text}</p>

          <div className="message-meta">
            <span className="message-time">{formatMessageTime(message.timestamp)}</span>
            {isMine && (
              <span className="message-status">
                {message.status === 'read' ? (
                  <CheckCheck size={14} className="status-read" />
                ) : message.status === 'delivered' ? (
                  <CheckCheck size={14} />
                ) : (
                  <Check size={14} />
                )}
              </span>
            )}
          </div>

          <div className="message-hover-actions">
            <button
              className="message-action-btn"
              onClick={() => setShowReactionPicker((s) => !s)}
              aria-label="Add reaction"
            >
              <SmilePlus size={14} />
            </button>

            {isMine && (
              <button
                className="message-action-btn message-action-danger"
                onClick={() => setShowDeleteConfirm(true)}
                aria-label="Delete message"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {showReactionPicker && (
            <div className="message-react-popup fade-in">
              {QUICK_REACTIONS.map((emoji) => (
                <button key={emoji} onClick={() => handleReact(emoji)}>
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

        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="message-reactions">
            {Object.entries(message.reactions).map(([emoji, count]) => (
              <span key={emoji} className="message-reaction-chip">
                {emoji} {count}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}