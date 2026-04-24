'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMarket } from '@/app/admin/components/market-context';
import SafetySubNav from '@/components/admin/safety/safety-subnav';
import { EVENT_LABEL } from '@/components/admin/safety/safety-event-card';
import type {
  SafetyEventType, SafetyEventSeverity, SafetyParty, SafetyCheckParty, SafetyCheckTrigger,
} from '@/lib/db/types';

type Mode = 'prompt' | 'event' | 'distress';

interface RidePick {
  id: string;
  status: string;
  created_at: string;
  rider_name: string | null;
  driver_name: string | null;
}

interface FireLogEntry {
  at: string;
  mode: Mode;
  rideId: string;
  summary: string;
  ok: boolean;
  response?: unknown;
}

const EVENT_TYPES: SafetyEventType[] = [
  'off_route', 'stopped_too_long', 'gps_silence', 'wrong_direction', 'speed_extreme',
  'check_in_alert', 'distress_admin', 'distress_911', 'distress_contact', 'ignored_streak',
];
const SEVERITIES: SafetyEventSeverity[] = ['info', 'warn', 'high', 'critical'];
const EVENT_PARTIES: SafetyParty[] = ['rider', 'driver', 'system'];
const CHECK_PARTIES: SafetyCheckParty[] = ['rider', 'driver'];
const TRIGGERS: SafetyCheckTrigger[] = ['manual_admin', 'scheduled', 'anomaly_followup'];
const DISTRESS_KINDS = ['admin', '911', 'contact'] as const;
type DistressKind = (typeof DISTRESS_KINDS)[number];

