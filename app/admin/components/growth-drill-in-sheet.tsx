'use client';

// Fly-in for the Growth tab stat cards (Riders, Drivers, Active, Pending, Other).
// Scopes to the chart's current period (daily/weekly/monthly) and sorts
// never-texted users first so outreach holdouts float to the top.

import { useEffect, useState } from 'react';
import { AdminSheet } from './admin-sheet';
import { stageRecipientsAndGo, type StagedRecipient } from '@/lib/admin/outreach-staging';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedIds(new Set()); // reset selection on each open
    const url = `/api/admin/users/growth/list?bucket=${bucket}&period=${period}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []))
      .catch((err) => console.error('growth drill-in fetch failed:', err))
      .finally(() => setLoading(false));
  }, [open, bucket, period]);

  const untextedCount = users.filter((u) => u.lastTextedAt === null).length;

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllWithPhone = () => {
    const withPhone = users.filter((u) => u.phone);
    setSelectedIds(new Set(withPhone.map((u) => u.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleSendSelected = () => {
    const recipients: StagedRecipient[] = users
      .filter((u) => selectedIds.has(u.id) && u.phone)
      .map((u) => ({
        userId: u.id,
        name: u.displayName,
        phone: u.phone!,
        profileType: u.profileType,
      }));
    if (recipients.length === 0) return;
    stageRecipientsAndGo(recipients);
  };

  const selectedCount = selectedIds.size;
  const hasPhoneCount = users.filter((u) => u.phone).length;

  return (
    <AdminSheet
      open={open}
      onClose={onClose}
      title={BUCKET_LABEL[bucket]}
      subtitle={`${PERIOD_LABEL[period]} · ${untextedCount} never texted`}
      widthClass="max-w-2xl"
    >
      {/* Select-all bar — only shown when there are users with phones to message */}
      {!loading && hasPhoneCount > 0 && (
        <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={selectedCount === hasPhoneCount ? clearSelection : selectAllWithPhone}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            {selectedCount === hasPhoneCount ? 'Clear all' : `Select all ${hasPhoneCount} with phones`}
          </button>
          <span className="text-neutral-500">
            {selectedCount > 0 ? `${selectedCount} selected` : 'tap to select'}
          </span>
        </div>
      )}

      <div className="p-4 pb-24">
        {loading && <p className="text-sm text-neutral-500 text-center py-8">Loading…</p>}
        {!loading && users.length === 0 && (
          <p className="text-sm text-neutral-500 text-center py-8">No users in this bucket</p>
        )}
        {!loading && users.length > 0 && (
          <div className="space-y-2">
            {users.map((u) => {
              const checked = selectedIds.has(u.id);
              const selectable = !!u.phone;
              return (
                <div
                  key={u.id}
                  onClick={() => selectable && toggleSelection(u.id)}
                  role={selectable ? 'button' : undefined}
                  className={`bg-neutral-900 border rounded-lg p-3 flex items-start gap-3 transition-colors ${
                    checked
                      ? 'border-[#00E676]/60 bg-[#00E676]/5'
                      : u.lastTextedAt === null
                      ? 'border-yellow-500/30'
                      : 'border-neutral-800'
                  } ${selectable ? 'cursor-pointer hover:bg-neutral-800/40' : 'opacity-60'}`}
                  style={{ touchAction: 'manipulation' }}
                >
                  {/* Checkbox */}
                  <div className="shrink-0 pt-0.5">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                      checked
                        ? 'bg-[#00E676] border-[#00E676]'
                        : selectable
                        ? 'border-neutral-600'
                        : 'border-neutral-800'
                    }`}>
                      {checked && (
                        <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-black" fill="currentColor">
                          <path d="M7.5 13.5l-3-3 1.414-1.414L7.5 10.672l5.586-5.586L14.5 6.5z" />
                        </svg>
                      )}
                    </div>
                  </div>

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
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky batch action bar — appears when ≥1 is selected */}
      {selectedCount > 0 && (
        <div className="sticky bottom-0 left-0 right-0 bg-neutral-950 border-t border-neutral-800 p-4 flex items-center gap-3">
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-neutral-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSendSelected}
            className="flex-1 py-3 rounded-full bg-[#00E676] text-black font-bold text-sm"
            style={{ touchAction: 'manipulation' }}
          >
            Message {selectedCount} selected
          </button>
        </div>
      )}
    </AdminSheet>
  );
}
