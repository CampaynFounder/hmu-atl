'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAbly } from '@/hooks/use-ably';
import type { SafetyEventSeverity, SafetyEventType, SafetyParty } from '@/lib/db/types';

interface SafetyEventRow {
  id: string;
  ride_id: string;
  event_type: SafetyEventType;
  severity: SafetyEventSeverity;
  party: SafetyParty;
  detected_at: string;
  location_lat: number | null;
  location_lng: number | null;
  evidence: Record<string, unknown>;
  admin_resolved_at: string | null;
  admin_resolved_by: string | null;
  admin_notes: string | null;
  ride_status: string;
  rider_id: string | null;
  driver_id: string | null;
  rider_name: string | null;
  rider_phone: string | null;
  driver_name: string | null;
  driver_phone: string | null;
}

type Scope = 'open' | 'recent';

const SEVERITY_COLOR: Record<SafetyEventSeverity, string> = {
  critical: '#FF2D2D',
  high: '#FF6B35',
  warn: '#FFB300',
  info: '#3b82f6',
};

const EVENT_LABEL: Record<SafetyEventType, string> = {
  off_route: 'Off route',
  stopped_too_long: 'Stopped too long',
  gps_silence: 'GPS silent',
  wrong_direction: 'Wrong direction',
  speed_extreme: 'Excessive speed',
  check_in_alert: 'Check-in alert',
  distress_admin: 'Distress — admin',
  distress_911: 'Distress — 911',
  distress_contact: 'Distress — contact',
  ignored_streak: 'Ignored check-ins',
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export function SafetyQueue() {
  const [events, setEvents] = useState<SafetyEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>('open');
  const [resolving, setResolving] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/safety?scope=${scope}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { refresh(); }, [refresh]);

  // Live updates: any new safety_alert or resolution triggers a refetch.
  // Cheap — the endpoint returns at most 100 rows.
  const onAdminMsg = useCallback((msg: { name: string }) => {
    if (msg.name === 'safety_alert' || msg.name === 'safety_event_resolved') {
      refresh();
    }
  }, [refresh]);
  useAbly({ channelName: 'admin:feed', onMessage: onAdminMsg });

  const resolve = useCallback(async (id: string) => {
    setResolving(id);
    try {
      const res = await fetch(`/api/admin/safety/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesFor === id ? notes : undefined }),
      });
      if (res.ok) {
        setNotesFor(null);
        setNotes('');
        await refresh();
      }
    } finally {
      setResolving(null);
    }
  }, [notes, notesFor, refresh]);

  return (
    <div style={{ padding: '20px', color: 'var(--admin-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Safety</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setScope('open')}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 999,
              border: '1px solid var(--admin-border)',
              background: scope === 'open' ? '#FF6B35' : 'transparent',
              color: scope === 'open' ? '#080808' : 'var(--admin-text-secondary)',
              cursor: 'pointer',
            }}
          >
            Open
          </button>
          <button
            onClick={() => setScope('recent')}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 999,
              border: '1px solid var(--admin-border)',
              background: scope === 'recent' ? '#3b82f6' : 'transparent',
              color: scope === 'recent' ? '#fff' : 'var(--admin-text-secondary)',
              cursor: 'pointer',
            }}
          >
            Recent (100)
          </button>
        </div>
      </div>

      {loading && events.length === 0 && (
        <div style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>Loading…</div>
      )}
      {!loading && events.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--admin-text-muted)',
          background: 'var(--admin-bg-elevated)', borderRadius: 16, fontSize: 14,
        }}>
          {scope === 'open' ? 'No open safety events. All rides looking clean.' : 'No recent events.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map((e) => {
          const color = SEVERITY_COLOR[e.severity];
          const counterpartyName = e.party === 'rider' ? e.driver_name : e.rider_name;
          const affectedName = e.party === 'rider' ? e.rider_name : e.driver_name;
          return (
            <div
              key={e.id}
              style={{
                background: 'var(--admin-bg-elevated)',
                border: `1px solid ${color}55`,
                borderLeft: `4px solid ${color}`,
                borderRadius: 12, padding: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    background: color, color: '#080808',
                    padding: '3px 10px', borderRadius: 999,
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                  }}>
                    {e.severity}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>
                    {EVENT_LABEL[e.event_type]}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
                    · {timeAgo(e.detected_at)}
                  </span>
                </div>
                <span style={{
                  fontSize: 11, color: 'var(--admin-text-muted)',
                  textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
                }}>
                  Ride {e.ride_id.slice(0, 8)} · {e.ride_status}
                </span>
              </div>

              <div style={{ fontSize: 13, color: 'var(--admin-text-secondary)', marginBottom: 10 }}>
                {e.party === 'system' ? (
                  <>Anomaly detector flagged this ride. Targeting check-in to rider.</>
                ) : (
                  <>
                    <strong>{affectedName || 'Unknown'}</strong> ({e.party})
                    {counterpartyName && <> with <strong>{counterpartyName}</strong></>}
                  </>
                )}
              </div>

              {Object.keys(e.evidence || {}).length > 0 && (
                <div style={{
                  fontFamily: 'monospace', fontSize: 11,
                  background: 'var(--admin-bg)', padding: 8, borderRadius: 6,
                  marginBottom: 10, color: 'var(--admin-text-secondary)',
                  overflow: 'auto',
                }}>
                  {JSON.stringify(e.evidence, null, 2)}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {e.location_lat != null && e.location_lng != null && (
                  <a
                    href={`https://www.google.com/maps?q=${e.location_lat},${e.location_lng}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}
                  >
                    📍 Map
                  </a>
                )}
                {e.rider_phone && (
                  <a
                    href={`tel:${e.rider_phone}`}
                    style={{ fontSize: 12, color: '#00E676', textDecoration: 'none' }}
                  >
                    📞 Rider
                  </a>
                )}
                {e.driver_phone && (
                  <a
                    href={`tel:${e.driver_phone}`}
                    style={{ fontSize: 12, color: '#00E676', textDecoration: 'none' }}
                  >
                    📞 Driver
                  </a>
                )}
                <a
                  href={`/admin/rides/${e.ride_id}`}
                  style={{ fontSize: 12, color: 'var(--admin-text-muted)', textDecoration: 'none' }}
                >
                  Ride detail →
                </a>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  {e.admin_resolved_at ? (
                    <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
                      Resolved {timeAgo(e.admin_resolved_at)}
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => setNotesFor(notesFor === e.id ? null : e.id)}
                        style={{
                          fontSize: 12, padding: '4px 10px', borderRadius: 8,
                          background: 'transparent', border: '1px solid var(--admin-border)',
                          color: 'var(--admin-text-secondary)', cursor: 'pointer',
                        }}
                      >
                        {notesFor === e.id ? 'Cancel' : 'Add notes'}
                      </button>
                      <button
                        onClick={() => resolve(e.id)}
                        disabled={resolving === e.id}
                        style={{
                          fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                          background: '#00E676', color: '#080808', border: 'none', cursor: 'pointer',
                          opacity: resolving === e.id ? 0.6 : 1,
                        }}
                      >
                        Resolve
                      </button>
                    </>
                  )}
                </div>
              </div>

              {notesFor === e.id && (
                <textarea
                  value={notes}
                  onChange={(ev) => setNotes(ev.target.value)}
                  placeholder="What happened / what did you do?"
                  style={{
                    width: '100%', marginTop: 10, padding: 10,
                    background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
                    borderRadius: 8, color: 'var(--admin-text)', fontSize: 13,
                    minHeight: 60, fontFamily: 'inherit',
                  }}
                />
              )}

              {e.admin_notes && (
                <div style={{
                  marginTop: 10, padding: 8, background: 'var(--admin-bg)',
                  borderRadius: 6, fontSize: 12, color: 'var(--admin-text-secondary)',
                }}>
                  {e.admin_notes}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
