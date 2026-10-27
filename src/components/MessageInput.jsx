import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Send, Smile, Paperclip, X, Reply, AlertCircle } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';
import { useClickOutside } from '../hooks/useClickOutside';

// The emoji picker is large, so it's only downloaded the first time it's opened.
const EmojiPicker = lazy(() => import('emoji-picker-react'));

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_TEXTAREA_HEIGHT = 120;
const TYPING_IDLE_MS = 3000;

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateImage(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Only JPG, PNG, GIF or WebP images can be attached.';
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return `That image is ${formatFileSize(file.size)} — the limit is ${formatFileSize(MAX_IMAGE_SIZE)}.`;
  }
  return null;
}

export default function MessageInput({ conversationId, replyingTo, onCancelReply }) {
  const { sendMessage, sendTyping } = useChat();
  const { theme } = useTheme();
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // { file, previewUrl } — previewUrl is a temporary object URL owned by this component.
  const [attachment, setAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');
  const emojiAnchorRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  // Typing indicator: announce at most every few seconds, stop after a pause.
  const typingRef = useRef({ active: false, lastSent: 0, timer: null });

  useClickOutside(emojiAnchorRef, () => setShowEmojiPicker(false), showEmojiPicker);

  // Revoke the preview URL whenever the attachment is replaced, removed, sent, or we unmount.
  useEffect(() => {
    if (!attachment) return;
    const { previewUrl } = attachment;
    return () => URL.revokeObjectURL(previewUrl);
  }, [attachment]);

  useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
  }, [replyingTo]);

  useEffect(() => {
    const typing = typingRef.current;
    return () => {
      clearTimeout(typing.timer);
      if (typing.active) sendTyping(conversationId, false);
    };
  }, [conversationId, sendTyping]);

  const stopTyping = () => {
    const typing = typingRef.current;
    clearTimeout(typing.timer);
    if (typing.active) sendTyping(conversationId, false);
    typing.active = false;
  };

  const noteTyping = (value) => {
    const typing = typingRef.current;
    if (!value.trim()) return stopTyping();
    const now = Date.now();
    if (!typing.active || now - typing.lastSent > TYPING_IDLE_MS) {
      sendTyping(conversationId, true);
      typing.active = true;
      typing.lastSent = now;
    }
    clearTimeout(typing.timer);
    typing.timer = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  };

  const attachFile = (file) => {
    const error = validateImage(file);
    if (error) {
      setAttachmentError(error);
      return;
    }
    setAttachmentError('');
    setAttachment({ file, previewUrl: URL.createObjectURL(file) });
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = '';
    if (file) attachFile(file);
  };

  const handlePaste = (e) => {
    const file = Array.from(e.clipboardData?.files || []).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    attachFile(file);
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentError('');
  };

  const canSend = Boolean(text.trim() || attachment);

  const handleSend = () => {
    if (!canSend) return;
    // ChatContext uploads the file (if any), then sends; the message shows
    // as "sending" until the server confirms it's saved.
    sendMessage(conversationId, { text, replyTo: replyingTo, file: attachment?.file ?? null });
    stopTyping();
    setText('');
    setAttachment(null);
    setAttachmentError('');
    setShowEmojiPicker(false);
    onCancelReply?.();
    requestAnimationFrame(resizeTextarea);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && replyingTo) onCancelReply?.();
  };

  const handleEmojiClick = (emojiData) => {
    setText((t) => t + emojiData.emoji);
  };

  return (
    <div className="message-input-area">
      {replyingTo && (
        <div className="reply-preview-bar fade-in">
          <Reply size={16} className="reply-preview-icon" />
          <div className="reply-preview-content">
            <span className="reply-preview-name">Replying to {replyingTo.senderName}</span>
            <span className="reply-preview-text">{replyingTo.text}</span>
          </div>
          <button className="reply-preview-cancel" onClick={onCancelReply} aria-label="Cancel reply">
            <X size={16} />
          </button>
        </div>
      )}

      {attachment && (
        <div className="attachment-preview-bar fade-in">
          <div className="attachment-preview">
            <img
              src={attachment.previewUrl}
              alt="Attachment preview"
              onError={() => {
                setAttachment(null);
                setAttachmentError("Couldn't read that image. Try a different file.");
              }}
            />
            <button
              className="attachment-preview-remove"
              onClick={removeAttachment}
              aria-label="Remove attachment"
              title="Remove"
            >
              <X size={14} />
            </button>
          </div>
          <div className="attachment-preview-info">
            <span className="attachment-preview-name">{attachment.file.name}</span>
            <span className="attachment-preview-size">{formatFileSize(attachment.file.size)}</span>
          </div>
        </div>
      )}

      {attachmentError && (
        <div className="attachment-error fade-in" role="alert">
          <AlertCircle size={15} />
          <span>{attachmentError}</span>
          <button onClick={() => setAttachmentError('')} aria-label="Dismiss error">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="message-input-bar">
        <div className="emoji-picker-anchor" ref={emojiAnchorRef}>
          {showEmojiPicker && (
            <div className="emoji-picker-wrap">
              <Suspense fallback={<div className="emoji-picker-loading">Loading emojis…</div>}>
                <EmojiPicker onEmojiClick={handleEmojiClick} theme={theme} height={350} width="100%" />
              </Suspense>
            </div>
          )}

          <button
            className="message-input-icon-btn"
            onClick={() => setShowEmojiPicker((s) => !s)}
            aria-label="Open emoji picker"
            aria-expanded={showEmojiPicker}
          >
            <Smile size={20} />
          </button>
        </div>

        <button
          className="message-input-icon-btn"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach an image"
          title="Attach an image (JPG, PNG, GIF, WebP · max 5 MB)"
        >
          <Paperclip size={20} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          onChange={handleFileChange}
          hidden
        />

        <textarea
          ref={textareaRef}
          className="message-input-textarea"
          placeholder={attachment ? 'Add a caption' : 'Type a message'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            noteTyping(e.target.value);
            resizeTextarea();
          }}
          maxLength={4000}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
        />

        <button
          className="message-input-send"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
