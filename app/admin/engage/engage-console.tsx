'use client';

// Engage console — one mobile-first surface for reaching out to the people who
// matter right now:
//   • Requests — riders who asked for a ride (direct + blast + broadcast)
//   • Missed   — drivers who were offered a ride and didn't take it
//   • Active   — riders & drivers who logged in today / this week
// Every row is one tap to open an SMS thread (ConversationSheet), which reuses
// the existing admin messaging backend. Market scoping flows from the sidebar's
// market selector via useMarket().

import { useCallback, useEffect, useState } from 'react';
import { useMarket } from '@/app/admin/components/market-context';
import { ConversationSheet, type ConversationTarget } from './conversation-sheet';

type Tab = 'requests' | 'missed' | 'active';

interface RequestRow {
  request_kind: 'direct' | 'blast' | 'broadcast';
  id: string;
  post_type: string;
  status: string;
  price: number | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  pickup_area_slug: string | null;
  dropoff_area_slug: string | null;
  scheduled_for: string | null;
  created_at: string;
  user_id: string;
  rider_name: string | null;
  rider_handle: string | null;
  rider_phone: string | null;
  rider_admin_texted: boolean;
  rider_last_admin_sms_at: string | null;
  target_driver_id: string | null;
  target_driver_name: string | null;
  target_driver_handle: string | null;
  target_driver_phone: string | null;
  declined_by_driver_id: string | null;
  declined_by_driver_name: string | null;
  declined_by_driver_handle: string | null;
  declined_by_driver_phone: string | null;
}

interface MissedRow {
  request_kind: 'blast' | 'direct';
  request_id: string;
  price: number | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  requested_at: string;
  miss_reason: 'no_response' | 'expired' | 'declined';
  request_status: string;
  driver_id: string;
  driver_name: string | null;
  driver_handle: string | null;
  driver_phone: string | null;
  driver_admin_texted: boolean;
  driver_last_admin_sms_at: string | null;
  rider_id: string | null;
  rider_name: string | null;
  rider_handle: string | null;
  rider_phone: string | null;
}

interface ActiveRow {
  id: string;
  profile_type: string;
  name: string | null;
  handle: string | null;
  phone: string | null;
  last_sign_in_at: string | null;
  sign_in_count: number | null;
  admin_texted: boolean;
  last_admin_sms_at: string | null;
}

interface ActiveStats { today_riders: number; today_drivers: number; week_riders: number; week_drivers: number; }

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function money(p: number | null): string {
  if (p == null) return '—';
  return `$${Number(p).toFixed(0)}`;
}

const KIND_COLOR: Record<string, string> = {
  direct: '#448AFF', blast: '#00E676', broadcast: '#FFB300',
};
const REASON_LABEL: Record<string, string> = {
  no_response: 'No response', expired: 'Timed out', declined: 'Declined',
};
const REASON_COLOR: Record<string, string> = {
  no_response: '#FFB300', expired: '#9E9E9E', declined: '#FF5252',
};

function Chip({ label, color, active, onClick }: { label: string; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] px-2.5 py-1 rounded-full border capitalize whitespace-nowrap transition-colors"
      style={{
        background: active ? `${color || '#00E676'}22` : 'var(--admin-bg)',
        borderColor: active ? `${color || '#00E676'}55` : 'var(--admin-border)',
        color: active ? (color || '#00E676') : 'var(--admin-text-muted)',
      }}
    >
      {label}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: '#141414', border: '1px solid var(--admin-border)' }}>
      {children}
    </div>
  );
}

function TextButton({ label, texted, lastAt, disabled, onClick }: {
  label: string; texted?: boolean; lastAt?: string | null; disabled?: boolean; onClick: () => void;
}) {
  // Disabled (no phone on file) stays fully opaque and clearly visible — a faded
  // chip read as "missing". We show a muted grey chip with "· no #" instead.
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
      style={disabled
        ? { background: 'var(--admin-bg-active)', color: 'var(--admin-text-muted)', cursor: 'not-allowed' }
        : { background: 'rgba(0,230,118,0.15)', color: '#00E676' }}
      title={disabled ? 'No phone number on file for this person' : texted ? `Last texted ${timeAgo(lastAt ?? null)}` : undefined}
    >
      <span>💬</span>{label}
      {disabled ? <span className="opacity-80">· no #</span> : texted ? <span style={{ color: 'var(--admin-text-muted)' }}>·✓</span> : null}
    </button>
  );
}

