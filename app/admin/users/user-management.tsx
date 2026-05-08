'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PendingQueue } from './pending-queue';
import { UserGrowthChart } from './user-growth-chart';
import { BulkAreaModal } from './bulk-area-modal';
import { useMarket } from '@/app/admin/components/market-context';

interface UserItem {
  id: string;
  clerkId: string;
  profileType: string;
  accountStatus: string;
  tier: string;
  displayName: string;
  phone: string | null;
  completedRides: number;
  disputeCount: number;
  createdAt: string;
  profileVisible: boolean | null;
  paymentReady: boolean;
}

export function UserManagement() {
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState(''); // '' | 'visible' | 'hidden'
  const [tab, setTab] = useState<'search' | 'growth' | 'pending'>('search');
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [showAreaModal, setShowAreaModal] = useState(false);
  const { selectedMarketId } = useMarket();

  const driverUsers = useMemo(() => users.filter((u) => u.profileType === 'driver' || u.profileType === 'both'), [users]);
  const selectedDrivers = useMemo(
    () => driverUsers.filter((u) => selectedIds.has(u.id)),
    [driverUsers, selectedIds],
  );

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(driverUsers.map((u) => u.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  async function bulkUpdate(updates: Record<string, unknown>, opts: { needsMarket?: boolean } = {}) {
    if (selectedIds.size === 0) return;
    if (opts.needsMarket && !selectedMarketId) {
      setBulkMessage('Pick a market in the top bar before editing areas.');
      return;
    }
    setBulkBusy(true);
    setBulkMessage(null);
    try {
      const res = await fetch('/api/admin/users/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: Array.from(selectedIds),
          updates,
          marketId: opts.needsMarket ? selectedMarketId : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk update failed');
      const skippedTotal = (data.skipped?.nonDriver?.length ?? 0) + (data.skipped?.wrongMarket?.length ?? 0);
      const parts = [`Updated ${data.updatedCount}`];
      if (data.skipped?.nonDriver?.length) parts.push(`${data.skipped.nonDriver.length} non-driver skipped`);
      if (data.skipped?.wrongMarket?.length) parts.push(`${data.skipped.wrongMarket.length} outside selected market`);
      setBulkMessage(parts.join(' · ') + (skippedTotal === 0 ? ' ✓' : ''));
      setSelectedIds(new Set());
      fetchUsers();
    } catch (e) {
      setBulkMessage(e instanceof Error ? e.message : 'Bulk update failed');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleClearCashFlags() {
    if (!confirm(`Clear cash_only and accepts_cash on ${selectedIds.size} selected user(s)?`)) return;
    await bulkUpdate({ cashOnly: false, acceptsCash: false });
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (selectedMarketId) params.set('marketId', selectedMarketId);
      if (visibilityFilter) params.set('visibility', visibilityFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      } else {
        console.error('Admin users API error:', res.status, await res.text());
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter, visibilityFilter, selectedMarketId]);

  useEffect(() => {
    if (tab === 'search') fetchUsers();
  }, [fetchUsers, tab]);

  // Optimistic toggle of profile_visible. Reverts on API failure so the UI
  // never lies about the persisted state.
  const toggleVisibility = useCallback(async (id: string, next: boolean) => {
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, profileVisible: next } : u)));
    try {
      const res = await fetch(`/api/admin/users/${id}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('Visibility toggle failed:', res.status, body);
        setUsers(prev => prev.map(u => (u.id === id ? { ...u, profileVisible: !next } : u)));
      }
    } catch (err) {
      console.error('Visibility toggle threw:', err);
      setUsers(prev => prev.map(u => (u.id === id ? { ...u, profileVisible: !next } : u)));
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-xl font-bold">User Management</h1>
        <div className="flex gap-2">
          {(['search', 'growth', 'pending'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t
                  ? 'bg-white text-black'
                  : 'bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white'
              }`}
            >
              {t === 'pending' ? 'Pending' : t === 'growth' ? 'Growth' : 'Search'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'pending' ? (
        <PendingQueue />
      ) : tab === 'growth' ? (
        <UserGrowthChart />
      ) : (
        <>
          {/* Search & Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search by name, handle, phone, Clerk ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">All Types</option>
              <option value="rider">Rider</option>
              <option value="driver">Driver</option>
              <option value="admin">Admin</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="pending_activation">Pending</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
            </select>
            {typeFilter === 'driver' && (
              <select
                value={visibilityFilter}
                onChange={(e) => setVisibilityFilter(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">All Visibility</option>
                <option value="visible">Visible in browse</option>
                <option value="hidden">Hidden from browse</option>
              </select>
            )}
            <button
              onClick={fetchUsers}
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Search
            </button>
          </div>

          {/* Bulk action toolbar — sticky when any drivers are selected. */}
          {selectedIds.size > 0 && (
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-700/40 bg-emerald-950/30 px-3 py-2 text-xs">
              <div className="text-emerald-200">
                {selectedIds.size} selected · {selectedDrivers.length} driver{selectedDrivers.length === 1 ? '' : 's'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleClearCashFlags}
                  disabled={bulkBusy || selectedDrivers.length === 0}
                  className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 hover:bg-neutral-800 disabled:opacity-50"
                >
                  Clear cash flags
                </button>
                <button
                  onClick={() => setShowAreaModal(true)}
                  disabled={bulkBusy || selectedDrivers.length === 0 || !selectedMarketId}
                  title={!selectedMarketId ? 'Pick a market in the top bar first' : undefined}
                  className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 hover:bg-neutral-800 disabled:opacity-50"
                >
                  Set ride areas…
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  disabled={bulkBusy}
                  className="text-neutral-400 hover:text-white disabled:opacity-50"
                >
                  Clear selection
                </button>
              </div>
            </div>
          )}
          {bulkMessage && (
            <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300">
              {bulkMessage}
            </div>
          )}

          {/* User Table */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500">
                    <th className="p-3 font-medium w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all drivers"
                        disabled={driverUsers.length === 0}
                        checked={driverUsers.length > 0 && selectedIds.size === driverUsers.length}
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                    </th>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Pay</th>
                    <th className="text-left p-3 font-medium">Visible</th>
                    <th className="text-left p-3 font-medium">Tier</th>
                    <th className="text-right p-3 font-medium">Rides</th>
                    <th className="text-right p-3 font-medium">Disputes</th>
                    <th className="text-left p-3 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-neutral-500">Searching...</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-neutral-500">No users found</td>
                    </tr>
                  ) : (
                    users.map((user) => {
                      const isDriver = user.profileType === 'driver' || user.profileType === 'both';
                      return (
                      <tr
                        key={user.id}
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                        className="border-b border-neutral-800/50 hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          {isDriver ? (
                            <input
                              type="checkbox"
                              aria-label={`Select ${user.displayName}`}
                              checked={selectedIds.has(user.id)}
                              onChange={() => toggleOne(user.id)}
                            />
                          ) : (
                            <span className="text-[10px] text-neutral-700">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <p className="text-white font-medium">{user.displayName}</p>
                          {user.phone && <p className="text-neutral-600 text-[10px]">{user.phone}</p>}
                        </td>
                        <td className="p-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
                            user.profileType === 'driver' ? 'bg-blue-500/20 text-blue-400' :
                            user.profileType === 'admin' ? 'bg-purple-500/20 text-purple-400' :
                            'bg-green-500/20 text-green-400'
                          }`}>
                            {user.profileType}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            user.accountStatus === 'active' ? 'bg-green-500/20 text-green-400' :
                            user.accountStatus === 'suspended' ? 'bg-red-500/20 text-red-400' :
                            user.accountStatus === 'banned' ? 'bg-red-600/20 text-red-500' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {user.accountStatus}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            title={user.paymentReady
                              ? (user.profileType === 'driver' || user.profileType === 'both'
                                  ? 'Stripe Connect onboarded — payouts enabled'
                                  : 'Saved card on file')
                              : 'No payment method linked'}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              user.paymentReady
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-neutral-700/40 text-neutral-500'
                            }`}
                          >
                            {user.paymentReady ? '✓ Ready' : '— None'}
                          </span>
                        </td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          {user.profileVisible === null ? (
                            <span className="text-[10px] text-neutral-600" title="No driver/rider profile yet">—</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleVisibility(user.id, !user.profileVisible)}
                              title={user.profileVisible ? 'Visible — tap to hide from feeds' : 'Hidden — tap to show'}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-colors ${
                                user.profileVisible
                                  ? 'bg-green-500/15 border-green-500/30 text-green-400 hover:bg-green-500/25'
                                  : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700'
                              }`}
                            >
                              <span className="text-sm leading-none" aria-hidden="true">
                                {user.profileVisible ? '👁' : '🚫'}
                              </span>
                              <span className="text-[10px] font-medium">
                                {user.profileVisible ? 'Visible' : 'Hidden'}
                              </span>
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`text-[10px] ${user.tier === 'hmu_first' ? 'text-blue-400' : 'text-neutral-500'}`}>
                            {user.tier === 'hmu_first' ? 'HMU First' : 'Free'}
                          </span>
                        </td>
                        <td className="p-3 text-right text-white">{user.completedRides}</td>
                        <td className="p-3 text-right">
                          <span className={user.disputeCount > 0 ? 'text-red-400' : 'text-neutral-500'}>
                            {user.disputeCount}
                          </span>
                        </td>
                        <td className="p-3 text-neutral-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showAreaModal && selectedMarketId && (
        <BulkAreaModal
          marketId={selectedMarketId}
          selectedCount={selectedDrivers.length}
          onClose={() => setShowAreaModal(false)}
          onApply={async ({ areaSlugs, servicesEntireMarket }) => {
            await bulkUpdate({ areaSlugs, servicesEntireMarket }, { needsMarket: true });
            setShowAreaModal(false);
          }}
        />
      )}
    </div>
  );
}
