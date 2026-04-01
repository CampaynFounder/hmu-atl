'use client';

import { useRef, useState, useEffect } from 'react';
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
}

const COLORS = { green: '#00E676', black: '#080808', card: '#141414', white: '#fff', gray: '#888', orange: '#FF9100' };

/**
 * GPT-powered discovery chat for HMU link visitors.
 * Handles: distance, pricing, availability, driver Q&A.
 * When ready to book: redirects to sign-up → returns to driver page → logged-in booking form.
 * Already signed in: closes chat and opens the booking form directly.
 */
export default function GptChatBooking({ driver, open, onClose }: Props) {
  const { isSignedIn, user } = useUser();
  const isDriver = (user?.publicMetadata?.profileType as string) === 'driver';
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [extractedSoFar, setExtractedSoFar] = useState<Record<string, unknown>>({});
  const [currentStep, setCurrentStep] = useState('trip_details');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);

  // ── Initial greeting ──
  useEffect(() => {
    if (!open || initRef.current) return;
    initRef.current = true;
    const minPrice = driver.pricing.minimum ? `$${driver.pricing.minimum} minimum` : '';
    const cashNote = driver.cashOnly ? ' Cash rides only.' : '';
    setMessages([{
      id: '0', from: 'assistant',
      text: `What's good! Ask me anything about riding with ${driver.displayName} — pricing, distance, availability.${minPrice ? ` (${minPrice})` : ''}${cashNote} When you're ready, I'll get you booked.`,
    }]);
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ──
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMsg = { id: `u-${Date.now()}`, from: 'rider', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const history = [...messages.filter(m => m.from !== 'system'), userMsg].map(m => ({
        role: m.from === 'rider' ? 'user' as const : 'assistant' as const,
        content: m.text,
      }));

      const res = await fetch('/api/chat/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, driverHandle: driver.handle, extractedSoFar, currentStep }),
      });

      if (!res.ok) {
        const errText = await res.text();
        const isJson = errText.startsWith('{');
        setMessages(prev => [...prev, {
          id: `e-${Date.now()}`, from: 'system',
          text: isJson ? (JSON.parse(errText).error || 'Request failed') : `Server error (${res.status})`,
        }]);
        setSending(false);
        return;
      }

      const data = await res.json();
      if (data.extracted) setExtractedSoFar(prev => ({ ...prev, ...data.extracted }));
      if (data.nextStep) setCurrentStep(data.nextStep);

      // GPT confirmed ride details — save for booking form pre-fill
      if (data.action === 'details_confirmed' && data.booking) {
        const bookingDetails = { ...extractedSoFar, ...(data.booking || {}) };
        localStorage.setItem('hmu_chat_booking', JSON.stringify(bookingDetails));
        setExtractedSoFar(bookingDetails);
      }

      if (data.reply) {
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`, from: 'assistant', text: data.reply,
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`, from: 'system',
        text: `Something went wrong — try again (${err instanceof Error ? err.message : 'unknown'})`,
      }]);
    }
    setSending(false);
  };

  if (!open) return null;

  const signUpUrl = `/sign-up?type=rider&returnTo=${encodeURIComponent(`/d/${driver.handle}?bookingOpen=1`)}`;
  const signInUrl = `/sign-in?type=rider&returnTo=${encodeURIComponent(`/d/${driver.handle}?bookingOpen=1`)}`;

  const hasDetails = Object.keys(extractedSoFar).length > 0 && !!(extractedSoFar.destination || extractedSoFar.suggestedPrice);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100 }} />

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: COLORS.card, borderRadius: '24px 24px 0 0',
        maxHeight: '85svh', display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.25s ease-out',
      }}>
        <style>{`
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        `}</style>

        {/* Header */}
        <div style={{
          padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.white }}>
              {isSignedIn ? `Book ${driver.displayName}` : `Ask about ${driver.displayName}`}
            </div>
            <div style={{ fontSize: 11, color: COLORS.gray }}>
              {driver.cashOnly ? 'Cash rides' : driver.acceptsCash ? 'Cash or digital' : 'Digital'} · {driver.areas[0] || 'ATL'}
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
                fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line',
                background: msg.from === 'rider' ? COLORS.green : msg.from === 'system' ? 'rgba(255,145,0,0.12)' : '#1f1f1f',
                color: msg.from === 'rider' ? COLORS.black : msg.from === 'system' ? COLORS.orange : COLORS.white,
                borderBottomRightRadius: msg.from === 'rider' ? 4 : 16,
                borderBottomLeftRadius: msg.from === 'rider' ? 16 : 4,
              }}>
                {msg.text}
              </div>
            </div>
          ))}

          {sending && (
            <div style={{ display: 'flex', marginBottom: 10 }}>
              <div style={{ padding: '10px 18px', borderRadius: 16, background: '#1f1f1f', color: COLORS.gray, borderBottomLeftRadius: 4 }}>
                <span style={{ animation: 'pulse 1s ease-in-out infinite' }}>...</span>
              </div>
            </div>
          )}
        </div>

        {/* Quick actions */}
        {messages.length <= 2 && (
          <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['Need a ride now', 'How much to the airport?', 'What areas do you cover?'].map(q => (
              <button key={q} onClick={() => { setInput(q); setTimeout(sendMessage, 50); }}
                style={{
                  padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: COLORS.gray, cursor: 'pointer',
                }}>{q}</button>
            ))}
          </div>
        )}

        {/* Signed in as driver → can't book */}
        {isSignedIn && isDriver && hasDetails && (
          <div style={{ padding: '0 16px 8px' }}>
            <div style={{
              padding: '12px 16px', borderRadius: 14, textAlign: 'center',
              background: 'rgba(255,145,0,0.1)', border: '1px solid rgba(255,145,0,0.2)',
              fontSize: 13, color: '#FFB300', lineHeight: 1.5,
            }}>
              You&apos;re signed in as a driver. To book a ride, create a separate rider account with a different email or phone.
            </div>
          </div>
        )}

        {/* Not signed in + has details → sign up to book */}
        {!isSignedIn && hasDetails && (
          <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8 }}>
            <a href={signUpUrl} style={{
              flex: 1, padding: 12, borderRadius: 100, border: 'none',
              background: COLORS.green, color: COLORS.black, fontSize: 14, fontWeight: 700,
              textDecoration: 'none', textAlign: 'center',
            }}>
              Sign Up to Book
            </a>
            <a href={signInUrl} style={{
              flex: 1, padding: 12, borderRadius: 100,
              border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
              color: COLORS.white, fontSize: 14, fontWeight: 600,
              textDecoration: 'none', textAlign: 'center',
            }}>
              Sign In
            </a>
          </div>
        )}

        {/* Signed in as rider + has details → book now */}
        {isSignedIn && !isDriver && hasDetails && (
          <div style={{ padding: '0 16px 8px' }}>
            <button onClick={() => {
              onClose();
              window.dispatchEvent(new CustomEvent('hmu-open-booking', { detail: extractedSoFar }));
            }} style={{
              width: '100%', padding: 14, borderRadius: 100, border: 'none',
              background: COLORS.green, color: COLORS.black, fontSize: 15, fontWeight: 700,
              cursor: 'pointer',
            }}>
              {`Book Now — $${Number(extractedSoFar.suggestedPrice || extractedSoFar.price || 0).toFixed(0)}`}
            </button>
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '12px 16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', gap: 8, flexShrink: 0,
        }}>
          <input ref={inputRef} type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
            placeholder={isSignedIn ? 'Where you headed?' : 'Ask about pricing, distance, areas...'}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 100,
              background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)',
              color: COLORS.white, fontSize: 15, outline: 'none',
            }}
          />
          <button onClick={sendMessage} disabled={!input.trim() || sending}
            style={{
              width: 44, height: 44, borderRadius: '50%', border: 'none',
              background: input.trim() ? COLORS.green : 'rgba(255,255,255,0.06)',
              color: input.trim() ? COLORS.black : COLORS.gray,
              fontSize: 18, cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>↑</button>
        </div>
      </div>
    </>
  );
}
