'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMarket } from '@/app/admin/components/market-context';

interface RideRequestRow {
  source: 'hmu_post' | 'ride';
  id: string;
  post_type: string;
  status: string;
  areas: string[] | null;
  pickup_area_slug: string | null;
  dropoff_area_slug: string | null;
  price: number | null;
  time_window: Record<string, unknown> | null;
  created_at: string;
  expires_at: string | null;
  user_id: string;
  profile_type: string;
  signup_source: string | null;
  name: string | null;
  phone: string | null;
  admin_texted: boolean;
  last_admin_sms_at: string | null;
  target_driver_id: string | null;
  target_driver_name: string | null;
  target_driver_handle: string | null;
  target_driver_phone: string | null;
  declined_by_driver_id: string | null;
  declined_by_driver_name: string | null;
  declined_by_driver_handle: string | null;
  declined_by_driver_phone: string | null;
}

interface Stats {
  active: number;
  expired: number;
  declined: number;
  rider_seeking: number;
  driver_offering: number;
  direct_booking: number;
}

type StatusFilter = 'all' | 'active' | 'expired' | 'declined_awaiting_rider';
type TypeFilter = 'all' | 'rider_seeking_driver' | 'driver_offering_ride' | 'direct_booking';

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

const DEFAULT_TEMPLATE = "Hey, it's HMU — saw you were looking for a ride. Still need one? Hit me back and I'll get you matched.";

