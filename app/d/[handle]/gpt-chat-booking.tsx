'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useUser, SignIn, SignUp } from '@clerk/nextjs';
import dynamic from 'next/dynamic';

const InlinePaymentForm = dynamic(() => import('@/components/payments/inline-payment-form'), { ssr: false });

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
}

type FlowStep = 'auth' | 'chat' | 'payment' | 'booking' | 'done';

const COLORS = { green: '#00E676', black: '#080808', card: '#141414', white: '#fff', gray: '#888', red: '#FF5252', orange: '#FF9100' };

export default function GptChatBooking({ driver, open, onClose }: Props) {
  const { isSignedIn, isLoaded } = useUser();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [bookingData, setBookingData] = useState<Record<string, unknown> | null>(null);
  const [extractedSoFar, setExtractedSoFar] = useState<Record<string, unknown>>({});
  const [flowStep, setFlowStep] = useState<FlowStep>('auth');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<{ postId?: string; error?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);

  const isCashRide = !!(bookingData?.isCash || driver.cashOnly);

  // ── Determine initial flow step based on auth ──
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      setFlowStep('chat');
    } else {
      setFlowStep('auth');
    }
  }, [isLoaded, isSignedIn]);

  // ── When auth completes, move to chat ──
  useEffect(() => {
    if (flowStep === 'auth' && isLoaded && isSignedIn) {
      setFlowStep('chat');
    }
  }, [flowStep, isLoaded, isSignedIn]);

  // ── Initial greeting when entering chat ──
  useEffect(() => {
    if (flowStep !== 'chat' || initRef.current) return;
    initRef.current = true;
    const minPrice = driver.pricing.minimum ? `$${driver.pricing.minimum} minimum` : '';
    const cashNote = driver.cashOnly ? ' Cash rides only.' : '';
    setMessages([{
      id: '0', from: 'assistant',
      text: `What's good! I'm helping book rides for ${driver.displayName}. Where you headed?${minPrice ? ` (${minPrice})` : ''}${cashNote}`,
    }]);
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [flowStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ──
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // ── Check payment method, then book ──
  const checkPaymentAndBook = useCallback(async (booking: Record<string, unknown>) => {
    try {
      const pmRes = await fetch('/api/rider/payment-methods');
      const pmData = await pmRes.json();
      const hasPm = pmData.methods && pmData.methods.length > 0;
      if (hasPm) {
        submitBooking(booking);
      } else {
        setFlowStep('payment');
        setMessages(prev => [...prev, {
          id: `s-${Date.now()}`, from: 'system',
          text: 'Link a payment method to confirm your ride. Your card won\'t be charged until the driver accepts.',
        }]);
      }
    } catch {
      submitBooking(booking);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send chat message ──
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
        body: JSON.stringify({ messages: history, driverHandle: driver.handle, extractedSoFar }),
      });

      if (!res.ok) {
        const text = await res.text();
        const isJson = text.startsWith('{');
        const errMsg = isJson ? (JSON.parse(text).error || 'Request failed') : `Server error (${res.status})`;
        setMessages(prev => [...prev, { id: `e-${Date.now()}`, from: 'system', text: errMsg }]);
        setSending(false);
        return;
      }

      const data = await res.json();

      if (data.reply) {
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`, from: 'assistant', text: data.reply,
          action: data.action, booking: data.booking,
        }]);
      }

      if (data.extracted) {
        setExtractedSoFar(prev => ({ ...prev, ...data.extracted }));
      }

      // GPT said rider is ready to book — they're already authenticated
      if (data.action === 'ready_to_book' && data.booking) {
        setBookingData(data.booking);
        if (data.booking.isCash || driver.cashOnly) {
          submitBooking(data.booking);
        } else {
          checkPaymentAndBook(data.booking);
        }
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown';
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`, from: 'system', text: `Something went wrong — try again (${detail})`,
      }]);
    }
    setSending(false);
  };

  // ── Submit booking ──
  const submitBooking = async (booking: Record<string, unknown>) => {
    setFlowStep('booking');
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
        setBookingResult({ postId: data.postId });
        setFlowStep('done');
        setMessages(prev => [...prev, {
          id: `s-${Date.now()}`, from: 'system',
          text: `Booking sent to ${driver.displayName}! They have 15 minutes to respond.`,
        }]);
      } else {
        setBookingResult({ error: data.error });
        setMessages(prev => [...prev, {
          id: `e-${Date.now()}`, from: 'system', text: data.error || 'Booking failed — try again',
        }]);
        setFlowStep('chat');
      }
    } catch {
      setFlowStep('chat');
    }
    setSubmittingBooking(false);
  };

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100 }} />

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: COLORS.card, borderRadius: '24px 24px 0 0',
        maxHeight: '90svh', display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.25s ease-out',
      }}>
        <style>{`
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
          .cl-card { border: none !important; box-shadow: none !important; background: transparent !important; }
          .cl-rootBox { width: 100% !important; }
          .cl-formButtonPrimary { background: #00E676 !important; color: #080808 !important; }
        `}</style>

        {/* Header */}
        <div style={{
          padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.white }}>Book {driver.displayName}</div>
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

        {/* ── AUTH STEP: Sign in/up before chatting ── */}
        {flowStep === 'auth' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white, marginBottom: 4 }}>
                Sign in to book with {driver.displayName}
              </div>
              <div style={{ fontSize: 12, color: COLORS.gray }}>
                Takes 30 seconds — then we'll get your ride set up
              </div>
            </div>

            <div style={{ maxWidth: 400, margin: '0 auto' }}>
              {authMode === 'signup' ? (
                <SignUp
                  routing="hash"
                  signInUrl="#signin"
                  forceRedirectUrl={`/auth-callback?type=rider&returnTo=${encodeURIComponent(`/d/${driver.handle}?book=1`)}`}
                  appearance={{
                    baseTheme: undefined,
                    variables: {
                      colorBackground: '#1a1a1a',
                      colorText: '#ffffff',
                      colorTextSecondary: '#888888',
                      colorPrimary: '#00E676',
                      colorInputBackground: '#141414',
                      colorInputText: '#ffffff',
                      borderRadius: '12px',
                    },
                    elements: {
                      rootBox: { width: '100%' },
                      card: { background: 'transparent', border: 'none', boxShadow: 'none' },
                      formButtonPrimary: { background: '#00E676', color: '#080808', fontWeight: 700 },
                      formFieldInput: { background: '#1a1a1a', border: '1px solid #333', color: '#fff' },
                      footerActionLink: { color: '#00E676' },
                      headerTitle: { color: '#fff' },
                      headerSubtitle: { color: '#888' },
                      socialButtonsBlockButton: { background: '#1a1a1a', border: '1px solid #333', color: '#fff' },
                      dividerLine: { background: '#333' },
                      dividerText: { color: '#666' },
                      formFieldLabel: { color: '#aaa' },
                      identityPreviewEditButton: { color: '#00E676' },
                      otpCodeFieldInput: { background: '#1a1a1a', border: '1px solid #333', color: '#fff' },
                    },
                  }}
                />
              ) : (
                <SignIn
                  routing="hash"
                  signUpUrl="#signup"
                  forceRedirectUrl={`/d/${driver.handle}?book=1`}
                  appearance={{
                    variables: {
                      colorBackground: '#1a1a1a',
                      colorText: '#ffffff',
                      colorTextSecondary: '#888888',
                      colorPrimary: '#00E676',
                      colorInputBackground: '#141414',
                      colorInputText: '#ffffff',
                      borderRadius: '12px',
                    },
                    elements: {
                      rootBox: { width: '100%' },
                      card: { background: 'transparent', border: 'none', boxShadow: 'none' },
                      formButtonPrimary: { background: '#00E676', color: '#080808', fontWeight: 700 },
                      formFieldInput: { background: '#1a1a1a', border: '1px solid #333', color: '#fff' },
                      footerActionLink: { color: '#00E676' },
                      headerTitle: { color: '#fff' },
                      headerSubtitle: { color: '#888' },
                      socialButtonsBlockButton: { background: '#1a1a1a', border: '1px solid #333', color: '#fff' },
                      dividerLine: { background: '#333' },
                      dividerText: { color: '#666' },
                      formFieldLabel: { color: '#aaa' },
                      identityPreviewEditButton: { color: '#00E676' },
                      otpCodeFieldInput: { background: '#1a1a1a', border: '1px solid #333', color: '#fff' },
                    },
                  }}
                />
              )}
            </div>

          </div>
        )}

        {/* ── CHAT + BOOKING STEPS ── */}
        {flowStep !== 'auth' && (
          <>
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
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
                  <div style={{ padding: '10px 18px', borderRadius: 16, background: '#1f1f1f', fontSize: 14, color: COLORS.gray, borderBottomLeftRadius: 4 }}>
                    <span style={{ animation: 'pulse 1s ease-in-out infinite' }}>...</span>
                  </div>
                </div>
              )}

              {/* Payment method prompt */}
              {flowStep === 'payment' && (
                <div style={{
                  background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)',
                  borderRadius: 16, padding: '16px', marginBottom: 10,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.green, marginBottom: 4, textAlign: 'center' }}>
                    Link a payment method
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.gray, marginBottom: 12, textAlign: 'center' }}>
                    Your card won&apos;t be charged until {driver.displayName} accepts
                  </div>
                  <InlinePaymentForm
                    onSuccess={() => {
                      setMessages(prev => [...prev, {
                        id: `s-${Date.now()}`, from: 'system', text: 'Payment linked! Sending your booking now...',
                      }]);
                      if (bookingData) submitBooking(bookingData);
                    }}
                    onCancel={() => {
                      setFlowStep('chat');
                      setMessages(prev => [...prev, {
                        id: `s-${Date.now()}`, from: 'system', text: 'No worries — you can switch to a cash ride instead.',
                      }]);
                    }}
                    compact
                  />
                </div>
              )}

              {/* Booking in progress */}
              {flowStep === 'booking' && submittingBooking && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: COLORS.green, fontSize: 14 }}>
                  Sending your booking to {driver.displayName}...
                </div>
              )}

              {/* Done */}
              {flowStep === 'done' && bookingResult?.postId && (
                <div style={{
                  background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)',
                  borderRadius: 16, padding: '16px', textAlign: 'center', marginBottom: 10,
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.green, marginBottom: 4 }}>Booking Sent!</div>
                  <div style={{ fontSize: 13, color: COLORS.gray, marginBottom: 12 }}>
                    {driver.displayName} has 15 min to respond. We&apos;ll text you when they do.
                  </div>
                  <a href="/rider/profile" style={{
                    display: 'block', padding: '12px', borderRadius: 100,
                    border: '1px solid rgba(0,230,118,0.3)', background: 'transparent',
                    color: COLORS.green, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  }}>
                    Complete Your Profile
                  </a>
                </div>
              )}
            </div>

            {/* Quick actions */}
            {flowStep === 'chat' && messages.length <= 2 && (
              <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Need a ride now', 'Schedule for later', 'How much to the airport?'].map(q => (
                  <button key={q}
                    onClick={() => setInput(q)}
                    style={{
                      padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: COLORS.gray, cursor: 'pointer', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                    }}
                  >{q}</button>
                ))}
              </div>
            )}

            {/* Input */}
            {flowStep === 'chat' && (
              <div style={{
                padding: '12px 16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', gap: 8, flexShrink: 0,
              }}>
                <input ref={inputRef} type="text" value={input}
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
                <button onClick={sendMessage} disabled={!input.trim() || sending}
                  style={{
                    width: 44, height: 44, borderRadius: '50%', border: 'none',
                    background: input.trim() ? COLORS.green : 'rgba(255,255,255,0.06)',
                    color: input.trim() ? COLORS.black : COLORS.gray,
                    fontSize: 18, cursor: input.trim() ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >↑</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
