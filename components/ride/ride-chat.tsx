'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

interface RideChatProps {
  rideId: string;
  userId: string;
  isDriver: boolean;
  messages: ChatMessage[];
  open: boolean;
  onClose: () => void;
  onSend: (content: string) => void;
}

const COLORS = {
  green: '#00E676',
  black: '#080808',
  card: '#141414',
  card2: '#1a1a1a',
  white: '#FFFFFF',
  gray: '#888888',
  grayLight: '#AAAAAA',
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
}: RideChatProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
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

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput('');
    try {
      const res = await fetch(`/api/rides/${rideId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        onSend(text);
      }
    } catch { /* silent */ }
    setSending(false);
  }

  if (!open) return null;

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
        height: '55%',
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
          <div style={{
            fontSize: 15,
            fontWeight: 700,
            color: COLORS.white,
          }}>
            Chat
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: COLORS.grayLight,
              fontSize: 22,
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {messages.length === 0 && (
            <div style={{
              textAlign: 'center',
              color: COLORS.gray,
              fontSize: 13,
              padding: '20px 0',
            }}>
              No messages yet. Say something!
            </div>
          )}
          {messages.map((msg) => {
            const isMine = msg.senderId === userId;
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: isMine ? 'flex-end' : 'flex-start',
                }}
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
                }}>
                  {msg.content}
                  <div style={{
                    fontSize: 10,
                    color: isMine ? 'rgba(0,0,0,0.5)' : COLORS.gray,
                    marginTop: 4,
                    textAlign: 'right',
                  }}>
                    {formatTime(msg.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input bar */}
        <div style={{
          display: 'flex',
          gap: 8,
          padding: '10px 16px',
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
              flex: 1,
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 100,
              padding: '12px 16px',
              color: COLORS.white,
              fontSize: 14,
              outline: 'none',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              backgroundColor: input.trim() ? COLORS.green : COLORS.card,
              color: input.trim() ? COLORS.black : COLORS.gray,
              fontSize: 18,
              fontWeight: 700,
              cursor: input.trim() ? 'pointer' : 'default',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
