'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';

interface DriverData {
  handle: string;
  displayName: string;
  areas: string[];
  pricing: Record<string, unknown>;
  acceptsCash?: boolean;
  cashOnly?: boolean;
}

interface Props {
  driver: DriverData;
  open: boolean;
  onClose: () => void;
}

interface ChatMsg {
  id: string;
  from: 'rider' | 'assistant' | 'system';
  text: string;
  action?: string;
  booking?: Record<string, unknown>;
  sentiment?: string;
}

const COLORS = { green: '#00E676', black: '#080808', card: '#141414', white: '#fff', gray: '#888', red: '#FF5252', orange: '#FF9100' };

export default function GptChatBooking({ driver, open, onClose }: Props) {
  const { isSignedIn, isLoaded } = useUser();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [bookingData, setBookingData] = useState<Record<string, unknown> | null>(null);
  const [flowStep, setFlowStep] = useState<'chat' | 'signup' | 'booking' | 'done'>('chat');
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<{ postId?: string; expiresAt?: string; error?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);

  // Initial greeting
  useEffect(() => {
    if (!open || initRef.current) return;
    initRef.current = true;
    const minPrice = driver.pricing.minimum ? `$${driver.pricing.minimum} minimum` : '';
    const cashNote = driver.cashOnly ? ' Cash rides only.' : driver.acceptsCash ? '' : '';
    setMessages([{
      id: '0',
      from: 'assistant',
      text: `What's good! I'm helping book rides for ${driver.displayName}. Where you headed?${minPrice ? ` (${minPrice})` : ''}${cashNote}`,
    }]);
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMsg = { id: `u-${Date.now()}`, from: 'rider', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      // Build conversation history for GPT (exclude system messages)
      const history = [...messages.filter(m => m.from !== 'system'), userMsg].map(m => ({
        role: m.from === 'rider' ? 'user' as const : 'assistant' as const,
        content: m.text,
      }));

      const res = await fetch('/api/chat/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, driverHandle: driver.handle }),
      });
      const data = await res.json();

      if (data.reply) {
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`,
          from: 'assistant',
          text: data.reply,
          action: data.action,
          booking: data.booking,
          sentiment: data.sentiment,
        }]);
      }

      // GPT said rider is ready to book
      if (data.action === 'ready_to_book' && data.booking) {
        setBookingData(data.booking);
        if (!isSignedIn) {
          setFlowStep('signup');
        } else {
          setFlowStep('booking');
          submitBooking(data.booking);
        }
      }
    } catch {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`, from: 'system', text: 'Network error — try again',
      }]);
    }
    setSending(false);
  };

  // Submit the actual booking
  const submitBooking = async (booking: Record<string, unknown>) => {
    setSubmittingBooking(true);
    try {
      const res = await fetch(`/api/drivers/${driver.handle}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: Number(booking.price || 15),
          areas: driver.areas.length > 0 ? driver.areas : ['ATL'],
          timeWindow: {
            destination: booking.destination || '',
            time: booking.time || 'ASAP',
            stops: booking.stops || '',
            round_trip: booking.roundTrip || false,
          },
          is_cash: booking.isCash || driver.cashOnly || false,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBookingResult({ postId: data.postId, expiresAt: data.expiresAt });
        setFlowStep('done');
        setMessages(prev => [...prev, {
          id: `s-${Date.now()}`, from: 'system',
          text: `Booking sent to ${driver.displayName}! They have 15 minutes to respond. Finish setting up your profile so they can see you.`,
        }]);
      } else {
        setBookingResult({ error: data.error });
        setMessages(prev => [...prev, {
          id: `e-${Date.now()}`, from: 'system', text: data.error || 'Booking failed — try again',
        }]);
        setFlowStep('chat');
      }
    } catch {
      setBookingResult({ error: 'Network error' });
      setFlowStep('chat');
    }
    setSubmittingBooking(false);
  };

  // After sign-up completes, retry booking
  useEffect(() => {
    if (flowStep === 'signup' && isLoaded && isSignedIn && bookingData) {
      setFlowStep('booking');
      submitBooking(bookingData);
    }
  }, [flowStep, isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const signUpUrl = `/sign-up?type=rider&returnTo=/d/${driver.handle}?book=1`;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100 }} />

      {/* Chat sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: COLORS.card, borderRadius: '24px 24px 0 0',
        maxHeight: '85svh', display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.25s ease-out',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* Header */}
        <div style={{
          padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.white }}>
              Book {driver.displayName}
            </div>
            <div style={{ fontSize: 11, color: COLORS.gray }}>
              {driver.cashOnly ? 'Cash rides' : driver.acceptsCash ? 'Cash or digital' : 'Digital payments'} · {driver.areas[0] || 'ATL'}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: COLORS.gray, fontSize: 16, cursor: 'pointer',
          }}>&times;</button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
          {messages.map(msg => (
            <div key={msg.id} style={{
              display: 'flex', justifyContent: msg.from === 'rider' ? 'flex-end' : 'flex-start',
              marginBottom: 10,
            }}>
              <div style={{
                maxWidth: '80%', padding: '10px 14px', borderRadius: 16,
                fontSize: 14, lineHeight: 1.5,
                background: msg.from === 'rider' ? COLORS.green
                  : msg.from === 'system' ? 'rgba(255,145,0,0.12)'
                  : '#1f1f1f',
                color: msg.from === 'rider' ? COLORS.black
                  : msg.from === 'system' ? COLORS.orange
                  : COLORS.white,
                borderBottomRightRadius: msg.from === 'rider' ? 4 : 16,
                borderBottomLeftRadius: msg.from === 'rider' ? 16 : 4,
              }}>
                {msg.text}
              </div>
            </div>
          ))}

          {sending && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
              <div style={{
                padding: '10px 18px', borderRadius: 16, background: '#1f1f1f',
                fontSize: 14, color: COLORS.gray, borderBottomLeftRadius: 4,
              }}>
                <span style={{ animation: 'pulse 1s ease-in-out infinite' }}>...</span>
              </div>
            </div>
          )}

          {/* Sign up prompt */}
          {flowStep === 'signup' && (
            <div style={{
              background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)',
              borderRadius: 16, padding: '16px', textAlign: 'center', marginBottom: 10,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.green, marginBottom: 8 }}>
                Quick sign up to confirm your booking
              </div>
              <a
                href={signUpUrl}
                style={{
                  display: 'block', padding: '14px', borderRadius: 100, background: COLORS.green,
                  color: COLORS.black, fontSize: 15, fontWeight: 700, textDecoration: 'none', textAlign: 'center',
                }}
              >
                Create Account
              </a>
              <div style={{ fontSize: 11, color: COLORS.gray, marginTop: 8 }}>
                Takes 30 seconds — then your booking goes through
              </div>
            </div>
          )}

          {/* Booking in progress */}
          {flowStep === 'booking' && submittingBooking && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: COLORS.green, fontSize: 14 }}>
              Sending your booking to {driver.displayName}...
            </div>
          )}

          {/* Done — booking sent */}
          {flowStep === 'done' && bookingResult?.postId && (
            <div style={{
              background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)',
              borderRadius: 16, padding: '16px', textAlign: 'center', marginBottom: 10,
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.green, marginBottom: 4 }}>
                Booking Sent!
              </div>
              <div style={{ fontSize: 13, color: COLORS.gray, marginBottom: 12 }}>
                {driver.displayName} has 15 min to respond. We'll text you when they do.
              </div>
              <a
                href="/rider/profile"
                style={{
                  display: 'block', padding: '12px', borderRadius: 100,
                  border: '1px solid rgba(0,230,118,0.3)', background: 'transparent',
                  color: COLORS.green, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}
              >
                Complete Your Profile
              </a>
            </div>
          )}
        </div>

        {/* Quick actions */}
        {flowStep === 'chat' && messages.length <= 2 && (
          <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['Need a ride now', 'Schedule for later', 'How much to the airport?'].map(q => (
              <button
                key={q}
                onClick={() => { setInput(q); setTimeout(() => sendMessage(), 50); }}
                style={{
                  padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: COLORS.gray, cursor: 'pointer',
                  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        {flowStep === 'chat' && (
          <div style={{
            padding: '12px 16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', gap: 8, flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
              placeholder="Where you headed?"
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 100,
                background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)',
                color: COLORS.white, fontSize: 15, outline: 'none',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none',
                background: input.trim() ? COLORS.green : 'rgba(255,255,255,0.06)',
                color: input.trim() ? COLORS.black : COLORS.gray,
                fontSize: 18, cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s',
              }}
            >
              ↑
            </button>
          </div>
        )}
      </div>
    </>
  );
}
