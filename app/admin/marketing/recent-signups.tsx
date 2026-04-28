'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { openThreadOrCompose } from '@/lib/admin/thread-router';

interface Signup {
  id: string;
  name: string;
  phone: string | null;
  profileType: string;
  accountStatus: string;
  handle: string | null;
  createdAt: string;
}

interface Props {
  // Called when the user wants to start a fresh conversation (no existing
  // SMS history). Parent (MarketingDashboard) switches to the Enter Numbers
  // tab and prefills the textarea.
  onPrefillCompose: (phones: string[]) => void;
}

export function RecentSignups({ onPrefillCompose }: Props) {
  const router = useRouter();
  const [openingThread, setOpeningThread] = useState(false);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [smsText, setSmsText] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('hmu_dismissed_signups');
        return saved ? new Set(JSON.parse(saved)) : new Set();
      } catch { return new Set(); }
    }
    return new Set();
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  const saveDismissed = (ids: Set<string>) => {
    setDismissed(ids);
    try { localStorage.setItem('hmu_dismissed_signups', JSON.stringify([...ids])); } catch {}
  };

  const fetchSignups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/recent?days=${days}`);
      if (res.ok) {
        const data = await res.json();
        setSignups(data.signups ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch signups:', err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchSignups(); }, [fetchSignups]);

  // Filter out dismissed
  const visible = signups.filter(s => !dismissed.has(s.id));
  const withPhone = visible.filter(s => s.phone);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map(s => s.id)));
    }
  };

  const dismissSelected = () => {
    if (selected.size === 0) return;
    const next = new Set(dismissed);
    selected.forEach(id => next.add(id));
    saveDismissed(next);
    setSelected(new Set());
  };

  const dismissOne = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    saveDismissed(next);
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const undoDismiss = () => {
    saveDismissed(new Set());
  };

  const sendSms = async (phone: string, name: string) => {
    if (!smsText.trim()) return;
    setSending(phone);
    try {
      const personalizedMsg = smsText.replace(/\{name\}/g, name);
      const res = await fetch('/api/admin/marketing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: [{ phone, name }], message: personalizedMsg }),
      });
      if (res.ok) setSentTo(prev => new Set(prev).add(phone));
    } catch {} finally { setSending(null); }
  };

  // Per-row + bulk "Thread" handler. Single phone with SMS history → deep
  // link into the existing /admin/messages thread. Otherwise hand off to the
  // parent's prefill callback so the admin starts a fresh compose.
  const openThread = async (phones: string[]) => {
    if (openingThread) return;
    setOpeningThread(true);
    try {
      await openThreadOrCompose(phones, { router, prefillCompose: onPrefillCompose });
    } finally {
      setOpeningThread(false);
    }
  };

  const openThreadForSelected = () => {
    const targets = visible.filter(s => selected.has(s.id) && s.phone).map(s => s.phone!);
    if (targets.length === 0) return;
    openThread(targets);
  };

  const sendToSelected = async () => {
    if (!smsText.trim()) return;
    const targets = visible.filter(s => selected.has(s.id) && s.phone && !sentTo.has(s.phone));
    if (!targets.length) return;
    if (!confirm(`Send to ${targets.length} selected user${targets.length !== 1 ? 's' : ''}?`)) return;
    for (const s of targets) {
      await sendSms(s.phone!, s.name);
      await new Promise(r => setTimeout(r, 500));
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {[1, 3, 7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                days === d ? 'bg-white text-black' : 'bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white'
              }`}
            >
              {d === 1 ? 'Today' : `${d}d`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">
            {visible.length} showing · {dismissed.size > 0 && (
              <button onClick={undoDismiss} className="text-blue-400 hover:text-blue-300">
                {dismissed.size} hidden — undo
              </button>
            )}
          </span>
        </div>
      </div>

      {/* Quick message */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Quick Message</h3>
          <span className="text-[10px] text-neutral-500">Use {'{name}'} to personalize</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={smsText}
            onChange={(e) => setSmsText(e.target.value.slice(0, 160))}
            maxLength={160}
            placeholder="Type a message to send..."
            className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
          />
          {selected.size > 0 ? (
            <>
              <button
                onClick={openThreadForSelected}
                disabled={openingThread}
                className="bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 disabled:opacity-50 text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                title={selected.size === 1 ? 'Open existing thread or start one' : 'Prefill Enter Numbers with selected phones'}
              >
                {openingThread ? '…' : selected.size === 1 ? 'Thread' : `Thread (${selected.size})`}
              </button>
              <button
                onClick={sendToSelected}
                disabled={!smsText.trim()}
                className="bg-green-600 hover:bg-green-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
              >
                Send ({selected.size})
              </button>
            </>
          ) : (
            <button
              disabled
              className="bg-neutral-700 text-neutral-500 text-xs font-semibold px-4 py-2 rounded-lg whitespace-nowrap"
            >
              Select users
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className={`text-[10px] ${smsText.length > 140 ? 'text-yellow-400' : 'text-neutral-600'}`}>
            {smsText.length}/160
          </span>
          {sentTo.size > 0 && <span className="text-[10px] text-green-400">{sentTo.size} sent this session</span>}
        </div>
      </div>

      {/* Signup list */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        {/* List header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                selected.size === visible.length && visible.length > 0
                  ? 'bg-green-500 border-green-500'
                  : 'border-neutral-600 hover:border-neutral-400'
              }`}
            >
              {selected.size === visible.length && visible.length > 0 && (
                <span className="text-black text-xs font-bold">✓</span>
              )}
            </button>
            <span className="text-xs text-neutral-400">
              {selected.size > 0 ? `${selected.size} selected` : `${visible.length} users`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <button
                onClick={dismissSelected}
                className="text-xs text-neutral-500 hover:text-red-400 transition-colors px-2 py-1"
              >
                Dismiss ({selected.size})
              </button>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-xs text-neutral-500 hover:text-white transition-colors px-2 py-1"
            >
              {collapsed ? 'Expand' : 'Collapse'}
            </button>
          </div>
        </div>

        {/* List body */}
        {!collapsed && (
          loading ? (
            <div className="p-8 text-center text-neutral-500 text-sm">Loading...</div>
          ) : visible.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm">
              {dismissed.size > 0 ? 'All signups dismissed' : `No signups in the last ${days} day${days !== 1 ? 's' : ''}`}
            </div>
          ) : (
            <div className="divide-y divide-neutral-800/50 max-h-[500px] overflow-y-auto">
              {visible.map((signup) => {
                const isSelected = selected.has(signup.id);
                const isSent = signup.phone ? sentTo.has(signup.phone) : false;

                return (
                  <div
                    key={signup.id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      isSelected ? 'bg-white/5' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(signup.id)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'bg-green-500 border-green-500' : 'border-neutral-700 hover:border-neutral-500'
                      }`}
                    >
                      {isSelected && <span className="text-black text-xs font-bold">✓</span>}
                    </button>

                    {/* Type dot */}
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      signup.profileType === 'driver' ? 'bg-blue-500' : 'bg-green-500'
                    }`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{signup.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          signup.profileType === 'driver' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                        }`}>
                          {signup.profileType}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {signup.phone ? (
                          <span className="text-xs text-neutral-400 font-mono">{signup.phone}</span>
                        ) : (
                          <span className="text-xs text-neutral-600">No phone</span>
                        )}
                        <span className="text-[10px] text-neutral-600">{timeAgo(signup.createdAt)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {signup.phone && (
                        <button
                          onClick={() => openThread([signup.phone!])}
                          disabled={openingThread}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 disabled:opacity-50"
                          title="Open thread or start one"
                        >
                          Thread
                        </button>
                      )}
                      {signup.phone && (
                        <button
                          onClick={() => sendSms(signup.phone!, signup.name)}
                          disabled={sending === signup.phone || isSent || !smsText.trim()}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                            isSent
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white disabled:opacity-30'
                          }`}
                        >
                          {isSent ? '✓' : sending === signup.phone ? '...' : 'Send'}
                        </button>
                      )}
                      <button
                        onClick={() => dismissOne(signup.id)}
                        className="text-neutral-700 hover:text-red-400 transition-colors p-1"
                        title="Dismiss"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
