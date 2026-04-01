'use client';

import { useEffect, useRef, useState } from 'react';

interface ChatMsg {
  id: string;
  from: 'user' | 'assistant' | 'system';
  text: string;
  ticketId?: string;
}

interface Props {
  greeting: string;
  placeholder?: string;
  quickActions?: string[];
}

const COLORS = { green: '#00E676', black: '#080808', card: '#141414', white: '#fff', gray: '#888', red: '#FF5252', orange: '#FF9100' };

export default function SupportChat({ greeting, placeholder = 'Describe your issue...', quickActions }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    setMessages([{ id: '0', from: 'assistant', text: greeting }]);
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [greeting]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || sending) return;

    const userMsg: ChatMsg = { id: `u-${Date.now()}`, from: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    if (!overrideText) setInput('');
    setSending(true);

    try {
      const history = [...messages.filter(m => m.from !== 'system'), userMsg].map(m => ({
        role: m.from === 'user' ? 'user' as const : 'assistant' as const,
        content: m.text,
      }));

      const res = await fetch('/api/chat/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, conversationId }),
      });

      if (!res.ok) {
        const errText = await res.text();
        const isJson = errText.startsWith('{');
        setMessages(prev => [...prev, {
          id: `e-${Date.now()}`, from: 'system',
          text: isJson ? (JSON.parse(errText).error || 'Request failed') : `Error (${res.status})`,
        }]);
        setSending(false);
        return;
      }

      const data = await res.json();
      if (data.conversationId) setConversationId(data.conversationId);

      if (data.reply) {
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`, from: 'assistant', text: data.reply,
          ticketId: data.ticketCreated?.ticketId,
        }]);
      }

      // Show ticket confirmation
      if (data.ticketCreated?.ticketId) {
        setMessages(prev => [...prev, {
          id: `t-${Date.now()}`, from: 'system',
          text: `Ticket #${(data.ticketCreated.ticketId as string).slice(0, 8)} created — our team will follow up.`,
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`, from: 'system',
        text: `Something went wrong (${err instanceof Error ? err.message : 'unknown'})`,
      }]);
    }
    setSending(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex', justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 10,
          }}>
            <div style={{
              maxWidth: '85%', padding: '10px 14px', borderRadius: 16,
              fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line',
              background: msg.from === 'user' ? COLORS.green
                : msg.from === 'system' ? (msg.text.includes('Ticket') ? 'rgba(0,230,118,0.12)' : 'rgba(255,145,0,0.12)')
                : '#1f1f1f',
              color: msg.from === 'user' ? COLORS.black
                : msg.from === 'system' ? (msg.text.includes('Ticket') ? COLORS.green : COLORS.orange)
                : COLORS.white,
              borderBottomRightRadius: msg.from === 'user' ? 4 : 16,
              borderBottomLeftRadius: msg.from === 'user' ? 16 : 4,
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
      {quickActions && messages.length <= 2 && (
        <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {quickActions.map(q => (
            <button key={q} onClick={() => sendMessage(q)}
              style={{
                padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: COLORS.gray, cursor: 'pointer',
              }}>{q}</button>
          ))}
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
          placeholder={placeholder}
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 100,
            background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)',
            color: COLORS.white, fontSize: 15, outline: 'none',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        />
        <button onClick={() => sendMessage()} disabled={!input.trim() || sending}
          style={{
            width: 44, height: 44, borderRadius: '50%', border: 'none',
            background: input.trim() ? COLORS.green : 'rgba(255,255,255,0.06)',
            color: input.trim() ? COLORS.black : COLORS.gray,
            fontSize: 18, cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>↑</button>
      </div>
    </div>
  );
}
