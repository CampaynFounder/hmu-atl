'use client';

// Fly-in for the Growth tab stat cards (Riders, Drivers, Active, Pending, Other).
// Scopes to the chart's current period (daily/weekly/monthly) and sorts
// never-texted users first so outreach holdouts float to the top.

import { useEffect, useState } from 'react';
import { AdminSheet } from './admin-sheet';

type Bucket = 'riders' | 'drivers' | 'active' | 'pending' | 'other';
type Period = 'daily' | 'weekly' | 'monthly';

interface UserRow {
  id: string;
  profileType: 'rider' | 'driver';
  displayName: string;
  phone: string | null;
  signupSource: 'hmu_chat' | 'direct' | 'homepage_lead' | null;
  referringDriver: { name: string | null; handle: string | null } | null;
  signedUpAt: string;
  completedRides: number;
  lastTextedAt: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  bucket: Bucket;
  period: Period;
}

const BUCKET_LABEL: Record<Bucket, string> = {
  riders: 'Riders',
  drivers: 'Drivers',
  active: 'Active Users',
  pending: 'Pending Users',
  other: 'Other',
};

const PERIOD_LABEL: Record<Period, string> = {
  daily: 'Today',
  weekly: 'This week',
  monthly: 'This month',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function GrowthDrillInSheet({ open, onClose, bucket, period }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const url = `/api/admin/users/growth/list?bucket=${bucket}&period=${period}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []))
      .catch((err) => console.error('growth drill-in fetch failed:', err))
      .finally(() => setLoading(false));
  }, [open, bucket, period]);

  const untextedCount = users.filter((u) => u.lastTextedAt === null).length;

  return (
    <AdminSheet
      open={open}
      onClose={onClose}
      title={BUCKET_LABEL[bucket]}
      subtitle={`${PERIOD_LABEL[period]} · ${untextedCount} never texted`}
      widthClass="max-w-2xl"
    >
      <div className="p-4">
        {loading && <p className="text-sm text-neutral-500 text-center py-8">Loading…</p>}
        {!loading && users.length === 0 && (
          <p className="text-sm text-neutral-500 text-center py-8">No users in this bucket</p>
        )}
        {!loading && users.length > 0 && (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className={`bg-neutral-900 border rounded-lg p-3 flex items-start justify-between gap-3 ${
                  u.lastTextedAt === null ? 'border-yellow-500/30' : 'border-neutral-800'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white font-medium truncate">{u.displayName}</span>
                    <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                      u.profileType === 'rider'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {u.profileType === 'rider' ? 'R' : 'D'}
                    </span>
                    {u.profileType === 'rider' && (
                      <span className="text-xs text-neutral-500">{u.completedRides} rides</span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">{u.phone || '— no phone —'}</div>
                  {u.profileType === 'rider' && (
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {u.signupSource === 'hmu_chat' && u.referringDriver?.handle
                        ? <>HMU chat · via @{u.referringDriver.handle}</>
                        : u.signupSource === 'hmu_chat'
                        ? 'HMU chat · driver unknown'
                        : 'direct signup'}
                    </div>
                  )}
                  <div className="text-xs text-neutral-500 mt-0.5">signed up {fmtDate(u.signedUpAt)}</div>
                </div>
                <div className="text-right shrink-0">
                  {u.lastTextedAt ? (
                    <span className="text-xs text-green-400">texted {fmtShortDate(u.lastTextedAt)}</span>
                  ) : (
                    <span className="text-xs text-yellow-400 font-medium">not texted</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminSheet>
  );
}