export function SafetyTestHarness() {
  const [mode, setMode] = useState<Mode>('prompt');
  const [rides, setRides] = useState<RidePick[]>([]);
  const [rideQuery, setRideQuery] = useState('');
  const [selectedRide, setSelectedRide] = useState<RidePick | null>(null);

  // Prompt mode
  const [promptParty, setPromptParty] = useState<SafetyCheckParty>('rider');
  const [promptTrigger, setPromptTrigger] = useState<SafetyCheckTrigger>('manual_admin');
  const [autoDismiss, setAutoDismiss] = useState<number>(60);

  // Event mode
  const [eventType, setEventType] = useState<SafetyEventType>('check_in_alert');
  const [eventSeverity, setEventSeverity] = useState<SafetyEventSeverity>('warn');
  const [eventParty, setEventParty] = useState<SafetyParty>('rider');
  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');

  // Distress mode
  const [distressParty, setDistressParty] = useState<SafetyCheckParty>('rider');
  const [distressKind, setDistressKind] = useState<DistressKind>('admin');

  const [firing, setFiring] = useState(false);
  const [log, setLog] = useState<FireLogEntry[]>([]);
  const { selectedMarketId } = useMarket();

  // Ride search (debounced). Market switch clears the current pick because
  // that ride might not belong to the new market.
  const fetchRides = useCallback(async (q: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (selectedMarketId) params.set('market_id', selectedMarketId);
    const res = await fetch(`/api/admin/safety/test?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setRides(data.rides ?? []);
    }
  }, [selectedMarketId]);

  useEffect(() => {
    const handle = setTimeout(() => fetchRides(rideQuery), 220);
    return () => clearTimeout(handle);
  }, [rideQuery, fetchRides]);

  // When market changes, drop the selected ride (it may be out-of-scope now).
  useEffect(() => {
    setSelectedRide(null);
  }, [selectedMarketId]);

  async function fire() {
    if (!selectedRide) return;
    setFiring(true);

    let body: Record<string, unknown>;
    let summary: string;
    if (mode === 'prompt') {
      body = {
        mode: 'prompt', rideId: selectedRide.id,
        party: promptParty, trigger: promptTrigger, autoDismissSeconds: autoDismiss,
      };
      summary = `Prompt → ${promptParty} (trigger=${promptTrigger}, ${autoDismiss}s)`;
    } else if (mode === 'event') {
      body = {
        mode: 'event', rideId: selectedRide.id,
        eventType, severity: eventSeverity, party: eventParty,
        locationLat: lat ? Number(lat) : undefined,
        locationLng: lng ? Number(lng) : undefined,
      };
      summary = `Event → ${EVENT_LABEL[eventType]} · ${eventSeverity} · ${eventParty}`;
    } else {
      body = {
        mode: 'distress', rideId: selectedRide.id,
        party: distressParty, kind: distressKind,
      };
      summary = `Distress → ${distressKind} (${distressParty})`;
    }

    try {
      const res = await fetch('/api/admin/safety/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      setLog((prev) => [{
        at: new Date().toISOString(),
        mode, rideId: selectedRide.id,
        summary, ok: res.ok, response: data,
      }, ...prev].slice(0, 20));
    } catch (err) {
      setLog((prev) => [{
        at: new Date().toISOString(),
        mode, rideId: selectedRide.id,
        summary: summary + ' (network error)', ok: false,
        response: String(err),
      }, ...prev].slice(0, 20));
    } finally {
      setFiring(false);
    }
  }

  return (
    <div style={{ padding: '20px', color: 'var(--admin-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Safety · Test</h1>
        <span style={{
          fontSize: 10, padding: '4px 10px', borderRadius: 999,
          background: 'rgba(168,85,247,0.18)', color: '#C084FC',
          fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
        }}>
          Admin only · Fires real events
        </span>
      </div>

      <SafetySubNav />

      <div style={cardStyle}>
        <SectionLabel>1. Pick a ride</SectionLabel>
        <input
          type="text" value={rideQuery}
          onChange={(e) => setRideQuery(e.target.value)}
          placeholder="Search by rider/driver name or ride ID…"
          style={inputStyle}
        />
        <div style={{ marginTop: 10, display: 'grid', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
          {rides.map((r) => {
            const active = selectedRide?.id === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setSelectedRide(r)}
                style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: 8,
                  background: active ? '#00E676' : 'var(--admin-bg)',
                  color: active ? '#080808' : 'var(--admin-text)',
                  border: `1px solid ${active ? '#00E676' : 'var(--admin-border)'}`,
                  fontSize: 13, cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', gap: 8,
                }}
              >
                <span style={{ fontFamily: 'monospace' }}>{r.id.slice(0, 8)}</span>
                <span style={{ flex: 1 }}>
                  {r.rider_name ?? '—'} · {r.driver_name ?? '—'}
                </span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>
                  {r.status}
                </span>
              </button>
            );
          })}
          {rides.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', padding: 8 }}>
              No rides match.
            </div>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <SectionLabel>2. Pick what to fire</SectionLabel>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {(['prompt', 'event', 'distress'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                background: mode === m ? 'var(--admin-bg-active)' : 'transparent',
                border: '1px solid var(--admin-border)',
                color: mode === m ? 'var(--admin-text)' : 'var(--admin-text-secondary)',
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {mode === 'prompt' && (
          <>
            <Desc>
              Inserts a `ride_safety_checks` row and publishes `safety_check_prompt` to
              <code style={codeStyle}>ride:{'{id}'}</code>. The active-ride client for the
              targeted party will mount the check-in overlay.
            </Desc>
            <Row>
              <Field label="Party">
                <Select value={promptParty} onChange={(v) => setPromptParty(v as SafetyCheckParty)} options={CHECK_PARTIES} />
              </Field>
              <Field label="Trigger">
                <Select value={promptTrigger} onChange={(v) => setPromptTrigger(v as SafetyCheckTrigger)} options={TRIGGERS} />
              </Field>
              <Field label="Auto-dismiss (s)">
                <input
                  type="number" min={10} max={300} value={autoDismiss}
                  onChange={(e) => setAutoDismiss(Number(e.target.value) || 60)}
                  style={inputStyle}
                />
              </Field>
            </Row>
          </>
        )}

        {mode === 'event' && (
          <>
            <Desc>
              Inserts a `ride_safety_events` row and publishes `safety_alert` to
              <code style={codeStyle}>admin:feed</code>. Will light up the live-map pulse ring and add a card to the queue.
            </Desc>
            <Row>
              <Field label="Event type">
                <Select
                  value={eventType}
                  onChange={(v) => setEventType(v as SafetyEventType)}
                  options={EVENT_TYPES.map((t) => ({ value: t, label: EVENT_LABEL[t] }))}
                />
              </Field>
              <Field label="Severity">
                <Select value={eventSeverity} onChange={(v) => setEventSeverity(v as SafetyEventSeverity)} options={SEVERITIES} />
              </Field>
              <Field label="Party">
                <Select value={eventParty} onChange={(v) => setEventParty(v as SafetyParty)} options={EVENT_PARTIES} />
              </Field>
            </Row>
            <Row>
              <Field label="Lat (optional)">
                <input type="text" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="33.749" style={inputStyle} />
              </Field>
              <Field label="Lng (optional)">
                <input type="text" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-84.388" style={inputStyle} />
              </Field>
            </Row>
          </>
        )}

        {mode === 'distress' && (
          <>
            <Desc>
              Simulates the rider or driver pressing the distress tile. Inserts an event and
              publishes to both <code style={codeStyle}>admin:feed</code> and <code style={codeStyle}>ride:{'{id}'}</code>.
            </Desc>
            <Row>
              <Field label="Party">
                <Select value={distressParty} onChange={(v) => setDistressParty(v as SafetyCheckParty)} options={CHECK_PARTIES} />
              </Field>
              <Field label="Kind">
                <Select value={distressKind} onChange={(v) => setDistressKind(v as DistressKind)} options={DISTRESS_KINDS} />
              </Field>
            </Row>
          </>
        )}

        <button
          onClick={fire}
          disabled={!selectedRide || firing}
          style={{
            marginTop: 18, width: '100%',
            padding: '14px 20px', fontSize: 16, fontWeight: 700,
            borderRadius: 12,
            background: selectedRide ? '#FF6B35' : 'var(--admin-bg)',
            color: selectedRide ? '#080808' : 'var(--admin-text-muted)',
            border: 'none', cursor: selectedRide ? 'pointer' : 'not-allowed',
            opacity: firing ? 0.6 : 1, textTransform: 'uppercase', letterSpacing: 1,
          }}
        >
          {firing ? 'Firing…' : selectedRide ? `Fire ${mode}` : 'Pick a ride first'}
        </button>
      </div>

      {log.length > 0 && (
        <div style={cardStyle}>
          <SectionLabel>Fire log (this session)</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {log.map((l, i) => (
              <div
                key={i}
                style={{
                  padding: 10, borderRadius: 8, fontSize: 12,
                  background: 'var(--admin-bg)',
                  borderLeft: `3px solid ${l.ok ? '#00E676' : '#FF5252'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>{l.summary}</span>
                  <span style={{ color: 'var(--admin-text-muted)' }}>
                    {new Date(l.at).toLocaleTimeString()} · ride {l.rideId.slice(0, 8)}
                  </span>
                </div>
                {l.response != null && (
                  <pre style={{
                    marginTop: 6, padding: 6, background: 'var(--admin-bg-elevated)',
                    borderRadius: 4, fontSize: 11, maxHeight: 100, overflow: 'auto',
                  }}>
                    {typeof l.response === 'string' ? l.response : JSON.stringify(l.response, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
  borderRadius: 12, padding: 16, marginBottom: 14,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13,
  background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
  borderRadius: 8, color: 'var(--admin-text)', fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const codeStyle: React.CSSProperties = {
  fontFamily: 'monospace', fontSize: 11, padding: '1px 6px',
  borderRadius: 4, background: 'var(--admin-bg)',
  color: 'var(--admin-text-secondary)', margin: '0 2px',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
      color: 'var(--admin-text-muted)', marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function Desc({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12, color: 'var(--admin-text-secondary)', lineHeight: 1.5,
      marginBottom: 14, background: 'var(--admin-bg)',
      padding: 10, borderRadius: 8,
    }}>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--admin-text-muted)', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function Select<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[] | Array<{ value: T; label: string }>;
}) {
  const opts = (options as unknown[]).map((o) => (
    typeof o === 'string' ? { value: o as T, label: o } : (o as { value: T; label: string })
  ));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} style={{ ...inputStyle, cursor: 'pointer' }}>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
