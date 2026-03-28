'use client';

import { useEffect, useState, useCallback } from 'react';
import { UserProfile } from './user-profile';
import { PendingQueue } from './pending-queue';

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
}

export function UserManagement() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<'search' | 'pending'>('search');
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);

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
  }, [search, typeFilter, statusFilter]);

  useEffect(() => {
    if (tab === 'search') fetchUsers();
  }, [fetchUsers, tab]);

  if (selectedUserId) {
    return (
      <div>
        <button
          onClick={() => setSelectedUserId(null)}
          className="text-xs text-neutral-500 hover:text-white mb-4 flex items-center gap-1"
        >
          &larr; Back to users
        </button>
        <UserProfile userId={selectedUserId} onBack={() => { setSelectedUserId(null); fetchUsers(); }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">User Management</h1>
        <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          {(['search', 'pending'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                tab === t ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'
              }`}
            >
              {t === 'pending' ? 'Pending Activation' : 'Search'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'pending' ? (
        <PendingQueue />
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
            <button
              onClick={fetchUsers}
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Search
            </button>
          </div>

          {/* User Table */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500">
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Tier</th>
                    <th className="text-right p-3 font-medium">Rides</th>
                    <th className="text-right p-3 font-medium">Disputes</th>
                    <th className="text-left p-3 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-neutral-500">Searching...</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-neutral-500">No users found</td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr
                        key={user.id}
                        onClick={() => setSelectedUserId(user.id)}
                        className="border-b border-neutral-800/50 hover:bg-white/5 cursor-pointer transition-colors"
                      >
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
