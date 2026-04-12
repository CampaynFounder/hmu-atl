'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { AdminSheet } from './admin-sheet';

type DrillType = 'matched' | 'active' | 'completed' | 'cancelled' | 'disputed' | 'revenue' | 'unconverted' | 'drivers' | null;

interface DrillDownSheetProps {
  type: DrillType;
  onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = Record<string, any>;

const TITLES: Record<string, { title: string; subtitle: string }> = {
  matched: { title: 'Matched Rides', subtitle: 'Live rides waiting for driver to go OTW' },
  active: { title: 'Active Rides', subtitle: 'Rides currently in progress (OTW, Here, Confirming, Active)' },
  completed: { title: 'Completed Rides', subtitle: 'All completed and ended rides' },
  cancelled: { title: 'Cancelled Rides', subtitle: 'All cancelled rides' },
  disputed: { title: 'Disputed Rides', subtitle: 'Rides with open or resolved disputes' },
  revenue: { title: 'Revenue Breakdown', subtitle: 'Completed rides sorted by price' },
  unconverted: { title: 'Unconverted Users', subtitle: 'Signed up but no completed ride yet' },
  drivers: { title: 'Active Drivers', subtitle: 'Drivers currently on a ride' },
};

const STATUS_COLORS: Record<string, string> = {
  matched: 'text-blue-400',
  otw: 'text-orange-400',
  here: 'text-yellow-400',
  confirming: 'text-yellow-400',
  active: 'text-emerald-400',
  completed: 'text-emerald-400',
  ended: 'text-neutral-400',
  cancelled: 'text-red-400',
  disputed: 'text-orange-400',
};

function timeAgo(d: string): string {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function DrillDownSheet({ type, onClose }: DrillDownSheetProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const lastType = useRef<DrillType>(null);

  // SMS state for unconverted users
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [smsMessage, setSmsMessage] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<string | null>(null);

  useEffect(() => {
    if (!type) return;
    if (type === lastType.current && items.length > 0) return;
    lastType.current = type;
    setLoading(true);
    setSelected(new Set());
    setSmsMessage('');
    setSmsResult(null);
    fetch(`/api/admin/drilldown?type=${type}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.items) setItems(data.items); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type]);

  useEffect(() => {
    if (!type) { setItems([]); lastType.current = null; setSelected(new Set()); setSmsMessage(''); setSmsResult(null); }
  }, [type]);

  const info = type ? TITLES[type] : { title: '', subtitle: '' };

  // Users with phones for SMS
  const usersWithPhone = type === 'unconverted' ? items.filter(i => i.phone) : [];
  const allSelected = usersWithPhone.length > 0 && usersWithPhone.every(i => selected.has(i.id));

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(usersWithPhone.map(i => i.id)));
    }
  }

  async function sendSmsToSelected() {
    if (!smsMessage.trim() || selected.size === 0) return;
    setSmsSending(true);
    setSmsResult(null);
    try {
      const recipients = items
        .filter(i => selected.has(i.id) && i.phone)
        .map(i => ({ phone: i.phone, name: i.name, userId: i.id }));

      const res = await fetch('/api/admin/marketing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients, message: smsMessage.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSmsResult(`Sent to ${data.sent ?? recipients.length} user${recipients.length !== 1 ? 's' : ''}`);
        setSelected(new Set());
        setSmsMessage('');
      } else {
        setSmsResult(data.error || 'Failed to send');
      }
    } catch {
      setSmsResult('Network error');
    }
    setSmsSending(false);
  }

  return (
    <AdminSheet open={!!type} onClose={onClose} title={info.title} subtitle={info.subtitle}>
      {loading ? (
        <div className="p-6 text-center text-neutral-500 text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-center text-neutral-600 text-sm">No data</div>
      ) : (
        <>
          {/* SMS compose bar for unconverted users */}
          {type === 'unconverted' && usersWithPhone.length > 0 && (
            <div className="sticky top-0 z-10 bg-neutral-950 border-b border-neutral-800 p-4 space-y-3">
              {/* Select all + count */}
              <div className="flex items-center justify-between">
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                    allSelected ? 'bg-emerald-500 border-emerald-500 text-black' : 'border-neutral-600'
                  }`}>
                    {allSelected ? '✓' : ''}
                  </span>
                  Select all ({usersWithPhone.length} with phone)
                </button>
                {selected.size > 0 && (
                  <span className="text-xs text-emerald-400 font-medium">{selected.size} selected</span>
                )}
              </div>

              {/* Message + send */}
              {selected.size > 0 && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={smsMessage}
                    onChange={e => setSmsMessage(e.target.value)}
                    placeholder="Type SMS message..."
                    maxLength={160}
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-neutral-500 placeholder-neutral-600"
                  />
                  <button
                    onClick={sendSmsToSelected}
                    disabled={!smsMessage.trim() || smsSending}
                    className="px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-medium disabled:opacity-50 flex-shrink-0"
                  >
                    {smsSending ? '...' : `Send (${selected.size})`}
                  </button>
                </div>
              )}

              {/* Result */}
              {smsResult && (
                <div className={`text-xs text-center py-1 ${smsResult.includes('Sent') ? 'text-emerald-400' : 'text-red-400'}`}>
                  {smsResult}
                </div>
              )}
            </div>
          )}

          <div className="divide-y divide-neutral-800/50">
            {type === 'unconverted'
              ? items.map((item) => (
                <UserRow
                  key={item.id}
                  item={item}
                  selectable
                  selected={selected.has(item.id)}
                  onToggle={() => toggleSelect(item.id)}
                />
              ))
              : type === 'drivers'
                ? items.map((item, i) => <DriverRow key={i} item={item} />)
                : items.map((item) => <RideRow key={item.id} item={item} type={type!} />)
            }
          </div>
        </>
      )}
    </AdminSheet>
  );
}

