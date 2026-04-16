'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAbly } from '@/hooks/use-ably';

interface Thread {
  phone: string;
  name: string | null;
  profileType: string | null;
  lastMessageAt: string;
  unreadCount: number;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  message: string;
  eventType?: string;
  status?: string;
  read?: boolean;
  createdAt: string;
}

interface ConversationData {
  phone: string;
  userName: string | null;
  userType: string | null;
  userId: string | null;
  messages: Message[];
}

interface SmsStats {
  outbound: number;
  inbound: number;
  failed: number;
  total: number;
  cost: number;
  byEventType: { type: string; count: number }[];
}

export function MessageHistory() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [smsStats, setSmsStats] = useState<SmsStats | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [drillFilter, setDrillFilter] = useState<'all' | 'inbound' | 'outbound' | 'failed' | null>(null);
  const [drillMessages, setDrillMessages] = useState<{ phone: string; message: string; status?: string; eventType?: string; createdAt: string; direction: string }[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/messages');
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
        if (data.smsStats) setSmsStats(data.smsStats);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  const openDrill = useCallback(async (filter: 'inbound' | 'outbound' | 'failed') => {
    setDrillFilter(filter);
    setDrillLoading(true);
    try {
      const res = await fetch(`/api/admin/messages?filter=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setDrillMessages(data.messages ?? []);
      }
    } catch {}
    setDrillLoading(false);
  }, []);

  const openConversation = useCallback(async (phone: string) => {
    setSelectedPhone(phone);
    try {
      const res = await fetch(`/api/admin/messages?phone=${phone}`);
      if (res.ok) {
        const data = await res.json();
        setConversation(data);
        fetchThreads();
      }
    } catch {}
  }, [fetchThreads]);

  // Track selected phone in a ref so the Ably callback always sees the latest value
  const selectedPhoneRef = useRef<string | null>(null);
  useEffect(() => { selectedPhoneRef.current = selectedPhone; }, [selectedPhone]);

  const openConversationRef = useRef(openConversation);
  useEffect(() => { openConversationRef.current = openConversation; }, [openConversation]);

  // Re-fetch threads + open conversation on inbound SMS via Ably
  const handleAdminEvent = useCallback((msg: { name: string; data: unknown }) => {
    if (msg.name === 'sms_inbound') {
      fetchThreads();
      // If we're viewing the conversation this message belongs to, refresh it
      const payload = msg.data as { from?: string } | undefined;
      const inboundPhone = payload?.from;
      if (inboundPhone && selectedPhoneRef.current === inboundPhone) {
        openConversationRef.current(inboundPhone);
      }
    }
  }, [fetchThreads]);

  useAbly({ channelName: 'admin:feed', onMessage: handleAdminEvent });

  // Fallback polling every 30s — catches messages if Ably publish failed
  useEffect(() => {
    const interval = setInterval(() => {
      fetchThreads();
      if (selectedPhoneRef.current) {
        openConversationRef.current(selectedPhoneRef.current);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchThreads]);

  const sendReply = async () => {
    if (!replyText.trim() || !selectedPhone) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/marketing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{ phone: selectedPhone, name: conversation?.userName }],
          message: replyText.trim(),
        }),
      });
      if (res.ok) {
        setReplyText('');
        // Refresh conversation
        await openConversation(selectedPhone);
      }
    } catch {}
    setSending(false);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  };

  // Conversation view
  if (selectedPhone && conversation) {
    const msgs = [...conversation.messages].reverse(); // Oldest first for chat view

    return (
      <div className="space-y-0 flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-neutral-800">
          <button
            onClick={() => { setSelectedPhone(null); setConversation(null); }}
            className="text-neutral-500 hover:text-white text-sm"
          >
            &larr;
          </button>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-white">
              {conversation.userName ?? conversation.phone}
            </h2>
            <p className="text-[10px] text-neutral-500 font-mono">
              {conversation.phone}
              {conversation.userType && (
                <span className={`ml-2 ${conversation.userType === 'driver' ? 'text-blue-400' : 'text-green-400'}`}>
                  {conversation.userType}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {msgs.map((msg) => (
            <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                msg.direction === 'outbound'
                  ? 'bg-[#00E676]/15 text-white rounded-br-md'
                  : 'bg-neutral-800 text-white rounded-bl-md'
              }`}>
                <p className="text-sm leading-relaxed break-words">{msg.message}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-neutral-500">{formatTime(msg.createdAt)}</span>
                  {msg.direction === 'outbound' && msg.eventType && (
                    <span className="text-[9px] text-neutral-600">{msg.eventType}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply */}
        <div className="pt-3 border-t border-neutral-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value.slice(0, 160))}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
              maxLength={160}
              placeholder="Type a reply..."
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-neutral-600"
            />
            <button
              onClick={sendReply}
              disabled={sending || !replyText.trim()}
              className="bg-[#00E676] hover:bg-[#00C864] disabled:bg-neutral-700 text-black font-semibold text-sm px-5 py-2.5 rounded-full transition-colors"
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
          <span className={`text-[10px] ml-4 ${replyText.length > 140 ? 'text-yellow-400' : 'text-neutral-600'}`}>
            {replyText.length}/160
          </span>
        </div>
      </div>
    );
  }

  // Thread list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Messages</h1>
      </div>

      {/* SMS Cost Stats — clickable for drill-down */}
      {smsStats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {([
            { key: 'outbound' as const, label: 'Outbound', value: smsStats.outbound, color: '#fff' },
            { key: 'inbound' as const, label: 'Inbound', value: smsStats.inbound, color: '#fff' },
            { key: 'failed' as const, label: 'Failed', value: smsStats.failed, color: smsStats.failed > 0 ? '#FF5252' : '#fff' },
          ]).map(({ key, label, value, color }) => (
            <button
              key={key}
              onClick={() => drillFilter === key ? setDrillFilter(null) : openDrill(key)}
              className={`bg-neutral-900 border rounded-xl p-3 text-left transition-colors cursor-pointer hover:bg-white/5 ${
                drillFilter === key ? 'border-[#00E676]' : 'border-neutral-800'
              }`}
            >
              <div className="text-[10px] font-bold tracking-[2px] text-neutral-600 uppercase" style={{ fontFamily: "'Space Mono', monospace" }}>{label}</div>
              <div className="text-xl font-bold" style={{ color }}>{value}</div>
            </button>
          ))}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
            <div className="text-[10px] font-bold tracking-[2px] text-neutral-600 uppercase" style={{ fontFamily: "'Space Mono', monospace" }}>Total</div>
            <div className="text-xl font-bold text-white">{smsStats.total}</div>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
            <div className="text-[10px] font-bold tracking-[2px] text-neutral-600 uppercase" style={{ fontFamily: "'Space Mono', monospace" }}>SMS Spend</div>
            <div className="text-xl font-bold" style={{ color: '#00E676', fontFamily: "'Space Mono', monospace" }}>${smsStats.cost.toFixed(2)}</div>
            <div className="text-[10px] text-neutral-600 mt-0.5">$0.0075/msg</div>
          </div>
        </div>
      )}

      {/* Drill-down message list */}
      {drillFilter && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <h2 className="text-sm font-semibold capitalize">{drillFilter} Messages</h2>
            <button
              onClick={() => setDrillFilter(null)}
              className="text-xs text-neutral-500 hover:text-white"
            >
              Close
            </button>
          </div>
          {drillLoading ? (
            <div className="p-6 text-center text-neutral-500 text-sm">Loading...</div>
          ) : drillMessages.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">No {drillFilter} messages</div>
          ) : (
            <div className="divide-y divide-neutral-800/50 max-h-80 overflow-y-auto">
              {drillMessages.map((msg, i) => (
                <div
                  key={i}
                  className="px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => { setDrillFilter(null); openConversation(msg.phone); }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-neutral-400">{msg.phone}</span>
                    <div className="flex items-center gap-2">
                      {msg.eventType && (
                        <span className="text-[9px] text-neutral-600 bg-white/5 px-1.5 py-0.5 rounded">{msg.eventType}</span>
                      )}
                      {msg.status === 'failed' && (
                        <span className="text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">FAILED</span>
                      )}
                      <span className="text-[10px] text-neutral-600">{timeAgo(msg.createdAt)}</span>
                    </div>
                  </div>
                  <p className="text-sm text-white truncate">{msg.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Event type breakdown */}
      {smsStats && smsStats.byEventType.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="text-[10px] font-bold tracking-[2px] text-neutral-600 uppercase mb-3" style={{ fontFamily: "'Space Mono', monospace" }}>By Type</div>
          <div className="flex flex-wrap gap-2">
            {smsStats.byEventType.map(e => (
              <div key={e.type} className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-1.5">
                <span className="text-xs text-neutral-400">{e.type || 'other'}</span>
                <span className="text-xs font-bold text-white" style={{ fontFamily: "'Space Mono', monospace" }}>{e.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-neutral-500 text-sm">Loading conversations...</div>
        ) : threads.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-sm">
            No message history yet. Send an SMS from Outreach or User Management to start a conversation.
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/50">
            {threads.map((thread) => (
              <button
                key={thread.phone}
                onClick={() => openConversation(thread.phone)}
                className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
              >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  thread.unreadCount > 0 ? 'bg-[#00E676]/20 text-[#00E676]' : 'bg-neutral-800 text-neutral-500'
                }`}>
                  {thread.name ? thread.name.charAt(0).toUpperCase() : '#'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white truncate">
                      {thread.name ?? thread.phone}
                    </span>
                    <span className="text-[10px] text-neutral-600 shrink-0 ml-2">
                      {timeAgo(thread.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-neutral-500 font-mono truncate">{thread.phone}</span>
                    {thread.profileType && (
                      <span className={`text-[10px] ${thread.profileType === 'driver' ? 'text-blue-400' : 'text-green-400'}`}>
                        {thread.profileType}
                      </span>
                    )}
                  </div>
                </div>

                {/* Unread badge */}
                {thread.unreadCount > 0 && (
                  <div className="bg-[#00E676] text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                    {thread.unreadCount}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
