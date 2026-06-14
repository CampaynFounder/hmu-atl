'use client';

// Slide-up SMS conversation sheet for the Engage console. Deliberately reuses
// the existing admin messaging backend — it does NOT introduce a parallel SMS
// path:
//   • GET  /api/admin/messages?phone=  → merged sms_log + sms_inbound timeline
//   • POST /api/admin/marketing/send   → sends + writes the admin_sms_sent audit row
// Sending via /marketing/send (rather than creating a conversation_thread)
// means the AI conversation agent is never triggered by an admin reply.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAbly } from '@/hooks/use-ably';

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  message: string;
  eventType?: string;
  status?: string;
  createdAt: string;
}

interface ConversationData {
  phone: string;
  userName: string | null;
  userType: string | null;
  userId: string | null;
  messages: Message[];
}

export interface ConversationTarget {
  phone: string;
  name?: string | null;
  userType?: string | null;
  userId?: string | null;
  /** Optional context line shown under the header (e.g. "Missed a $25 ride"). */
  context?: string | null;
}

export function ConversationSheet({
  target,
  onClose,
  onSent,
}: {
  target: ConversationTarget;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const normalizedPhone = (target.phone || '').replace(/\D/g, '');

  const load = useCallback(async () => {
    if (!normalizedPhone) return;
    try {
      const res = await fetch(`/api/admin/messages?phone=${normalizedPhone}`);
      if (res.ok) setConversation(await res.json());
    } catch { /* keep last good state */ }
    setLoading(false);
  }, [normalizedPhone]);

  // load() only setState's after the fetch await resolves — no synchronous
  // cascading render (same shape as the Messages page's thread loader).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Live inbound refresh (same channel the Messages page listens on), plus a
  // 20s fallback poll in case an Ably publish is dropped.
  const handleAdminEvent = useCallback((msg: { name: string; data: unknown }) => {
    if (msg.name !== 'sms_inbound') return;
    const from = (msg.data as { from?: string } | undefined)?.from;
    if (from && from.replace(/\D/g, '') === normalizedPhone) load();
  }, [normalizedPhone, load]);
  useAbly({ channelName: 'admin:feed', onMessage: handleAdminEvent });
  useEffect(() => {
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  const send = async () => {
    const body = replyText.trim();
    if (!body || sending || !normalizedPhone) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/marketing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{ phone: normalizedPhone, name: target.name ?? conversation?.userName, userId: target.userId ?? conversation?.userId ?? undefined }],
          message: body,
          eventType: 'engage',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.sent ?? 0) > 0) {
        setReplyText('');
        await load();
        onSent?.();
      } else {
        setError(data.results?.[0]?.error || data.error || 'Send failed');
      }
    } catch {
      setError('Network error — try again');
    }
    setSending(false);
  };

  const name = target.name ?? conversation?.userName ?? null;
  const userType = target.userType ?? conversation?.userType ?? null;
  const msgs = conversation ? [...conversation.messages].reverse() : [];

  const fmtTime = (s: string) =>
    new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end sm:items-center sm:justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: 'var(--admin-bg-elevated)',
          border: '1px solid var(--admin-border)',
          height: 'min(85vh, 640px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--admin-border)' }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: 'rgba(0,230,118,0.18)', color: '#00E676' }}>
            {name ? name.charAt(0).toUpperCase() : '#'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--admin-text)' }}>
              {name ?? target.phone}
            </div>
            <div className="text-[11px] font-mono flex items-center gap-2" style={{ color: 'var(--admin-text-muted)' }}>
              <span>{normalizedPhone}</span>
              {userType && (
                <span style={{ color: userType === 'driver' ? '#448AFF' : '#00E676' }}>{userType}</span>
              )}
            </div>
            {target.context && (
              <div className="text-[11px] truncate" style={{ color: 'var(--admin-text-muted)' }}>{target.context}</div>
            )}
          </div>
          <button onClick={onClose} className="text-lg px-2" style={{ color: 'var(--admin-text-muted)' }}>✕</button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {loading && normalizedPhone ? (
            <div className="text-center text-sm py-8" style={{ color: 'var(--admin-text-muted)' }}>Loading…</div>
          ) : msgs.length === 0 ? (
            <div className="text-center text-sm py-8" style={{ color: 'var(--admin-text-muted)' }}>
              No messages yet. Say hi 👋
            </div>
          ) : (
            msgs.map((m) => (
              <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${m.direction === 'outbound' ? 'rounded-br-md' : 'rounded-bl-md'}`}
                  style={{
                    background: m.direction === 'outbound' ? 'rgba(0,230,118,0.15)' : 'var(--admin-bg-active)',
                    color: 'var(--admin-text)',
                  }}>
                  <p className="text-sm leading-relaxed break-words">{m.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>{fmtTime(m.createdAt)}</span>
                    {m.direction === 'outbound' && m.status === 'failed' && (
                      <span className="text-[9px] text-red-400">failed</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="px-3 py-3" style={{ borderTop: '1px solid var(--admin-border)' }}>
          {error && <div className="text-[11px] text-red-400 mb-1.5 px-1">{error}</div>}
          <div className="flex gap-2 items-end">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value.slice(0, 160))}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              maxLength={160}
              placeholder="Type a message…"
              className="flex-1 rounded-full px-4 py-2.5 text-sm focus:outline-none"
              style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
            />
            <button
              onClick={send}
              disabled={sending || !replyText.trim() || !normalizedPhone}
              className="font-semibold text-sm px-5 py-2.5 rounded-full transition-colors disabled:opacity-50"
              style={{ background: '#00E676', color: '#000' }}
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
          <div className="text-[10px] mt-1 px-2" style={{ color: replyText.length > 140 ? '#FFB300' : 'var(--admin-text-muted)' }}>
            {replyText.length}/160 {!normalizedPhone && '· no phone on file'}
          </div>
        </div>
      </div>
    </div>
  );
}
