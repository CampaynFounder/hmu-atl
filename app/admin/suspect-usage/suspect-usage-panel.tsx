'use client';

// Read-only rollup of users whose behavior tripped a rate limit or self-booking
// guard in the last N days. Click a row to open the user's profile in Admin.

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SuspectUser {
  userId: string;
  displayName: string | null;
  phone: string | null;
  profileType: string;
  totalEvents: number;
  lastEventAt: string;
  byType: Record<string, number>;
}

const EVENT_LABELS: Record<string, string> = {
  chat_message_rate: 'Chat msg rate',
  chat_open_rate: 'Chat open rate',
  booking_rate: 'Booking rate',
  same_driver_booking_rate: 'Same driver',
  self_booking_attempt: 'Self-booking',
  driver_booking_self_via_ui: 'Driver chat self',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SuspectUsagePanel() {
  const [users, setUsers] = useState<SuspectUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/suspect-usage?days=${days}`)
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []))
      .catch((err) => console.error('suspect-usage fetch failed:', err))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Suspect Usage</h1>
        <div className="flex bg-neutral-800 rounded-lg overflow-hidden">
          {[1, 7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                days === d ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Users whose behavior tripped a rate limit or self-booking guard in the last {days} day{days === 1 ? '' : 's'}.
        Sorted by most recent event.
      </p>

      {loading && <p className="text-sm text-neutral-500 py-8 text-center">Loading…</p>}

      {!loading && users.length === 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
          <p className="text-sm text-neutral-500">No suspect usage in this window — 🎉 clean house.</p>
        </div>
      )}

      {!loading && users.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950 border-b border-neutral-800">
              <tr className="text-left text-[10px] uppercase text-neutral-500 tracking-wider">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Events</th>
                <th className="px-4 py-3">Breakdown</th>
                <th className="px-4 py-3">Last hit</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.userId}
                  className="border-b border-neutral-800 last:border-b-0 hover:bg-neutral-950/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users?id=${u.userId}`}
                      className="text-white font-medium hover:text-[#00E676]"
                    >
                      {u.displayName || '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{u.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                      u.profileType === 'rider'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {u.profileType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white">{u.totalEvents}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(u.byType).map(([type, count]) => (
                        <span
                          key={type}
                          className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded"
                          title={type}
                        >
                          {EVENT_LABELS[type] || type}: {count}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-400 text-xs">{fmtDate(u.lastEventAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
