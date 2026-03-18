'use client';

import { useEffect, useRef, useState } from 'react';

interface DriverData {
  handle: string;
  displayName: string;
  areas: string[];
  pricing: Record<string, unknown>;
}

interface Props {
  driver: DriverData;
  open: boolean;
  onClose: () => void;
}

type Step = 'destination' | 'time' | 'stops' | 'trip_type' | 'price' | 'confirm' | 'pending' | 'expired';

interface Message {
  id: string;
  from: 'system' | 'rider';
  text: string;
  type?: 'buttons' | 'summary';
  buttons?: { label: string; value: string }[];
  summary?: {
    destination: string;
    time: string;
    stops: string;
    roundTrip: boolean;
    price: number;
  };
}

const EXPIRY_MINUTES = 15;
const TYPING_DELAY = 400;

export default function ChatBooking({ driver, open, onClose }: Props) {
  const [step, setStep] = useState<Step>('destination');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [typing, setTyping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initRef = useRef(false);

  // Collected data
  const dataRef = useRef({
    destination: '',
    time: '',
    stops: '',
    roundTrip: false,
    price: 0,
  });

  const minPrice = Number(driver.pricing.minimum ?? driver.pricing.base_rate ?? 15);

  // Initialize chat
  useEffect(() => {
    if (!open || initRef.current) return;
    initRef.current = true;
    addSystemMessage("yo what's good — where you tryna go?", 'destination');
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      // Only reset if we're not in pending state
      if (step !== 'pending') {
        setMessages([]);
        setStep('destination');
        setInputValue('');
        dataRef.current = { destination: '', time: '', stops: '', roundTrip: false, price: 0 };
        initRef.current = false;
      }
    }
  }, [open, step]);

  // Countdown timer
  useEffect(() => {
    if (step !== 'pending' || !expiresAt) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff === 0) {
        setStep('expired');
        addSystemMessageDirect("no response — they didn't catch it in time. no charge.");
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step, expiresAt]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  const addSystemMessageDirect = (text: string, buttons?: Message['buttons'], summary?: Message['summary']) => {
    const msg: Message = {
      id: `sys-${Date.now()}-${Math.random()}`,
      from: 'system',
      text,
      ...(buttons ? { type: 'buttons', buttons } : {}),
      ...(summary ? { type: 'summary', summary } : {}),
    };
    setMessages((prev) => [...prev, msg]);
  };

  const addSystemMessage = (text: string, nextStep: Step, buttons?: Message['buttons'], summary?: Message['summary']) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const msg: Message = {
        id: `sys-${Date.now()}-${Math.random()}`,
        from: 'system',
        text,
        ...(buttons ? { type: 'buttons', buttons } : {}),
        ...(summary ? { type: 'summary', summary } : {}),
      };
      setMessages((prev) => [...prev, msg]);
      setStep(nextStep);
      setTimeout(() => inputRef.current?.focus(), 100);
    }, TYPING_DELAY);
  };

  const addRiderMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `rider-${Date.now()}`, from: 'rider', text },
    ]);
  };

  const handleSend = (value?: string) => {
    const text = (value ?? inputValue).trim();
    if (!text) return;
    setInputValue('');

    addRiderMessage(text);

    switch (step) {
      case 'destination':
        dataRef.current.destination = text;
        addSystemMessage("bet — when you need the ride?", 'time');
        break;

      case 'time':
        dataRef.current.time = text;
        addSystemMessage(
          "any stops along the way?",
          'stops',
          [
            { label: "Nah, straight there", value: "none" },
            { label: "Yeah lemme type it", value: "type" },
          ]
        );
        break;

      case 'stops':
        if (text === 'type') {
          // They chose to type — wait for next message
          addSystemMessage("aight where you stopping?", 'stops');
          return;
        }
        dataRef.current.stops = text === 'none' ? 'none' : text;
        addSystemMessage(
          "one way or round trip?",
          'trip_type',
          [
            { label: "One way", value: "one_way" },
            { label: "Round trip", value: "round_trip" },
          ]
        );
        break;

      case 'trip_type':
        dataRef.current.roundTrip = text === 'round_trip';
        addSystemMessage(
          `how much you offering? ${driver.displayName} starts at $${minPrice}`,
          'price'
        );
        break;

      case 'price': {
        const num = parseFloat(text.replace(/[^0-9.]/g, ''));
        if (isNaN(num) || num < 1) {
          addSystemMessage("that ain't a number fam — how much?", 'price');
          return;
        }
        dataRef.current.price = num;
        const d = dataRef.current;
        addSystemMessage(
          "here's the rundown — look good?",
          'confirm',
          [
            { label: "Send it", value: "send" },
            { label: "Nah, lemme fix something", value: "restart" },
          ],
          {
            destination: d.destination,
            time: d.time,
            stops: d.stops,
            roundTrip: d.roundTrip,
            price: d.price,
          }
        );
        break;
      }

      case 'confirm':
        if (text === 'send') {
          submitBooking();
        } else {
          // Restart
          dataRef.current = { destination: '', time: '', stops: '', roundTrip: false, price: 0 };
          addSystemMessage("aight let's run it back — where you tryna go?", 'destination');
        }
        break;

      default:
        break;
    }
  };

  const submitBooking = async () => {
    setSubmitting(true);
    const d = dataRef.current;
    try {
      const res = await fetch(`/api/drivers/${driver.handle}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: d.price,
          areas: driver.areas.length > 0 ? driver.areas : ['ATL'],
          timeWindow: {
            destination: d.destination,
            time: d.time,
            stops: d.stops,
            round_trip: d.roundTrip,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        addSystemMessageDirect(data.error || "something went wrong — try again");
        setStep('confirm');
        return;
      }
      setExpiresAt(new Date(data.expiresAt));
      addSystemMessageDirect(`sent! ${driver.displayName} has 15 min to respond. no charge until they accept.`);
      setStep('pending');
    } catch {
      addSystemMessageDirect("network error — try again");
      setStep('confirm');
    } finally {
      setSubmitting(false);
    }
  };

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  if (!open) return null;

  const showInput = step !== 'pending' && step !== 'expired' && !submitting;

  return (
    <>
      <style>{`
        .chat-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100; }
        .chat-drawer { position: fixed; inset: 0; z-index: 101; background: #080808; display: flex; flex-direction: column; }
        .chat-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; }
        .chat-header-name { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 24px; color: #fff; }
        .chat-close { background: none; border: none; color: #888; font-size: 14px; cursor: pointer; padding: 8px 12px; font-family: var(--font-body, 'DM Sans', sans-serif); }
        .chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .msg { max-width: 85%; padding: 14px 18px; font-size: 15px; line-height: 1.5; font-family: var(--font-body, 'DM Sans', sans-serif); animation: msgIn 0.2s ease-out; }
        @keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .msg--system { align-self: flex-start; background: #1a1a1a; color: #e0e0e0; border-radius: 4px 20px 20px 20px; }
        .msg--rider { align-self: flex-end; background: #00E676; color: #080808; border-radius: 20px 4px 20px 20px; font-weight: 500; }
        .msg-buttons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .msg-chip { background: rgba(0,230,118,0.1); border: 1px solid rgba(0,230,118,0.3); color: #00E676; border-radius: 100px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); transition: all 0.15s; }
        .msg-chip:hover { background: rgba(0,230,118,0.2); transform: scale(1.03); }
        .summary-card { background: #141414; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 16px; margin-top: 10px; }
        .summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
        .summary-label { color: #888; }
        .summary-value { color: #e0e0e0; font-weight: 500; text-align: right; max-width: 60%; }
        .summary-price { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 36px; color: #00E676; text-align: center; margin: 8px 0; }
        .chat-input-area { flex-shrink: 0; padding: 12px 16px 28px; border-top: 1px solid rgba(255,255,255,0.08); background: #0a0a0a; }
        .chat-input-row { display: flex; gap: 10px; }
        .chat-input { flex: 1; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.12); border-radius: 100px; padding: 14px 20px; color: #fff; font-size: 16px; outline: none; font-family: var(--font-body, 'DM Sans', sans-serif); }
        .chat-input:focus { border-color: #00E676; }
        .chat-input::placeholder { color: #555; }
        .chat-send { background: #00E676; color: #080808; border: none; border-radius: 50%; width: 48px; height: 48px; font-size: 20px; cursor: pointer; font-weight: 700; transition: transform 0.15s; flex-shrink: 0; }
        .chat-send:hover { transform: scale(1.08); }
        .chat-send:disabled { opacity: 0.4; cursor: not-allowed; }
        .typing-indicator { align-self: flex-start; display: flex; gap: 4px; padding: 14px 18px; background: #1a1a1a; border-radius: 4px 20px 20px 20px; }
        .typing-dot { width: 6px; height: 6px; border-radius: 50%; background: #555; animation: typingBounce 1.2s ease-in-out infinite; }
        .typing-dot:nth-child(2) { animation-delay: 0.15s; }
        .typing-dot:nth-child(3) { animation-delay: 0.3s; }
        @keyframes typingBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }
        .pending-block { text-align: center; padding: 20px 0; }
        .pending-timer { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 56px; color: #00E676; line-height: 1; }
        .pending-label { font-size: 13px; color: #888; margin-top: 6px; }
        .timer-bar { height: 3px; background: #1a1a1a; border-radius: 100px; margin: 16px 0; overflow: hidden; }
        .timer-fill { height: 100%; background: #00E676; border-radius: 100px; transition: width 1s linear; }
        .chat-done-btn { width: 100%; padding: 14px; background: transparent; border: 1px solid rgba(255,255,255,0.12); border-radius: 100px; color: #bbb; font-size: 15px; cursor: pointer; margin-top: 12px; font-family: var(--font-body, 'DM Sans', sans-serif); }
      `}</style>

      <div className="chat-overlay" onClick={onClose} />
      <div className="chat-drawer">
        <div className="chat-header">
          <span className="chat-header-name">Book {driver.displayName}</span>
          <button className="chat-close" onClick={onClose}>Close</button>
        </div>

        <div className="chat-messages" ref={scrollRef}>
          {messages.map((msg) => (
            <div key={msg.id} className={`msg msg--${msg.from}`}>
              {msg.text}
              {msg.type === 'summary' && msg.summary && (
                <div className="summary-card">
                  <div className="summary-row">
                    <span className="summary-label">Where</span>
                    <span className="summary-value">{msg.summary.destination}</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">When</span>
                    <span className="summary-value">{msg.summary.time}</span>
                  </div>
                  {msg.summary.stops !== 'none' && (
                    <div className="summary-row">
                      <span className="summary-label">Stops</span>
                      <span className="summary-value">{msg.summary.stops}</span>
                    </div>
                  )}
                  <div className="summary-row">
                    <span className="summary-label">Trip</span>
                    <span className="summary-value">{msg.summary.roundTrip ? 'Round trip' : 'One way'}</span>
                  </div>
                  <div className="summary-price">${msg.summary.price}</div>
                </div>
              )}
              {msg.type === 'buttons' && msg.buttons && (
                <div className="msg-buttons">
                  {msg.buttons.map((btn) => (
                    <button
                      key={btn.value}
                      className="msg-chip"
                      onClick={() => handleSend(btn.value)}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {typing && (
            <div className="typing-indicator">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          )}

          {step === 'pending' && (
            <div className="pending-block">
              <div className="pending-timer">{mins}:{String(secs).padStart(2, '0')}</div>
              <div className="pending-label">waiting on {driver.displayName}...</div>
              <div className="timer-bar">
                <div className="timer-fill" style={{ width: `${(secondsLeft / (EXPIRY_MINUTES * 60)) * 100}%` }} />
              </div>
              <button className="chat-done-btn" onClick={onClose}>
                Close — I&apos;ll check back
              </button>
            </div>
          )}

          {step === 'expired' && (
            <div className="pending-block">
              <button className="chat-done-btn" onClick={onClose}>Got it</button>
            </div>
          )}
        </div>

        {showInput && (
          <div className="chat-input-area">
            <div className="chat-input-row">
              <input
                ref={inputRef}
                className="chat-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={
                  step === 'destination' ? 'e.g. buckhead to east atlanta' :
                  step === 'time' ? 'e.g. today 3pm, now' :
                  step === 'stops' ? 'e.g. grab food on memorial' :
                  step === 'price' ? `$${minPrice}+` :
                  'type here...'
                }
                disabled={submitting}
              />
              <button
                className="chat-send"
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || submitting}
              >
                {submitting ? '...' : '\u2191'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
