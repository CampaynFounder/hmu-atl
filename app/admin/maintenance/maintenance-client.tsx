'use client';

import { useState } from 'react';

interface SerializedState {
  enabled: boolean;
  title: string;
  body: string;
  expected_return_at: string | null;  // ISO
  updated_at: string;
}

interface SerializedWaitlistEntry {
  id: string;
  phone: string;
  user_id: string | null;
  created_at: string;
  notified_at: string | null;
  notified_count: number;
}

interface Stats { total: number; unnotified: number; notified: number }

interface Props {
  initialState: SerializedState;
  initialWaitlist: SerializedWaitlistEntry[];
  initialStats: Stats;
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MaintenanceClient({ initialState, initialWaitlist, initialStats }: Props) {
  const [state, setState] = useState<SerializedState>(initialState);
  const [waitlist, setWaitlist] = useState<SerializedWaitlistEntry[]>(initialWaitlist);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [draft, setDraft] = useState({
    enabled: initialState.enabled,
    title: initialState.title,
    body: initialState.body,
    expected_return_at: toDatetimeLocal(initialState.expected_return_at),
  });
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('HMU ATL is back live — open the app and run it up. atl.hmucashride.com');
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  const dirty =
    draft.enabled !== state.enabled ||
    draft.title !== state.title ||
    draft.body !== state.body ||
    draft.expected_return_at !== toDatetimeLocal(state.expected_return_at);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: draft.enabled,
          title: draft.title,
          body: draft.body,
          expected_return_at: draft.expected_return_at ? new Date(draft.expected_return_at).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Save failed' }));
        showToast(data.error || 'Save failed');
        return;
      }
      const { state: saved } = await res.json();
      const serialized: SerializedState = {
        ...saved,
        expected_return_at: saved.expected_return_at ? new Date(saved.expected_return_at).toISOString() : null,
        updated_at: saved.updated_at,
      };
      setState(serialized);
      setDraft({
        enabled: serialized.enabled,
        title: serialized.title,
        body: serialized.body,
        expected_return_at: toDatetimeLocal(serialized.expected_return_at),
      });
      showToast(serialized.enabled ? 'Maintenance ENABLED' : 'Maintenance disabled');
    } catch {
      showToast('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function refreshWaitlist() {
    const res = await fetch('/api/admin/maintenance/waitlist');
    if (!res.ok) return;
    const data = await res.json() as { entries: SerializedWaitlistEntry[]; stats: Stats };
    setWaitlist(data.entries);
    setStats(data.stats);
  }

  async function notifyAll() {
    if (stats.unnotified === 0) { showToast('Nobody to notify'); return; }
    if (!confirm(`Send "${notifyMessage}" to ${stats.unnotified} phone${stats.unnotified === 1 ? '' : 's'}?`)) return;
    setNotifying(true);
    try {
      const res = await fetch('/api/admin/maintenance/waitlist/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: notifyMessage }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Notify failed' }));
        showToast(data.error || 'Notify failed');
        return;
      }
      const data = await res.json() as { scanned: number; sent: number; failed: number };
      showToast(`Sent ${data.sent} · failed ${data.failed}`);
      await refreshWaitlist();
    } catch {
      showToast('Network error');
    } finally {
      setNotifying(false);
    }
  }

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--admin-text)' }}>
          Scheduled Maintenance
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--admin-text-secondary)' }}>
          When enabled, non-admin users see a branded maintenance page instead of the authenticated app. Admins stay in.
        </p>
      </header>

      {/* Status banner */}
      <div
        className="rounded-xl p-4 mb-6 flex items-center justify-between gap-3 flex-wrap"
        style={{
          background: state.enabled ? 'rgba(255,82,82,0.14)' : 'var(--admin-bg-elevated)',
          border: state.enabled ? '1px solid rgba(255,82,82,0.4)' : '1px solid var(--admin-border)',
        }}
      >
        <div>
          <p className="text-[10px] font-bold tracking-[3px]" style={{ color: 'var(--admin-text-faint)' }}>CURRENT STATUS</p>
          <p className="text-lg font-bold" style={{ color: state.enabled ? '#FF5252' : 'var(--admin-text)' }}>
            {state.enabled ? '⚠️ MAINTENANCE ENABLED' : 'LIVE — normal operation'}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>
            Last changed {new Date(state.updated_at).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Editor */}
      <div
        className="rounded-xl p-5 mb-6"
        style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
      >
        <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--admin-text)' }}>Configuration</h2>

        <label className="flex items-center justify-between mb-4 p-3 rounded-lg cursor-pointer"
          style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--admin-text)' }}>
              Maintenance mode {draft.enabled ? 'ON' : 'OFF'}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>
              Toggle then click Save. Middleware cache catches up within 30s.
            </p>
          </div>
          <span
            className="w-11 h-6 rounded-full relative transition-colors shrink-0"
            style={{ background: draft.enabled ? '#FF5252' : 'rgba(255,255,255,0.1)' }}
            onClick={() => setDraft(d => ({ ...d, enabled: !d.enabled }))}
          >
            <span
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
              style={{ left: draft.enabled ? '22px' : '2px' }}
            />
          </span>
          <input type="checkbox" className="hidden" checked={draft.enabled} onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))} />
        </label>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>HEADLINE</label>
            <input
              value={draft.title}
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
              className="field-input"
              placeholder="Scheduled maintenance — back soon"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>MESSAGE BODY</label>
            <textarea
              value={draft.body}
              onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
              className="field-input"
              rows={5}
              placeholder="We're heads-down making HMU the way rides SHOULD work..."
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--admin-text-muted)' }}>
              Tip: call out the mission — why drivers + riders pick you over the big platforms.
            </p>
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>EXPECTED BACK (OPTIONAL)</label>
            <input
              type="datetime-local"
              value={draft.expected_return_at}
              onChange={e => setDraft(d => ({ ...d, expected_return_at: e.target.value }))}
              className="field-input"
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--admin-text-muted)' }}>
              Users see a friendly &quot;in about X hours&quot; format. Blank = &quot;very soon&quot;.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end mt-5">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-5 py-2.5 rounded-lg font-bold text-sm disabled:opacity-40"
            style={{ background: dirty ? '#00E676' : 'var(--admin-bg)', color: dirty ? '#080808' : 'var(--admin-text-muted)' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Waitlist */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
      >
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-bold" style={{ color: 'var(--admin-text)' }}>
            Waitlist — notify when back live
          </h2>
          <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--admin-text-secondary)' }}>
            <span><strong style={{ color: 'var(--admin-text)' }}>{stats.total}</strong> total</span>
            <span><strong style={{ color: '#00E676' }}>{stats.unnotified}</strong> unnotified</span>
            <span><strong style={{ color: 'var(--admin-text-muted)' }}>{stats.notified}</strong> notified</span>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>SMS TO SEND (155-CHAR MAX)</label>
          <textarea
            value={notifyMessage}
            onChange={e => setNotifyMessage(e.target.value)}
            rows={2}
            className="field-input"
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px]" style={{ color: notifyMessage.length > 155 ? '#FF5252' : 'var(--admin-text-muted)' }}>
              {notifyMessage.length} / 155 chars
            </p>
            <button
              onClick={notifyAll}
              disabled={notifying || stats.unnotified === 0 || notifyMessage.length > 155 || notifyMessage.length === 0}
              className="px-4 py-2 rounded-lg font-bold text-xs disabled:opacity-40"
              style={{ background: '#00E676', color: '#080808' }}
            >
              {notifying ? 'Sending…' : `Notify ${stats.unnotified} ${stats.unnotified === 1 ? 'user' : 'users'}`}
            </button>
          </div>
        </div>

        {waitlist.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'var(--admin-text-muted)' }}>
            Nobody on the waitlist yet.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--admin-text-muted)' }}>
                  <th className="text-left py-1.5 pr-3">Phone</th>
                  <th className="text-right py-1.5 px-2">Added</th>
                  <th className="text-right py-1.5 pl-2">Notified</th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map(w => (
                  <tr key={w.id} style={{ borderTop: '1px solid var(--admin-border)' }}>
                    <td className="py-1.5 pr-3" style={{ color: 'var(--admin-text)' }}>
                      {w.phone}
                      {w.user_id && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(68,138,255,0.12)', color: '#448AFF' }}>user</span>}
                    </td>
                    <td className="text-right py-1.5 px-2" style={{ color: 'var(--admin-text-secondary)' }}>
                      {new Date(w.created_at).toLocaleString()}
                    </td>
                    <td className="text-right py-1.5 pl-2" style={{ color: w.notified_at ? 'var(--admin-text-muted)' : '#00E676' }}>
                      {w.notified_at ? new Date(w.notified_at).toLocaleString() : 'pending'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-50"
          style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
        >
          {toast}
        </div>
      )}

      <style jsx>{`
        .field-input {
          width: 100%;
          padding: 10px 12px;
          font-size: 14px;
          border-radius: 8px;
          background: var(--admin-bg);
          border: 1px solid var(--admin-border);
          color: var(--admin-text);
          outline: none;
          font-family: inherit;
        }
        .field-input:focus {
          border-color: var(--admin-accent, #448AFF);
        }
      `}</style>
    </div>
  );
}
