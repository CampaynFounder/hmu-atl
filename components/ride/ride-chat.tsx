'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  type?: string;
  quickKey?: string | null;
}

interface QuickMsg {
  key: string;
  label: string;
  emoji: string;
}

const RIDER_QUICK: QuickMsg[] = [
  { key: 'rider_eta', label: 'ETA?', emoji: '⏱' },
  { key: 'rider_wya', label: 'WYA?', emoji: '👀' },
  { key: 'rider_here', label: "I'm here", emoji: '📍' },
  { key: 'rider_late', label: 'Running late', emoji: '🏃' },
  { key: 'rider_spot', label: 'Share my spot', emoji: '📍' },
];

const DRIVER_QUICK: QuickMsg[] = [
  { key: 'driver_otw', label: 'OTW', emoji: '🚗' },
  { key: 'driver_5min', label: '5 min away', emoji: '⏱' },
  { key: 'driver_pulling_up', label: 'Pulling up', emoji: '🅿️' },
  { key: 'driver_here', label: "I'm here", emoji: '📍' },
  { key: 'driver_cantfind', label: "Can't find you", emoji: '❓' },
];

interface RideChatProps {
  rideId: string;
  userId: string;
  isDriver: boolean;
  messages: ChatMessage[];
  open: boolean;
  onClose: () => void;
  onSend: (content: string) => void;
  rideStatus: string;
}

const COLORS = {
  green: '#00E676',
  black: '#080808',
  card: '#141414',
  card2: '#1a1a1a',
  white: '#FFFFFF',
  gray: '#888888',
  grayLight: '#AAAAAA',
  orange: '#FF9100',
  border: 'rgba(255,255,255,0.08)',
};

export default function RideChat({
  rideId,
  userId,
  isDriver,
  messages,
  open,
  onClose,
  onSend,
  rideStatus,
}: RideChatProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sentQuickKeys, setSentQuickKeys] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track which quick messages already have SMS sent (from loaded messages)
  useEffect(() => {
    const keys = new Set<string>();
    for (const m of messages) {
      if (m.quickKey) keys.add(m.quickKey);
    }
    setSentQuickKeys(keys);
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current && open) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, open]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  async function handleSend(content?: string, quickKey?: string, extraData?: string) {
    const text = content || input.trim();
    if (!text || sending) return;

    setSending(true);
    if (!quickKey) setInput('');

    try {
      const res = await fetch(`/api/rides/${rideId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, quickKey, extraData }),
      });
      if (res.ok) {
        onSend(text);
        if (quickKey) setSentQuickKeys(prev => new Set([...prev, quickKey]));
      }
    } catch { /* silent */ }
    setSending(false);
  }

  async function handleQuickMessage(qm: QuickMsg) {
    if (sending) return;

    // Special handling for "Share my spot" — grab GPS
    if (qm.key === 'rider_spot') {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude.toFixed(6);
            const lng = pos.coords.longitude.toFixed(6);
            const mapLink = `https://maps.google.com/?q=${lat},${lng}`;
            handleSend(`📍 I'm right here: ${mapLink}`, qm.key, mapLink);
          },
          () => {
            handleSend("📍 I'm at the pickup spot", qm.key);
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
        return;
      }
      handleSend("📍 I'm at the pickup spot", qm.key);
      return;
    }

    handleSend(`${qm.emoji} ${qm.label}`, qm.key);
  }

  if (!open) return null;

  const quickMessages = isDriver ? DRIVER_QUICK : RIDER_QUICK;
  // Filter to relevant statuses
  const pickupStatuses = ['otw', 'here', 'confirming'];
  const showQuickMessages = pickupStatuses.includes(rideStatus);

  return (
    <>
      <style>{`
        @keyframes chatSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '60%',
        backgroundColor: COLORS.black,
        borderTop: `1px solid ${COLORS.border}`,
        borderRadius: '20px 20px 0 0',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
        animation: 'chatSlideUp 0.25s ease-out',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${COLORS.border}`,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.white }}>
            Chat
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: COLORS.grayLight,
              fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Quick message chips */}
        {showQuickMessages && (
          <div style={{
            display: 'flex', gap: 6, padding: '10px 16px 6px',
            overflowX: 'auto', flexShrink: 0,
            WebkitOverflowScrolling: 'touch',
          }}>
            {quickMessages.map(qm => {
              const alreadySent = sentQuickKeys.has(qm.key);
              return (
                <button
                  key={qm.key}
                  onClick={() => handleQuickMessage(qm)}
                  disabled={sending}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '7px 14px', borderRadius: 100, flexShrink: 0,
                    border: alreadySent ? '1px solid rgba(255,255,255,0.06)' : `1px solid rgba(0,230,118,0.3)`,
                    background: alreadySent ? 'rgba(255,255,255,0.04)' : 'rgba(0,230,118,0.08)',
                    color: alreadySent ? COLORS.gray : COLORS.green,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{qm.emoji}</span>
                  {qm.label}
                  {alreadySent && (
                    <span style={{ fontSize: 10, color: COLORS.gray, marginLeft: 2 }}>sent</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: 'auto', padding: '12px 16px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          {messages.length === 0 && (
            <div style={{
              textAlign: 'center', color: COLORS.gray, fontSize: 13, padding: '20px 0',
            }}>
              {showQuickMessages
                ? 'Tap a quick message above or type below'
                : 'No messages yet'}
            </div>
          )}
          {messages.map((msg) => {
            const isMine = msg.senderId === userId;
            const isQuick = msg.type === 'quick';
            return (
              <div
                key={msg.id}
                style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}
              >
                <div style={{
                  maxWidth: '75%',
                  padding: '10px 14px',
                  borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  backgroundColor: isMine ? COLORS.green : COLORS.card2,
                  color: isMine ? COLORS.black : COLORS.white,
                  fontSize: 14,
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                  border: isQuick && !isMine ? `1px solid rgba(0,230,118,0.2)` : 'none',
                }}>
                  {msg.content}
                  <div style={{
                    fontSize: 10,
                    color: isMine ? 'rgba(0,0,0,0.5)' : COLORS.gray,
                    marginTop: 4,
                    textAlign: 'right',
                    display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4,
                  }}>
                    {formatTime(msg.createdAt)}
                    {isQuick && <span style={{ fontSize: 9, opacity: 0.7 }}>via SMS</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input bar */}
        <div style={{
          display: 'flex', gap: 8, padding: '10px 16px',
          paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
          borderTop: `1px solid ${COLORS.border}`,
          flexShrink: 0,
          backgroundColor: COLORS.black,
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            maxLength={500}
            style={{
              flex: 1, background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 100, padding: '12px 16px',
              color: COLORS.white, fontSize: 14, outline: 'none',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || sending}
            style={{
              width: 44, height: 44, borderRadius: '50%', border: 'none',
              backgroundColor: input.trim() ? COLORS.green : COLORS.card,
              color: input.trim() ? COLORS.black : COLORS.gray,
              fontSize: 18, fontWeight: 700,
              cursor: input.trim() ? 'pointer' : 'default',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            {'\u2191'}
          </button>
        </div>
      </div>
    </>
  );
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