export default function RideRequestsClient() {
  const [rows, setRows] = useState<RideRequestRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [composing, setComposing] = useState<{ row: RideRequestRow; target: 'rider' | 'driver' } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { selectedMarketId } = useMarket();

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('post_type', typeFilter);
      if (selectedMarketId) params.set('marketId', selectedMarketId);
      const res = await fetch(`/api/admin/ride-requests?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json() as { rows: RideRequestRow[]; stats: Stats };
      setRows(data.rows);
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, typeFilter, selectedMarketId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  const statusChips: { id: StatusFilter; label: string; count?: number }[] = useMemo(() => ([
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active', count: stats?.active },
    { id: 'expired', label: 'Expired', count: stats?.expired },
    { id: 'declined_awaiting_rider', label: 'Declined', count: stats?.declined },
  ]), [stats]);

  const typeChips: { id: TypeFilter; label: string; count?: number }[] = useMemo(() => ([
    { id: 'all', label: 'All types' },
    { id: 'rider_seeking_driver', label: 'Rider seeking', count: stats?.rider_seeking },
    { id: 'direct_booking', label: 'Direct booking', count: stats?.direct_booking },
    { id: 'driver_offering_ride', label: 'Driver offering', count: stats?.driver_offering },
  ]), [stats]);

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--admin-text)' }}>Ride Requests</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--admin-text-secondary)' }}>
          Riders who posted and didn&apos;t get matched, plus direct bookings that stalled. Text them to recover the request.
        </p>
      </header>

      <div className="flex gap-2 mb-3 overflow-x-auto">
        {statusChips.map(c => (
          <button
            key={c.id}
            onClick={() => setStatusFilter(c.id)}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-full shrink-0 flex items-center gap-2"
            style={{
              background: statusFilter === c.id ? '#00E676' : 'var(--admin-bg)',
              color: statusFilter === c.id ? '#080808' : 'var(--admin-text-secondary)',
              border: '1px solid var(--admin-border)',
            }}
          >
            {c.label}
            {c.count != null && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{
                  background: statusFilter === c.id ? 'rgba(8,8,8,0.2)' : 'var(--admin-bg-elevated)',
                  color: statusFilter === c.id ? '#080808' : 'var(--admin-text-muted)',
                }}
              >{c.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {typeChips.map(c => (
          <button
            key={c.id}
            onClick={() => setTypeFilter(c.id)}
            className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1.5"
            style={{
              background: typeFilter === c.id ? 'rgba(68,138,255,0.14)' : 'transparent',
              color: typeFilter === c.id ? '#448AFF' : 'var(--admin-text-muted)',
              border: `1px solid ${typeFilter === c.id ? '#448AFF' : 'var(--admin-border)'}`,
            }}
          >
            {c.label}
            {c.count != null && <span>{c.count}</span>}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm" style={{ color: 'var(--admin-text-muted)' }}>Loading…</p>}

      {!loading && rows.length === 0 && (
        <div className="text-center py-12 rounded-xl" style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}>
          <p className="text-sm" style={{ color: 'var(--admin-text-secondary)' }}>
            Nothing matches these filters.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {rows.map(r => {
          const areas = Array.isArray(r.areas) ? r.areas.filter(Boolean) : [];
          const routeLabel = r.pickup_area_slug || r.dropoff_area_slug
            ? `${r.pickup_area_slug ?? '?'} → ${r.dropoff_area_slug ?? '?'}`
            : areas.join(', ');
          return (
            <div
              key={r.id}
              className="rounded-lg p-4"
              style={{
                background: 'var(--admin-bg)',
                border: r.status === 'active' ? '1px solid rgba(0,230,118,0.25)' : '1px solid var(--admin-border)',
              }}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-bold" style={{ color: 'var(--admin-text)' }}>
                      {r.name || 'Unnamed'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--admin-text-secondary)' }}>
                      {r.phone}
                    </span>
                    <StatusPill status={r.status} />
                    <TypePill type={r.post_type} />
                    {r.admin_texted && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(68,138,255,0.12)', color: '#448AFF' }}>
                        already texted
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-xs" style={{ color: 'var(--admin-text-secondary)' }}>
                    {routeLabel && <span>📍 {routeLabel}</span>}
                    {r.price != null && <span>💵 ${Number(r.price)}</span>}
                    <span>🕓 {ageLabel(r.created_at)}</span>
                    {r.signup_source && <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--admin-text-muted)' }}>{r.signup_source}</span>}
                    {r.last_admin_sms_at && (
                      <span className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>
                        last reach: {ageLabel(r.last_admin_sms_at)}
                      </span>
                    )}
                  </div>
                  {(r.target_driver_id || r.declined_by_driver_id) && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]" style={{ color: 'var(--admin-text-secondary)' }}>
                      {r.target_driver_id && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded"
                          style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.25)' }}
                        >
                          <span style={{ color: '#00E676' }}>→ tried to book</span>
                          <Link href={`/admin/users/${r.target_driver_id}`} className="font-semibold" style={{ color: 'var(--admin-text)' }}>
                            {r.target_driver_name || r.target_driver_handle || 'driver'}
                          </Link>
                          {r.target_driver_handle && <code className="text-[9px]" style={{ color: 'var(--admin-text-muted)' }}>@{r.target_driver_handle}</code>}
                          {r.target_driver_phone && <span style={{ color: 'var(--admin-text-muted)' }}>· {r.target_driver_phone}</span>}
                        </span>
                      )}
                      {r.declined_by_driver_id && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded"
                          style={{ background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.25)' }}
                        >
                          <span style={{ color: '#FF5252' }}>✕ declined by</span>
                          <Link href={`/admin/users/${r.declined_by_driver_id}`} className="font-semibold" style={{ color: 'var(--admin-text)' }}>
                            {r.declined_by_driver_name || r.declined_by_driver_handle || 'driver'}
                          </Link>
                          {r.declined_by_driver_handle && <code className="text-[9px]" style={{ color: 'var(--admin-text-muted)' }}>@{r.declined_by_driver_handle}</code>}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => setComposing({ row: r, target: 'rider' })}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg"
                    style={{ background: '#00E676', color: '#080808' }}
                  >
                    Text rider
                  </button>
                  {(r.target_driver_id || r.declined_by_driver_id) && (
                    <button
                      onClick={() => setComposing({ row: r, target: 'driver' })}
                      className="text-[11px] font-semibold px-3 py-1 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}
                    >
                      Text driver
                    </button>
                  )}
                  <Link
                    href={`/admin/users/${r.user_id}`}
                    className="text-[10px] text-center px-3 py-1 rounded"
                    style={{ color: 'var(--admin-text-muted)' }}
                  >
                    Open profile
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {composing && (
        <ComposeModal
          row={composing.row}
          target={composing.target}
          onClose={() => setComposing(null)}
          onSent={(msg) => {
            showToast(msg);
            setComposing(null);
            load();
          }}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-50"
          style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    active: { bg: 'rgba(0,230,118,0.14)', fg: '#00E676' },
    expired: { bg: 'rgba(255,255,255,0.06)', fg: 'var(--admin-text-muted)' },
    declined_awaiting_rider: { bg: 'rgba(255,179,0,0.14)', fg: '#FFB300' },
  };
  const c = colors[status] || colors.expired;
  return (
    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: c.bg, color: c.fg }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function TypePill({ type }: { type: string }) {
  const label =
    type === 'rider_seeking_driver' ? 'RIDER SEEK' :
    type === 'driver_offering_ride' ? 'DRIVER OFFER' :
    type === 'direct_booking' ? 'DIRECT' :
    type.toUpperCase();
  return (
    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--admin-bg-elevated)', color: 'var(--admin-text-muted)' }}>
      {label}
    </span>
  );
}

interface ComposeModalProps {
  row: RideRequestRow;
  target: 'rider' | 'driver';
  onClose: () => void;
  onSent: (msg: string) => void;
}

function ComposeModal({ row, target, onClose, onSent }: ComposeModalProps) {
  // When texting a driver: prefer the declined-by driver (more actionable —
  // "why'd you pass?") over the targeted driver for the phone/name.
  const driverId = row.declined_by_driver_id ?? row.target_driver_id;
  const driverName = row.declined_by_driver_name ?? row.target_driver_name;
  const driverPhone = row.declined_by_driver_phone ?? row.target_driver_phone;
  const driverContext = row.declined_by_driver_id ? 'declined' : 'targeted';

  const recipient = target === 'rider'
    ? { phone: row.phone, name: row.name, userId: row.user_id, profileType: row.profile_type }
    : { phone: driverPhone, name: driverName, userId: driverId, profileType: 'driver' };

  const riderName = row.name || 'the rider';
  const driverDisplayName = driverName || 'this driver';

  const templates = target === 'rider'
    ? [
        { label: 'Still need a ride?', text: DEFAULT_TEMPLATE },
        { label: 'Try again', text: `Hey ${row.name || 'there'}, it's HMU. Your ride request didn't get picked up last time — want me to reach out to a driver directly?` },
        { label: 'Here to help', text: `Hey ${row.name || 'there'}, HMU team here. Saw your ride post — what went wrong? Happy to hook you up manually.` },
      ]
    : [
        {
          label: driverContext === 'declined' ? 'Why pass?' : 'Check in',
          text: driverContext === 'declined'
            ? `Hey ${driverDisplayName}, it's HMU — noticed you passed on ${riderName}'s ride. Anything we can do different next time?`
            : `Hey ${driverDisplayName}, it's HMU — ${riderName} tried to book you earlier. You good to run it?`,
        },
        {
          label: 'Offer match',
          text: `Hey ${driverDisplayName}, HMU team. ${riderName} is still looking for a ride. Want me to send them your way?`,
        },
        {
          label: 'Heads up',
          text: `Yo ${driverDisplayName}, quick check-in from HMU — you around to take rides right now? Got a rider lined up.`,
        },
      ];

  const [message, setMessage] = useState(templates[0].text);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!recipient.phone) { onSent('No phone on file'); return; }
    if (message.trim().length === 0) return;
    if (message.length > 160) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/marketing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{ phone: recipient.phone, name: recipient.name, userId: recipient.userId ?? undefined }],
          message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onSent(data.error || 'Send failed');
        return;
      }
      onSent(data.sent ? `Sent to ${recipient.name || recipient.phone}` : 'Send failed');
    } catch {
      onSent('Network error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5"
        style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: target === 'rider' ? '#00E676' : '#448AFF' }}>
              Texting {target}{target === 'driver' ? ` (${driverContext})` : ''}
            </p>
            <h2 className="text-base font-bold" style={{ color: 'var(--admin-text)' }}>
              {recipient.name || recipient.phone || 'Unknown'}
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>
              {recipient.phone || 'no phone on file'} · {recipient.profileType}
            </p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
        </div>

        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 text-sm rounded-lg"
          style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)', outline: 'none' }}
        />
        <p className="text-[10px] mt-1 text-right" style={{ color: message.length > 160 ? '#FF5252' : 'var(--admin-text-muted)' }}>
          {message.length} / 160 chars
        </p>

        <div className="flex gap-2 mt-2 flex-wrap">
          {templates.map(t => (
            <button
              key={t.label}
              onClick={() => setMessage(t.text)}
              className="text-[10px] px-2 py-1 rounded"
              style={{ background: 'var(--admin-bg)', color: 'var(--admin-text-secondary)', border: '1px solid var(--admin-border)' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={sending} className="text-xs text-white/60 px-3 py-2">Cancel</button>
          <button
            onClick={send}
            disabled={sending || !message.trim() || message.length > 160 || !recipient.phone}
            className="text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
            style={{ background: '#00E676', color: '#080808' }}
          >
            {sending ? 'Sending…' : 'Send SMS'}
          </button>
        </div>
      </div>
    </div>
  );
}
