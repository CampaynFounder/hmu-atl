'use client';

import { useState } from 'react';
import type { SafetyEventSeverity, SafetyEventType, SafetyParty } from '@/lib/db/types';

export interface SafetyEventRow {
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

export const SEVERITY_COLOR: Record<SafetyEventSeverity, string> = {
  critical: '#FF2D2D',
  high: '#FF6B35',
  warn: '#FFB300',
  info: '#3b82f6',
};

export const EVENT_LABEL: Record<SafetyEventType, string> = {
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

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

interface CardProps {
  event: SafetyEventRow;
  onResolved?: (eventId: string) => void;
}

// Single source of truth for rendering a safety event — used on the live queue,
// the archive, and the test harness log. Handles resolution flow internally.
export default function SafetyEventCard({ event: e, onResolved }: CardProps) {
  const [resolving, setResolving] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');

  const color = SEVERITY_COLOR[e.severity];
  const isTest = (e.evidence as Record<string, unknown>)?.source === 'admin_test';
  const counterpartyName = e.party === 'rider' ? e.driver_name : e.rider_name;
  const affectedName = e.party === 'rider' ? e.rider_name : e.driver_name;
  const resolved = !!e.admin_resolved_at;

  async function resolve() {
    setResolving(true);
    try {
      const res = await fetch(`/api/admin/safety/${e.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: showNotes ? notes : undefined }),
      });
      if (res.ok) onResolved?.(e.id);
    } finally {
      setResolving(false);
    }
  }

  return (
    <div
      style={{
        background: 'var(--admin-bg-elevated)',
        border: `1px solid ${color}55`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 12, padding: 14,
        opacity: resolved ? 0.7 : 1,
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
          {isTest && (
            <span style={{
              background: 'rgba(168,85,247,0.18)', color: '#C084FC',
              padding: '2px 8px', borderRadius: 6,
              fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            }}>
              TEST
            </span>
          )}
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
          <>Anomaly detector flagged this ride.</>
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
          overflow: 'auto', maxHeight: 160,
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
          <a href={`tel:${e.rider_phone}`} style={{ fontSize: 12, color: '#00E676', textDecoration: 'none' }}>
            📞 Rider
          </a>
        )}
        {e.driver_phone && (
          <a href={`tel:${e.driver_phone}`} style={{ fontSize: 12, color: '#00E676', textDecoration: 'none' }}>
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
          {resolved ? (
            <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
              Resolved {timeAgo(e.admin_resolved_at!)}
            </span>
          ) : (
            <>
              <button
                onClick={() => setShowNotes((s) => !s)}
                style={{
                  fontSize: 12, padding: '4px 10px', borderRadius: 8,
                  background: 'transparent', border: '1px solid var(--admin-border)',
                  color: 'var(--admin-text-secondary)', cursor: 'pointer',
                }}
              >
                {showNotes ? 'Cancel' : 'Add notes'}
              </button>
              <button
                onClick={resolve}
                disabled={resolving}
                style={{
                  fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                  background: '#00E676', color: '#080808', border: 'none', cursor: 'pointer',
                  opacity: resolving ? 0.6 : 1,
                }}
              >
                Resolve
              </button>
            </>
          )}
        </div>
      </div>

      {showNotes && (
        <textarea
          value={notes}
          onChange={(ev) => setNotes(ev.target.value)}
          placeholder="What happened / what did you do?"
          style={{
            width: '100%', marginTop: 10, padding: 10,
            background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
            borderRadius: 8, color: 'var(--admin-text)', fontSize: 13,
            minHeight: 60, fontFamily: 'inherit', boxSizing: 'border-box',
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
}
