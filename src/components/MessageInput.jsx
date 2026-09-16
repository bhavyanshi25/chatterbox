import { useState, useRef, useEffect } from 'react';
import { Send, Smile } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { useChat } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';

export default function MessageInput({ conversationId }) {
  const { sendMessage } = useChat();
  const { theme } = useTheme();
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(conversationId, text);
    setText('');
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiClick = (emojiData) => {
    setText((t) => t + emojiData.emoji);
  };

  return (
    <div className="message-input-bar">
      {showEmojiPicker && (
        <div className="emoji-picker-wrap" ref={pickerRef}>
          <EmojiPicker onEmojiClick={handleEmojiClick} theme={theme} height={350} width={300} />
        </div>
      )}

      <button
        className="message-input-icon-btn"
        onClick={() => setShowEmojiPicker((s) => !s)}
        aria-label="Open emoji picker"
      >
        <Smile size={20} />
      </button>

      <textarea
        className="message-input-textarea"
        placeholder="Type a message"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
      />

      <button
        className="message-input-send"
        onClick={handleSend}
        disabled={!text.trim()}
        aria-label="Send message"
      >
        <Send size={18} />
      </button>
    </div>
  );
}