const Route = ({ pickup, dropoff }: { pickup: string | null; dropoff: string | null }) => (
  <div className="text-[13px] leading-snug" style={{ color: 'var(--admin-text-secondary)' }}>
    <span style={{ color: 'var(--admin-text)' }}>{pickup || 'Pickup TBD'}</span>
    <span style={{ color: 'var(--admin-text-muted)' }}> → </span>
    <span style={{ color: 'var(--admin-text)' }}>{dropoff || 'Dropoff TBD'}</span>
  </div>
);

export function EngageConsole() {
  const { selectedMarketId } = useMarket();
  const mq = selectedMarketId ? `&marketId=${selectedMarketId}` : '';

  const [tab, setTab] = useState<Tab>('requests');
  const [search, setSearch] = useState('');
  const [convo, setConvo] = useState<ConversationTarget | null>(null);

  // Requests tab
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [reqKind, setReqKind] = useState<'all' | 'direct' | 'blast' | 'broadcast'>('all');
  const [reqStatus, setReqStatus] = useState<'all' | 'active' | 'expired'>('active');

  // Missed tab
  const [missed, setMissed] = useState<MissedRow[]>([]);
  const [missReason, setMissReason] = useState<'all' | 'no_response' | 'expired' | 'declined'>('all');

  // Active tab
  const [active, setActive] = useState<ActiveRow[]>([]);
  const [activeStats, setActiveStats] = useState<ActiveStats | null>(null);
  const [activeRange, setActiveRange] = useState<'today' | 'week'>('today');
  const [activeType, setActiveType] = useState<'all' | 'rider' | 'driver'>('all');

  const [loading, setLoading] = useState(true);

  const qParam = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';

  // Loading is toggled true from the user-event handlers below (tab/filter
  // clicks) — never synchronously inside the effect — so the only setState in
  // the effect path happens post-await. Matches the Messages page pattern.
  const fetchRequests = useCallback(async () => {
    const sp = reqStatus === 'all' ? '' : `&status=${reqStatus === 'expired' ? 'expired' : 'active'}`;
    const kp = reqKind === 'all' ? '' : `&kind=${reqKind}`;
    try {
      const res = await fetch(`/api/admin/engage/requests?1=1${sp}${kp}${mq}${qParam}`);
      if (res.ok) setRequests((await res.json()).rows ?? []);
    } catch { /* noop */ }
    setLoading(false);
  }, [reqStatus, reqKind, mq, qParam]);

  const fetchMissed = useCallback(async () => {
    const rp = missReason === 'all' ? '' : `&reason=${missReason}`;
    try {
      const res = await fetch(`/api/admin/engage/missed-drivers?1=1${rp}${mq}${qParam}`);
      if (res.ok) setMissed((await res.json()).rows ?? []);
    } catch { /* noop */ }
    setLoading(false);
  }, [missReason, mq, qParam]);

  const fetchActive = useCallback(async () => {
    const tp = activeType === 'all' ? '' : `&type=${activeType}`;
    try {
      const res = await fetch(`/api/admin/engage/active-users?range=${activeRange}${tp}${mq}${qParam}`);
      if (res.ok) {
        const data = await res.json();
        setActive(data.rows ?? []);
        setActiveStats(data.stats ?? null);
      }
    } catch { /* noop */ }
    setLoading(false);
  }, [activeRange, activeType, mq, qParam]);

  // Show the spinner on user-initiated tab/filter changes. Search keystrokes
  // intentionally skip this so the list doesn't flash while typing.
  const withSpin = (fn: () => void) => () => { setLoading(true); fn(); };

  useEffect(() => {
    // The fetchers only setState after an await (loading flips false post-fetch;
    // the spinner is turned ON in the click handlers via withSpin), so this is
    // not a synchronous cascading render — same shape as the Messages page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === 'requests') fetchRequests();
    else if (tab === 'missed') fetchMissed();
    else fetchActive();
  }, [tab, fetchRequests, fetchMissed, fetchActive]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'requests', label: 'Requests' },
    { key: 'missed', label: 'Missed' },
    { key: 'active', label: 'Active' },
  ];

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold" style={{ color: 'var(--admin-text)' }}>Engage</h1>
      </div>
      <p className="text-[13px] mb-4" style={{ color: 'var(--admin-text-muted)' }}>
        Reach out to riders who requested rides and drivers who missed them. Tap any row to text.
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl mb-3" style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={withSpin(() => setTab(t.key))}
            className="flex-1 text-[13px] font-semibold py-2 rounded-lg transition-colors"
            style={{
              background: tab === t.key ? 'var(--admin-bg-active)' : 'transparent',
              color: tab === t.key ? 'var(--admin-text)' : 'var(--admin-text-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={tab === 'requests' ? 'Search rider, handle, address…' : tab === 'missed' ? 'Search driver, handle, phone…' : 'Search name, handle, phone…'}
        className="w-full rounded-full px-4 py-2.5 text-sm mb-3 focus:outline-none"
        style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
      />

      {/* Filter chips */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {tab === 'requests' && (
          <>
            {(['all', 'direct', 'blast', 'broadcast'] as const).map((k) => (
              <Chip key={k} label={k} color={KIND_COLOR[k]} active={reqKind === k} onClick={withSpin(() => setReqKind(k))} />
            ))}
            <span className="w-px shrink-0 mx-1" style={{ background: 'var(--admin-border)' }} />
            {(['active', 'expired', 'all'] as const).map((s) => (
              <Chip key={s} label={s} active={reqStatus === s} onClick={withSpin(() => setReqStatus(s))} />
            ))}
          </>
        )}
        {tab === 'missed' && (['all', 'no_response', 'expired', 'declined'] as const).map((r) => (
          <Chip key={r} label={r === 'all' ? 'all' : REASON_LABEL[r]} color={REASON_COLOR[r]} active={missReason === r} onClick={withSpin(() => setMissReason(r))} />
        ))}
        {tab === 'active' && (
          <>
            {(['today', 'week'] as const).map((r) => (
              <Chip key={r} label={r === 'today' ? 'Today' : 'This week'} active={activeRange === r} onClick={withSpin(() => setActiveRange(r))} />
            ))}
            <span className="w-px shrink-0 mx-1" style={{ background: 'var(--admin-border)' }} />
            {(['all', 'rider', 'driver'] as const).map((t) => (
              <Chip key={t} label={t} active={activeType === t} onClick={withSpin(() => setActiveType(t))} />
            ))}
          </>
        )}
      </div>

      {tab === 'active' && activeStats && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { label: 'Today', riders: activeStats.today_riders, drivers: activeStats.today_drivers },
            { label: 'This week', riders: activeStats.week_riders, drivers: activeStats.week_drivers },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3" style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}>
              <div className="text-[10px] font-bold tracking-[1.5px] uppercase mb-1" style={{ color: 'var(--admin-text-muted)' }}>{s.label}</div>
              <div className="flex items-baseline gap-3">
                <span className="text-lg font-bold" style={{ color: '#00E676' }}>{s.riders}<span className="text-[11px] font-normal" style={{ color: 'var(--admin-text-muted)' }}> riders</span></span>
                <span className="text-lg font-bold" style={{ color: '#448AFF' }}>{s.drivers}<span className="text-[11px] font-normal" style={{ color: 'var(--admin-text-muted)' }}> drivers</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lists */}
      {loading ? (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--admin-text-muted)' }}>Loading…</div>
      ) : (
        <div className="space-y-2.5">
          {/* REQUESTS */}
          {tab === 'requests' && (requests.length === 0 ? (
            <Empty label="No ride requests match." />
          ) : requests.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--admin-text)' }}>
                      {r.rider_name || r.rider_handle || 'Rider'}
                    </span>
                    {r.rider_handle && <span className="text-[11px] font-mono truncate" style={{ color: 'var(--admin-text-muted)' }}>@{r.rider_handle}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: `${KIND_COLOR[r.request_kind]}22`, color: KIND_COLOR[r.request_kind] }}>{r.request_kind}</span>
                    <span className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>{r.status}</span>
                    <span className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>· {timeAgo(r.created_at)}</span>
                  </div>
                </div>
                <span className="text-base font-bold shrink-0" style={{ color: '#00E676' }}>{money(r.price)}</span>
              </div>
              <Route pickup={r.pickup_address || r.pickup_area_slug} dropoff={r.dropoff_address || r.dropoff_area_slug} />
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <TextButton
                  label="Text rider"
                  texted={r.rider_admin_texted}
                  lastAt={r.rider_last_admin_sms_at}
                  disabled={!r.rider_phone}
                  onClick={() => setConvo({ phone: r.rider_phone!, name: r.rider_name, userType: 'rider', userId: r.user_id, context: `${r.request_kind} request · ${money(r.price)}` })}
                />
                {r.target_driver_id && r.target_driver_phone && (
                  <TextButton
                    label={`Text ${r.target_driver_name || 'driver'}`}
                    onClick={() => setConvo({ phone: r.target_driver_phone!, name: r.target_driver_name, userType: 'driver', userId: r.target_driver_id, context: `Requested directly · ${money(r.price)}` })}
                  />
                )}
                {r.declined_by_driver_id && r.declined_by_driver_phone && r.declined_by_driver_id !== r.target_driver_id && (
                  <TextButton
                    label={`Text ${r.declined_by_driver_name || 'decliner'}`}
                    onClick={() => setConvo({ phone: r.declined_by_driver_phone!, name: r.declined_by_driver_name, userType: 'driver', userId: r.declined_by_driver_id, context: `Declined this request` })}
                  />
                )}
              </div>
            </Card>
          )))}

          {/* MISSED */}
          {tab === 'missed' && (missed.length === 0 ? (
            <Empty label="No missed requests match." />
          ) : missed.map((m) => (
            <Card key={`${m.request_id}-${m.driver_id}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--admin-text)' }}>
                      {m.driver_name || m.driver_handle || 'Driver'}
                    </span>
                    {m.driver_handle && <span className="text-[11px] font-mono truncate" style={{ color: 'var(--admin-text-muted)' }}>@{m.driver_handle}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: `${REASON_COLOR[m.miss_reason]}22`, color: REASON_COLOR[m.miss_reason] }}>{REASON_LABEL[m.miss_reason]}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: `${KIND_COLOR[m.request_kind]}22`, color: KIND_COLOR[m.request_kind] }}>{m.request_kind}</span>
                    <span className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>· {timeAgo(m.requested_at)}</span>
                  </div>
                </div>
                <span className="text-base font-bold shrink-0" style={{ color: '#00E676' }}>{money(m.price)}</span>
              </div>
              <Route pickup={m.pickup_address} dropoff={m.dropoff_address} />
              {m.rider_name && (
                <div className="text-[11px] mt-1" style={{ color: 'var(--admin-text-muted)' }}>Rider: {m.rider_name}{m.rider_handle ? ` · @${m.rider_handle}` : ''}</div>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <TextButton
                  label="Text driver"
                  texted={m.driver_admin_texted}
                  lastAt={m.driver_last_admin_sms_at}
                  disabled={!m.driver_phone}
                  onClick={() => setConvo({ phone: m.driver_phone!, name: m.driver_name, userType: 'driver', userId: m.driver_id, context: `Missed a ${money(m.price)} ride · ${REASON_LABEL[m.miss_reason]}` })}
                />
                <TextButton
                  label="Text rider"
                  disabled={!m.rider_phone}
                  onClick={() => setConvo({ phone: m.rider_phone!, name: m.rider_name, userType: 'rider', userId: m.rider_id ?? undefined, context: `Their ${money(m.price)} request went unanswered` })}
                />
              </div>
            </Card>
          )))}

          {/* ACTIVE */}
          {tab === 'active' && (active.length === 0 ? (
            <Empty label="No one logged in for this window." />
          ) : active.map((u) => (
            <Card key={u.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ background: u.profile_type === 'driver' ? 'rgba(68,138,255,0.18)' : 'rgba(0,230,118,0.18)', color: u.profile_type === 'driver' ? '#448AFF' : '#00E676' }}>
                    {(u.name || u.handle || '#').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--admin-text)' }}>{u.name || u.handle || 'User'}</span>
                      <span className="text-[10px] font-bold uppercase" style={{ color: u.profile_type === 'driver' ? '#448AFF' : '#00E676' }}>{u.profile_type}</span>
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>
                      Active {timeAgo(u.last_sign_in_at)} · {u.sign_in_count ?? 0} logins
                    </div>
                  </div>
                </div>
                <TextButton
                  label="Text"
                  texted={u.admin_texted}
                  lastAt={u.last_admin_sms_at}
                  disabled={!u.phone}
                  onClick={() => setConvo({ phone: u.phone!, name: u.name, userType: u.profile_type, userId: u.id, context: `Active ${timeAgo(u.last_sign_in_at)}` })}
                />
              </div>
            </Card>
          )))}
        </div>
      )}

      {convo && (
        <ConversationSheet
          target={convo}
          onClose={() => setConvo(null)}
          onSent={() => { if (tab === 'requests') fetchRequests(); else if (tab === 'missed') fetchMissed(); else fetchActive(); }}
        />
      )}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-sm rounded-xl" style={{ color: 'var(--admin-text-muted)', background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}>
      {label}
    </div>
  );
}