function RideRow({ item, type }: { item: Item; type: string }) {
  return (
    <Link href={`/ride/${item.id}`} className="block px-5 py-3 hover:bg-neutral-900/50 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-sm font-semibold text-white truncate">{item.driverName}</span>
          <span className="text-neutral-600 text-xs flex-shrink-0">→</span>
          <span className="text-sm text-neutral-300 truncate">{item.riderName}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.isCash && (
            <span className="text-[9px] font-bold text-yellow-400 bg-yellow-400/15 px-1.5 py-0.5 rounded-full">CASH</span>
          )}
          <span className="text-emerald-400 font-mono font-bold text-sm">{fmt(item.price)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1 text-[11px]">
        {item.refCode && <span className="text-emerald-400 font-mono font-medium">{item.refCode}</span>}
        <span className={STATUS_COLORS[item.status] || 'text-neutral-500'}>{item.status}</span>
        <span className="text-neutral-600">{timeAgo(item.createdAt)}</span>
      </div>
      {(item.pickup || item.dropoff) && (
        <div className="mt-1.5 text-[11px] text-neutral-500 space-y-0.5">
          {item.pickup && <div className="truncate"><span className="text-emerald-600 font-bold">A</span> {item.pickup}</div>}
          {item.dropoff && <div className="truncate"><span className="text-red-600 font-bold">B</span> {item.dropoff}</div>}
        </div>
      )}
      {type === 'revenue' && item.driverPayout != null && (
        <div className="mt-1.5 flex gap-4 text-[10px] text-neutral-500">
          <span>Driver: {fmt(item.driverPayout)}</span>
          <span>Fee: {fmt(item.platformFee ?? 0)}</span>
        </div>
      )}
    </Link>
  );
}

function UserRow({ item, selectable, selected, onToggle }: { item: Item; selectable?: boolean; selected?: boolean; onToggle?: () => void }) {
  return (
    <div className="px-5 py-3 flex items-center gap-3">
      {/* Checkbox */}
      {selectable && item.phone && (
        <button onClick={onToggle} className="flex-shrink-0">
          <span className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${
            selected ? 'bg-emerald-500 border-emerald-500 text-black' : 'border-neutral-600 text-transparent'
          }`}>
            ✓
          </span>
        </button>
      )}
      {selectable && !item.phone && <span className="w-5 flex-shrink-0" />}

      {/* User info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{item.name}</span>
          {item.handle && <span className="text-xs text-neutral-500">@{item.handle}</span>}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-500">
          <span className={item.profileType === 'driver' ? 'text-emerald-400' : 'text-blue-400'}>
            {item.profileType}
          </span>
          {item.phone && <span className="font-mono">{item.phone}</span>}
          {!item.phone && <span className="text-red-400">no phone</span>}
          <span>Joined {timeAgo(item.createdAt)}</span>
        </div>
      </div>

      {/* Individual text button */}
      {item.phone && (
        <a href={`sms:${item.phone}`} className="text-xs text-emerald-400 flex-shrink-0 hover:underline px-2 py-1">
          Text
        </a>
      )}
    </div>
  );
}

function DriverRow({ item }: { item: Item }) {
  return (
    <Link href={`/ride/${item.rideId}`} className="block px-5 py-3 hover:bg-neutral-900/50 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{item.name}</span>
            {item.handle && <span className="text-xs text-neutral-500">@{item.handle}</span>}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px]">
            <span className={STATUS_COLORS[item.status] || 'text-neutral-500'}>{item.status}</span>
            <span className="text-neutral-600">→ {item.riderName}</span>
            {item.refCode && <span className="text-emerald-400 font-mono">{item.refCode}</span>}
          </div>
        </div>
        <span className="text-emerald-400 font-mono font-bold text-sm flex-shrink-0">{fmt(item.price)}</span>
      </div>
    </Link>
  );
}
