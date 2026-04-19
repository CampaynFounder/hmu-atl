'use client';

import { useState } from 'react';

export default function MaintenanceWaitlistForm() {
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'joined' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/maintenance/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Try again' }));
        setError(data.error || 'Try again');
        setState('error');
        return;
      }
      setState('joined');
    } catch {
      setError('Network error — try again');
      setState('error');
    }
  }

  if (state === 'joined') {
    return (
      <div
        className="rounded-xl p-5 text-center"
        style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.3)' }}
      >
        <p className="text-[#00e676] font-bold mb-1">You&apos;re on the list.</p>
        <p className="text-xs text-[#bbb]">We&apos;ll text you the second we&apos;re back live.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="block text-xs font-bold tracking-[2px] text-[#888] mb-2 uppercase">
          Text me when you&apos;re back
        </span>
        <input
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="(404) 555-1234"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          disabled={state === 'saving'}
          required
          className="w-full px-4 py-3 rounded-xl bg-[#141414] border border-[rgba(255,255,255,0.08)] text-white placeholder-[#555] focus:border-[#00e676] focus:outline-none transition-colors"
        />
      </label>
      <button
        type="submit"
        disabled={state === 'saving' || !phone.trim()}
        className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-50 transition-opacity"
        style={{ background: '#00e676', color: '#080808' }}
      >
        {state === 'saving' ? 'Adding you…' : 'Notify me when live'}
      </button>
      {error && <p className="text-xs text-center" style={{ color: '#FF5252' }}>{error}</p>}
      <p className="text-[10px] text-center text-[#555]">
        Just your number. One text when we&apos;re back. Reply STOP anytime.
      </p>
    </form>
  );
}
