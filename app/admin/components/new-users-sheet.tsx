'use client';

// Fly-in drill-in for Live Ops "New Users" and "Incomplete Signups" containers.
// Opening fetches the user list via POST /api/admin/users/new-since, which also
// resets the admin_last_seen_at cursor when bucket = 'new_users'.

import { useEffect, useState } from 'react';
import { AdminSheet } from './admin-sheet';

type Bucket = 'new_users' | 'incomplete';

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
  textedCount: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  bucket: Bucket;
  onResetCursor?: () => void;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function NewUsersSheet({ open, onClose, bucket, onResetCursor }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'riders' | 'drivers'>('riders');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/admin/users/new-since', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket }),
    })
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users || []);
        if (bucket === 'new_users') onResetCursor?.();
      })
      .catch((err) => console.error('new-since fetch failed:', err))
      .finally(() => setLoading(false));
  }, [open, bucket, onResetCursor]);

  const riders = users.filter((u) => u.profileType === 'rider');
  const drivers = users.filter((u) => u.profileType === 'driver');
  const visible = tab === 'riders' ? riders : drivers;

  const title = bucket === 'new_users' ? 'New Users' : 'Incomplete Signups';
  const subtitle = bucket === 'new_users'
    ? 'Users who completed a profile since your last visit'
    : 'Verified phone, abandoned onboarding — outreach queue';

  return (
    <AdminSheet open={open} onClose={onClose} title={title} subtitle={subtitle} widthClass="max-w-2xl">
      {/* Tabs */}
      <div className="flex border-b border-neutral-800">
        <button
          onClick={() => setTab('riders')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            tab === 'riders' ? 'text-white border-b-2 border-green-500' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          Riders ({riders.length})
        </button>
        <button
          onClick={() => setTab('drivers')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            tab === 'drivers' ? 'text-white border-b-2 border-blue-500' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          Drivers ({drivers.length})
        </button>
      </div>

      {/* List */}
      <div className="p-4">
        {loading && <p className="text-sm text-neutral-500 text-center py-8">Loading…</p>}
        {!loading && visible.length === 0 && (
          <p className="text-sm text-neutral-500 text-center py-8">No {tab} in this bucket</p>
        )}
        {!loading && visible.length > 0 && (
          <div className="space-y-2">
            {visible.map((u) => (
              <div
                key={u.id}
                className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white font-medium truncate">{u.displayName}</span>
                    {u.profileType === 'rider' && bucket === 'new_users' && (
                      <span className="text-xs text-neutral-500">· {u.completedRides} rides</span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">{u.phone || '— no phone —'}</div>
                  {u.profileType === 'rider' && (
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {u.signupSource === 'hmu_chat' && u.referringDriver
                        ? <>via @{u.referringDriver.handle || '?'}</>
                        : u.signupSource === 'hmu_chat'
                        ? 'via HMU chat'
                        : 'direct signup'}
                    </div>
                  )}
                  <div className="text-xs text-neutral-500 mt-0.5">signed up {fmtDate(u.signedUpAt)}</div>
                </div>
                <div className="text-right shrink-0">
                  {u.lastTextedAt ? (
                    <span className="text-xs text-green-400">texted {fmtShortDate(u.lastTextedAt)}</span>
                  ) : (
                    <span className="text-xs text-yellow-400">not texted</span>
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
