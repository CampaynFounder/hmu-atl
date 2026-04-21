'use client';

// Fly-in drill-in for Live Ops "New Users" and "Incomplete Signups" containers.
// Opening fetches the user list via POST /api/admin/users/new-since, which also
// resets the admin_last_seen_at cursor when bucket = 'new_users'.

import { useEffect, useRef, useState } from 'react';
import { AdminSheet } from './admin-sheet';
import { useMarket } from './market-context';

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const { selectedMarketId } = useMarket();

  async function deleteUser(userId: string, name: string) {
    if (!confirm(`Delete incomplete signup for ${name}? This removes them from both Clerk and Neon and cannot be undone.`)) return;
    setDeletingId(userId);
    try {
      const res = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [userId] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ kind: 'err', text: data.error || 'Delete failed' });
        return;
      }
      if (data.deleted === 0) {
        setToast({ kind: 'err', text: 'Not eligible — user has activity (rides/profile)' });
        return;
      }
      setUsers(prev => prev.filter(u => u.id !== userId));
      setToast({ kind: 'ok', text: `Deleted ${name}` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setDeletingId(null);
      setTimeout(() => setToast(null), 3500);
    }
  }

  // Store the latest onResetCursor in a ref so the fetch effect doesn't
  // depend on it. Without this, an inline arrow passed from the parent
  // created a new reference every render → effect re-ran → fetched again
  // → called onResetCursor → parent state change → re-render → infinite
  // loop with the sheet flickering between loading and empty states.
  const onResetCursorRef = useRef(onResetCursor);
  onResetCursorRef.current = onResetCursor;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const qs = selectedMarketId ? `?marketId=${selectedMarketId}` : '';
    fetch(`/api/admin/users/new-since${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket }),
    })
      .then((r) => r.json())
      .then((data) => {
        const next = data.users || [];
        setUsers(next);
        // Auto-select whichever tab has data so an admin opening the drill-in
        // doesn't see "No riders in this bucket" when the users are all drivers
        // (or vice versa). Priority: riders > drivers if both have data.
        const nextRiders = next.filter((u: UserRow) => u.profileType === 'rider');
        const nextDrivers = next.filter((u: UserRow) => u.profileType === 'driver');
        if (nextRiders.length === 0 && nextDrivers.length > 0) {
          setTab('drivers');
        } else {
          setTab('riders');
        }
        if (bucket === 'new_users') onResetCursorRef.current?.();
      })
      .catch((err) => console.error('new-since fetch failed:', err))
      .finally(() => setLoading(false));
    // Deliberately excluding onResetCursor — we read it from the ref to
    // avoid re-fetching every time the parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bucket, selectedMarketId]);

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
        {!loading && visible.length === 0 && users.length === 0 && (
          <p className="text-sm text-neutral-500 text-center py-8">
            {bucket === 'new_users'
              ? 'No new users since your last visit — you\'re all caught up.'
              : 'No users in this bucket.'}
          </p>
        )}
        {!loading && visible.length === 0 && users.length > 0 && (
          <p className="text-sm text-neutral-500 text-center py-8">
            No {tab} in this bucket — tap the {tab === 'riders' ? 'Drivers' : 'Riders'} tab above.
          </p>
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
                <div className="text-right shrink-0 flex flex-col items-end gap-2">
                  {u.lastTextedAt ? (
                    <span className="text-xs text-green-400">texted {fmtShortDate(u.lastTextedAt)}</span>
                  ) : (
                    <span className="text-xs text-yellow-400">not texted</span>
                  )}
                  {/* Delete button — only incomplete-signup bucket. New Users
                      bucket means profile exists; don't expose delete there. */}
                  {bucket === 'incomplete' && (
                    <button
                      onClick={() => deleteUser(u.id, u.displayName || 'user')}
                      disabled={deletingId === u.id}
                      className="text-xs text-red-400 hover:text-red-300 hover:underline disabled:opacity-50 disabled:cursor-wait"
                      title="Remove from Clerk + Neon"
                    >
                      {deletingId === u.id ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium shadow-lg z-50 ${
            toast.kind === 'ok' ? 'bg-green-500 text-black' : 'bg-red-500 text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
    </AdminSheet>
  );
}
