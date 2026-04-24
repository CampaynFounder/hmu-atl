'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAbly } from '@/hooks/use-ably';
import SafetyEventCard, { type SafetyEventRow, EVENT_LABEL } from '@/components/admin/safety/safety-event-card';
import SafetySubNav from '@/components/admin/safety/safety-subnav';
import type { SafetyEventType, SafetyEventSeverity, SafetyParty } from '@/lib/db/types';

type Scope = 'open' | 'recent';

const EVENT_TYPE_OPTIONS: Array<{ value: '' | SafetyEventType; label: string }> = [
  { value: '', label: 'All types' },
  ...(Object.entries(EVENT_LABEL) as Array<[SafetyEventType, string]>).map(([value, label]) => ({ value, label })),
];
const SEVERITY_OPTIONS: Array<{ value: '' | SafetyEventSeverity; label: string }> = [
  { value: '', label: 'Any severity' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'warn', label: 'Warn' },
  { value: 'info', label: 'Info' },
];
const PARTY_OPTIONS: Array<{ value: '' | SafetyParty; label: string }> = [
  { value: '', label: 'Any party' },
  { value: 'rider', label: 'Rider' },
  { value: 'driver', label: 'Driver' },
  { value: 'system', label: 'System' },
];

export function SafetyQueue() {
  const [events, setEvents] = useState<SafetyEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>('open');
  const [eventType, setEventType] = useState<'' | SafetyEventType>('');
  const [severity, setSeverity] = useState<'' | SafetyEventSeverity>('');
  const [party, setParty] = useState<'' | SafetyParty>('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope, limit: '100' });
      if (eventType) params.set('event_type', eventType);
      if (severity) params.set('severity', severity);
      if (party) params.set('party', party);
      const res = await fetch(`/api/admin/safety?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [scope, eventType, severity, party]);

  useEffect(() => { refresh(); }, [refresh]);

  const onAdminMsg = useCallback((msg: { name: string }) => {
    if (msg.name === 'safety_alert' || msg.name === 'safety_event_resolved' || msg.name === 'safety_check_sent') {
      refresh();
    }
  }, [refresh]);
  useAbly({ channelName: 'admin:feed', onMessage: onAdminMsg });

  return (
    <div style={{ padding: '20px', color: 'var(--admin-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Safety</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setScope('open')}
            style={tabStyle(scope === 'open', '#FF6B35')}
          >
            Open
          </button>
          <button
            onClick={() => setScope('recent')}
            style={tabStyle(scope === 'recent', '#3b82f6')}
          >
            Recent (100)
          </button>
        </div>
      </div>

      <SafetySubNav />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Select value={eventType} onChange={setEventType} options={EVENT_TYPE_OPTIONS} />
        <Select value={severity} onChange={setSeverity} options={SEVERITY_OPTIONS} />
        <Select value={party} onChange={setParty} options={PARTY_OPTIONS} />
        {(eventType || severity || party) && (
          <button
            onClick={() => { setEventType(''); setSeverity(''); setParty(''); }}
            style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8,
              border: '1px solid var(--admin-border)', background: 'transparent',
              color: 'var(--admin-text-secondary)', cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {loading && events.length === 0 && (
        <div style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>Loading…</div>
      )}
      {!loading && events.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--admin-text-muted)',
          background: 'var(--admin-bg-elevated)', borderRadius: 16, fontSize: 14,
        }}>
          {scope === 'open'
            ? (eventType || severity || party
              ? 'No events match these filters.'
              : 'No open safety events. All rides looking clean.')
            : 'No recent events.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map((e) => (
          <SafetyEventCard key={e.id} event={e} onResolved={refresh} />
        ))}
      </div>
    </div>
  );
}

function tabStyle(active: boolean, activeBg: string): React.CSSProperties {
  return {
    padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 999,
    border: '1px solid var(--admin-border)',
    background: active ? activeBg : 'transparent',
    color: active ? (activeBg === '#3b82f6' ? '#fff' : '#080808') : 'var(--admin-text-secondary)',
    cursor: 'pointer',
  };
}

function Select<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      style={{
        padding: '6px 10px', fontSize: 12, fontWeight: 600,
        background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
        borderRadius: 8, color: 'var(--admin-text)', cursor: 'pointer',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
