import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { computeChatStats } from '../utils/chatStats';
import EffectOverlay from './EffectOverlay';

const CARD_DURATION = 3200;
const SUMMARY_DURATION = 6000;

export default function WrappedPage() {
  const navigate = useNavigate();
  const { conversations, getUserById, activeEffect, clearEffect, triggerEffect } = useChat();
  const { currentUser } = useAuth();
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);

  const stats = useMemo(
    () => computeChatStats(conversations, getUserById),
    [conversations, getUserById]
  );

  const cards = useMemo(() => {
    return [
      {
        gradient: 'linear-gradient(160deg, #7c7ff2, #9b7fd6)',
        emoji: '👋',
        title: `Hey ${currentUser?.name?.split(' ')[0] || 'there'}!`,
        subtitle: "Let's rewind your ChatterBox story ✨ Ready?",
      },
      {
        gradient: 'linear-gradient(160deg, #d47fa8, #e0966b)',
        emoji: '💌',
        title: `${stats.totalSent}`,
        subtitle:
          stats.totalSent === 0
            ? 'Zero messages sent so far 👀 the chat is waiting for you!'
            : `message${stats.totalSent === 1 ? '' : 's'} sent into the void (well, to actual people). Certified chatterbox behavior 🐝`,
      },
      {
        gradient: 'linear-gradient(160deg, #c78f5c, #c46b62)',
        emoji: '🏆',
        title: stats.mostActiveParticipant ? stats.mostActiveParticipant.name : 'Nobody yet 🕸️',
        subtitle: stats.mostActiveParticipant
          ? `wins "Most Likely To Text You Back" — ${stats.mostActiveCount} messages and counting 🔥`
          : 'Say hi to someone and this trophy is theirs 🏅',
        avatar: stats.mostActiveParticipant?.avatar,
      },
      {
        gradient: 'linear-gradient(160deg, #5fa88a, #5fb8c4)',
        emoji: '🎭',
        title: stats.favoriteEmoji || '🤷',
        subtitle: stats.favoriteEmoji
          ? `is basically your whole personality now. Used ${stats.favoriteEmojiCount} time${
              stats.favoriteEmojiCount === 1 ? '' : 's'
            } and no signs of stopping 😌`
          : "You haven't reacted yet — the 👍 button is right there, just saying.",
        big: true,
      },
      {
        gradient: 'linear-gradient(160deg, #7c8fd6, #9a7fc2)',
        emoji: '🎬',
        title: "That's a wrap!",
        subtitle:
          stats.deletedCount > 0
            ? `Plot twist: ${stats.deletedCount} message${
                stats.deletedCount === 1 ? '' : 's'
              } got deleted along the way 👀 no judgement, we've all been there.`
            : 'Not a single deleted message — bold, confident, decisive. 💪',
      },
      {
        gradient: 'linear-gradient(160deg, #6b7fd6, #b06bc2)',
        emoji: '📋',
        title: 'Your Recap',
        subtitle: 'Everything in one place ✨',
        summary: true,
        outro: true,
      },
    ];
  }, [stats, currentUser]);

  const summaryRows = [
    { emoji: '💌', label: 'Messages sent', value: stats.totalSent },
    {
      emoji: '🏆',
      label: 'Most active chat',
      value: stats.mostActiveParticipant ? stats.mostActiveParticipant.name : '—',
    },
    { emoji: '🎭', label: 'Favorite reaction', value: stats.favoriteEmoji || '—' },
    { emoji: '🗑️', label: 'Messages deleted', value: stats.deletedCount },
    { emoji: '💬', label: 'Conversations', value: stats.conversationCount },
  ];

  const goNext = () => {
    if (index >= cards.length - 1) {
      navigate('/chat');
    } else {
      setIndex((i) => i + 1);
    }
  };

  const goPrev = () => {
    setIndex((i) => Math.max(0, i - 1));
  };

  useEffect(() => {
    const isSummary = cards[index]?.summary;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(goNext, isSummary ? SUMMARY_DURATION : CARD_DURATION);
    return () => clearTimeout(timerRef.current);
  }, [index]);

  useEffect(() => {
    if (cards[index]?.outro) {
      triggerEffect('confetti');
    }
  }, [index]);

  const card = cards[index];
  const duration = card?.summary ? SUMMARY_DURATION : CARD_DURATION;

  return (
    <div className="wrapped-page" style={{ background: card.gradient }}>
      <div className="wrapped-progress-row">
        {cards.map((_, i) => (
          <div key={i} className="wrapped-progress-track">
            <div
              className={`wrapped-progress-fill ${
                i < index ? 'filled' : i === index ? 'animating' : ''
              }`}
              style={i === index ? { animationDuration: `${duration}ms` } : undefined}
            />
          </div>
        ))}
      </div>

      <button className="wrapped-close" onClick={() => navigate('/chat')} aria-label="Close">
        <X size={22} />
      </button>

      <div className="wrapped-tap-zone wrapped-tap-left" onClick={goPrev} />
      <div className="wrapped-tap-zone wrapped-tap-right" onClick={goNext} />

      <div className="wrapped-content pop-in" key={index}>
        <span className="wrapped-emoji-badge">{card.emoji}</span>

        {card.avatar && <img src={card.avatar} alt="" className="avatar wrapped-avatar" />}

        <h1 className={`wrapped-title ${card.big ? 'wrapped-title-big' : ''} ${card.summary ? 'wrapped-title-summary' : ''}`}>
          {card.title}
        </h1>
        <p className="wrapped-subtitle">{card.subtitle}</p>

        {card.summary && (
          <div className="wrapped-summary-list">
            {summaryRows.map((row) => (
              <div key={row.label} className="wrapped-summary-row">
                <span className="wrapped-summary-emoji">{row.emoji}</span>
                <span className="wrapped-summary-label">{row.label}</span>
                <span className="wrapped-summary-value">{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {card.outro && (
          <button className="btn wrapped-outro-btn" onClick={() => navigate('/chat')}>
            Back to chatting 💬
          </button>
        )}
      </div>

      <EffectOverlay effect={activeEffect} onComplete={clearEffect} />
    </div>
  );
}