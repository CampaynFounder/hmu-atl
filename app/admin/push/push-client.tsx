'use client';

// Admin marketing/announcement push tool. Search or one-click a user (incl. the
// reviewer demo accounts), compose a title + body + optional deep link, choose
// channels, and send. Mirrors the house admin patterns: inline toast state,
// CSS-var theming, optimistic-free fetch with explicit result feedback.

import { useState, useCallback, useRef } from 'react';
import type { AdminUserSearchResult } from '@/lib/db/types';
import type { DemoHandles } from '@/lib/demo/handles';
import { UserSearchPicker } from '../components/user-search-picker';

const TITLE_MAX = 100;
const BODY_MAX = 240;

interface Target {
  id: string;
  name: string;
  sub: string | null;   // handle / phone / role, for display
  isDemo?: boolean;
}

interface DeviceStatus {
  hasPushToken: boolean;
  pushPlatform: string | null;
}

export default function PushClient({ demo }: { demo: DemoHandles }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [route, setRoute] = useState('');
  const [sendPush, setSendPush] = useState(true);
  const [sendInApp, setSendInApp] = useState(true);

  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, kind: 'ok' | 'err') => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const loadDevice = useCallback(async (userId: string) => {
    setDevice(null);
    setDeviceLoading(true);
    try {
      const res = await fetch(`/api/admin/push?userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const d = await res.json() as { hasPushToken: boolean; pushPlatform: string | null };
        setDevice({ hasPushToken: d.hasPushToken, pushPlatform: d.pushPlatform });
      }
    } catch { /* leave null */ }
    finally { setDeviceLoading(false); }
  }, []);

  const selectUser = useCallback((u: AdminUserSearchResult) => {
    const name = u.display_name || u.handle || 'Unnamed';
    const sub = [u.handle ? `@${u.handle}` : null, u.phone, u.profile_type].filter(Boolean).join(' · ');
    setTarget({ id: u.id, name, sub: sub || null });
    loadDevice(u.id);
  }, [loadDevice]);

  const selectDemo = useCallback((role: 'driver' | 'rider') => {
    const slot = demo[role];
    if (!slot.userId) {
      showToast(`No demo ${role} account provisioned (set DEMO_LOGIN_PHONE)`, 'err');
      return;
    }
    const name = slot.displayName || (slot.handle ? `@${slot.handle}` : `Demo ${role}`);
    setTarget({ id: slot.userId, name, sub: `demo ${role}${slot.handle ? ` · @${slot.handle}` : ''}`, isDemo: true });
    loadDevice(slot.userId);
  }, [demo, loadDevice, showToast]);

  const canSend = !!target && !!title.trim() && !!body.trim() && (sendPush || sendInApp) && !sending
    && title.length <= TITLE_MAX && body.length <= BODY_MAX;

  const send = useCallback(async () => {
    if (!target) return;
    setSending(true);
    setToast(null);
    try {
      const res = await fetch('/api/admin/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: target.id,
          title: title.trim(),
          body: body.trim(),
          route: route.trim() || undefined,
          sendPush,
          sendInApp,
        }),
      });
      const data = await res.json() as {
        ok?: boolean; error?: string;
        inAppSent?: boolean; pushSent?: boolean; pushSkippedNoDevice?: boolean;
      };
      if (!res.ok || !data.ok) {
        showToast(data.error || 'Send failed', 'err');
        return;
      }
      const legs: string[] = [];
      if (data.inAppSent) legs.push('in-app');
      if (data.pushSent) legs.push('push');
      let msg = legs.length ? `Sent to ${target.name} (${legs.join(' + ')})` : `Nothing delivered to ${target.name}`;
      if (data.pushSkippedNoDevice) msg += ' — push skipped, no device registered';
      showToast(msg, legs.length ? 'ok' : 'err');
    } catch {
      showToast('Network error', 'err');
    } finally {
      setSending(false);
    }
  }, [target, title, body, route, sendPush, sendInApp, showToast]);

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6" style={{ color: 'var(--admin-text)' }}>
      <div className="mb-5">
        <h1 className="text-xl font-bold flex items-center gap-2">📲 Push a Message</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--admin-text-muted)' }}>
          Send a marketing or announcement notification to a single user — OS push (lock screen) and/or an in-app banner.
        </p>
      </div>

      {/* Target */}
      <section className="mb-5">
        <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--admin-text-muted)' }}>
          Recipient
        </label>
        <UserSearchPicker onSelect={selectUser} placeholder="Search by name, handle, or phone…" />
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>Quick:</span>
          <button type="button" onClick={() => selectDemo('driver')} className="text-xs px-2 py-1 rounded"
            style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}>
            🎬 Demo driver
          </button>
          <button type="button" onClick={() => selectDemo('rider')} className="text-xs px-2 py-1 rounded"
            style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}>
            🎬 Demo rider
          </button>
        </div>

        {target && (
          <div className="mt-3 flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
            style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}>
            <div className="min-w-0">
              <div className="font-medium truncate">{target.name}{target.isDemo && <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--admin-bg)', color: 'var(--admin-text-muted)' }}>demo</span>}</div>
              {target.sub && <div className="text-xs truncate" style={{ color: 'var(--admin-text-muted)' }}>{target.sub}</div>}
            </div>
            <div className="text-xs shrink-0 text-right" style={{ color: 'var(--admin-text-muted)' }}>
              {deviceLoading ? 'checking device…'
                : device ? (device.hasPushToken
                  ? <span style={{ color: 'var(--admin-success, #16a34a)' }}>📱 device {device.pushPlatform || 'registered'}</span>
                  : <span style={{ color: 'var(--admin-warning, #d97706)' }}>⚠ no device — in-app only</span>)
                : ''}
            </div>
          </div>
        )}
      </section>

      {/* Compose */}
      <section className="mb-5 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--admin-text-muted)' }}>Title</label>
            <span className="text-[11px]" style={{ color: title.length > TITLE_MAX ? 'var(--admin-danger, #dc2626)' : 'var(--admin-text-muted)' }}>{title.length}/{TITLE_MAX}</span>
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 🎉 New drivers near you"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--admin-text-muted)' }}>Message</label>
            <span className="text-[11px]" style={{ color: body.length > BODY_MAX ? 'var(--admin-danger, #dc2626)' : 'var(--admin-text-muted)' }}>{body.length}/{BODY_MAX}</span>
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="What do you want to say?"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
            style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--admin-text-muted)' }}>
            Deep link (optional)
          </label>
          <input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="e.g. /(rider)/home — where a tap should open"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
            style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }} />
        </div>
      </section>

      {/* Channels */}
      <section className="mb-5 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} />
          OS push <span style={{ color: 'var(--admin-text-muted)' }}>(lock screen)</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={sendInApp} onChange={(e) => setSendInApp(e.target.checked)} />
          In-app banner <span style={{ color: 'var(--admin-text-muted)' }}>(if app is open)</span>
        </label>
      </section>

      {/* Live preview */}
      {(title.trim() || body.trim()) && (
        <section className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--admin-text-muted)' }}>Preview</div>
          <div className="px-4 py-3 rounded-xl" style={{ background: '#1c1c1c', border: '1px solid var(--admin-border)' }}>
            <div className="font-bold text-sm" style={{ color: '#f5c451' }}>{title.trim() || 'Title'}</div>
            <div className="text-sm mt-0.5" style={{ color: '#e5e5e5' }}>{body.trim() || 'Message body'}</div>
          </div>
        </section>
      )}

      {/* Send */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={send} disabled={!canSend}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-opacity"
          style={{ background: canSend ? 'var(--admin-accent, #2563eb)' : 'var(--admin-bg-elevated)', color: canSend ? '#fff' : 'var(--admin-text-muted)', opacity: canSend ? 1 : 0.6, cursor: canSend ? 'pointer' : 'not-allowed' }}>
          {sending ? 'Sending…' : 'Send notification'}
        </button>
        {!target && <span className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>Pick a recipient first</span>}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-sm shadow-lg z-50"
          style={{ background: toast.kind === 'ok' ? 'var(--admin-success, #16a34a)' : 'var(--admin-danger, #dc2626)', color: '#fff', maxWidth: '90vw' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
