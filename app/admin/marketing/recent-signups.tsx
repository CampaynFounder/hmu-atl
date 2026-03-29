'use client';

import { useEffect, useState, useCallback } from 'react';

interface Signup {
  id: string;
  name: string;
  phone: string | null;
  profileType: string;
  accountStatus: string;
  handle: string | null;
  createdAt: string;
}

export function RecentSignups() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [smsText, setSmsText] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

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

  const sendSms = async (phone: string, name: string) => {
    if (!smsText.trim()) return;
    setSending(phone);
    try {
      const personalizedMsg = smsText.replace(/\{name\}/g, name);
      const res = await fetch('/api/admin/marketing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{ phone, name }],
          message: personalizedMsg,
        }),
      });
      if (res.ok) {
        setSentTo(prev => new Set(prev).add(phone));
      }
    } catch {
      // silent
    } finally {
      setSending(null);
    }
  };

  const sendToAll = async () => {
    if (!smsText.trim()) return;
    const withPhone = signups.filter(s => s.phone && !sentTo.has(s.phone));
    if (!withPhone.length) return;
    if (!confirm(`Send to ${withPhone.length} users?`)) return;

    for (const s of withPhone) {
      await sendSms(s.phone!, s.name);
      // Small delay between sends
      await new Promise(r => setTimeout(r, 500));
    }
  };

  const withPhone = signups.filter(s => s.phone);
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
        <span className="text-xs text-neutral-500">
          {signups.length} signup{signups.length !== 1 ? 's' : ''} · {withPhone.length} with phone
        </span>
      </div>

      {/* Quick message + send to all */}
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
            placeholder="Type a message to send to new signups..."
            className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
          />
          <button
            onClick={sendToAll}
            disabled={!smsText.trim() || withPhone.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            Send All ({withPhone.filter(s => !sentTo.has(s.phone!)).length})
          </button>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className={`text-[10px] ${smsText.length > 140 ? 'text-yellow-400' : 'text-neutral-600'}`}>
            {smsText.length}/160
          </span>
          {sentTo.size > 0 && (
            <span className="text-[10px] text-green-400">{sentTo.size} sent</span>
          )}
        </div>
      </div>

      {/* Signup list */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-neutral-500 text-sm">Loading signups...</div>
        ) : signups.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-sm">No signups in the last {days} day{days !== 1 ? 's' : ''}</div>
        ) : (
          <div className="divide-y divide-neutral-800/50">
            {signups.map((signup) => (
              <div key={signup.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
                {/* Type badge */}
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
                    {signup.accountStatus === 'pending_activation' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium">pending</span>
                    )}
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

                {/* Send button */}
                {signup.phone && (
                  <button
                    onClick={() => sendSms(signup.phone!, signup.name)}
                    disabled={sending === signup.phone || sentTo.has(signup.phone) || !smsText.trim()}
                    className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      sentTo.has(signup.phone)
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white disabled:opacity-30'
                    }`}
                  >
                    {sentTo.has(signup.phone) ? 'Sent' : sending === signup.phone ? '...' : 'Send'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
