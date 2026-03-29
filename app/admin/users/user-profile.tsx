'use client';

import { useEffect, useState, useCallback } from 'react';

interface UserData {
  user: {
    id: string;
    clerkId: string;
    profileType: string;
    accountStatus: string;
    tier: string;
    ogStatus: boolean;
    chillScore: number;
    completedRides: number;
    disputeCount: number;
    isAdmin: boolean;
    createdAt: string;
    displayName: string;
    handle: string;
    stripeConnectId: string;
    stripeCustomerId: string;
    videoUrl: string;
    driverAreas: Record<string, unknown>;
    vehicleInfo: Record<string, unknown>;
    phone: string;
  };
  rides: {
    id: string;
    status: string;
    price: number;
    applicationFee: number;
    driverId: string;
    riderId: string;
    pickup: Record<string, unknown>;
    dropoff: Record<string, unknown>;
    createdAt: string;
  }[];
  ratings: {
    type: string;
    direction: string;
    otherUserId: string;
    rideId: string;
    createdAt: string;
  }[];
  disputes: {
    id: string;
    rideId: string;
    status: string;
    reason: string;
    createdAt: string;
  }[];
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function UserProfile({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [data, setData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [smsText, setSmsText] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('Failed to fetch user:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const updateUser = async (updates: Record<string, unknown>) => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setMessage('Updated successfully');
        fetchUser();
      } else {
        setMessage('Update failed');
      }
    } catch {
      setMessage('Update failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  const { user, rides, ratings, disputes } = data;

  const ratingCounts = ratings.filter((r) => r.direction === 'received').reduce(
    (acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );
  const weirdo3x = (ratingCounts['weirdo'] ?? 0) >= 3;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold">{user.displayName}</h2>
          {user.handle && <p className="text-sm text-neutral-500">@{user.handle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {user.isAdmin && (
            <span className="text-[10px] px-2 py-1 rounded bg-purple-500/20 text-purple-400 font-medium">ADMIN</span>
          )}
          {weirdo3x && (
            <span className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-400 font-medium">WEIRDO x3+</span>
          )}
          <span className={`text-xs px-2 py-1 rounded font-medium ${
            user.accountStatus === 'active' ? 'bg-green-500/20 text-green-400' :
            user.accountStatus === 'suspended' ? 'bg-red-500/20 text-red-400' :
            'bg-yellow-500/20 text-yellow-400'
          }`}>
            {user.accountStatus}
          </span>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Account Info</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-neutral-500">Profile Type</p>
            <p className="text-white capitalize">{user.profileType}</p>
          </div>
          <div>
            <p className="text-neutral-500">Tier</p>
            <p className={user.tier === 'hmu_first' ? 'text-blue-400' : 'text-white'}>{user.tier === 'hmu_first' ? 'HMU First' : 'Free'}</p>
          </div>
          <div>
            <p className="text-neutral-500">Chill Score</p>
            <p className="text-white">{user.chillScore}%</p>
          </div>
          <div>
            <p className="text-neutral-500">Completed Rides</p>
            <p className="text-white">{user.completedRides}</p>
          </div>
          <div>
            <p className="text-neutral-500">Disputes</p>
            <p className={user.disputeCount > 0 ? 'text-red-400' : 'text-white'}>{user.disputeCount}</p>
          </div>
          <div>
            <p className="text-neutral-500">OG Status</p>
            <p className={user.ogStatus ? 'text-yellow-400' : 'text-neutral-500'}>{user.ogStatus ? 'OG' : 'No'}</p>
          </div>
          <div>
            <p className="text-neutral-500">Clerk ID</p>
            <p className="text-white font-mono text-[10px]">{user.clerkId}</p>
          </div>
          {user.stripeConnectId && (
            <div>
              <p className="text-neutral-500">Stripe Connect</p>
              <p className="text-white font-mono text-[10px]">{user.stripeConnectId}</p>
            </div>
          )}
          {user.stripeCustomerId && (
            <div>
              <p className="text-neutral-500">Stripe Customer</p>
              <p className="text-white font-mono text-[10px]">{user.stripeCustomerId}</p>
            </div>
          )}
          <div>
            <p className="text-neutral-500">Member Since</p>
            <p className="text-white">{new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Video Intro */}
      {user.videoUrl && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Video Intro</h3>
          <video
            src={user.videoUrl}
            controls
            className="w-full max-w-md rounded-lg"
          />
        </div>
      )}

      {/* Admin Actions */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Actions</h3>
        {message && (
          <p className={`text-xs mb-3 ${message.includes('success') ? 'text-green-400' : 'text-red-400'}`}>{message}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {user.accountStatus !== 'active' && (
            <button
              onClick={() => updateUser({ accountStatus: 'active' })}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Activate
            </button>
          )}
          {user.accountStatus !== 'suspended' && (
            <button
              onClick={() => updateUser({ accountStatus: 'suspended' })}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Suspend
            </button>
          )}
          {user.accountStatus !== 'banned' && (
            <button
              onClick={() => updateUser({ accountStatus: 'banned' })}
              disabled={saving}
              className="bg-red-800 hover:bg-red-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Ban
            </button>
          )}
          {user.tier !== 'hmu_first' && user.profileType === 'driver' && (
            <button
              onClick={() => updateUser({ tier: 'hmu_first' })}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Upgrade to HMU First
            </button>
          )}
          {user.tier === 'hmu_first' && (
            <button
              onClick={() => updateUser({ tier: 'free' })}
              disabled={saving}
              className="bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Downgrade to Free
            </button>
          )}
          {!user.ogStatus && user.profileType === 'rider' && (
            <button
              onClick={() => updateUser({ ogStatus: true })}
              disabled={saving}
              className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Grant OG
            </button>
          )}
          {user.ogStatus && (
            <button
              onClick={() => updateUser({ ogStatus: false })}
              disabled={saving}
              className="bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Revoke OG
            </button>
          )}
          <button
            onClick={() => updateUser({ chillScore: 0 })}
            disabled={saving}
            className="bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            Reset Chill Score
          </button>
          <button
            onClick={async () => {
              setSaving(true);
              setMessage('');
              try {
                const res = await fetch('/api/admin/grant', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: user.id, grant: !user.isAdmin }),
                });
                if (res.ok) {
                  setMessage(user.isAdmin ? 'Admin revoked' : 'Admin granted');
                  fetchUser();
                } else {
                  setMessage('Failed');
                }
              } catch { setMessage('Failed'); }
              finally { setSaving(false); }
            }}
            disabled={saving}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
              user.isAdmin
                ? 'bg-red-800 hover:bg-red-900 text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            {user.isAdmin ? 'Revoke Admin' : 'Grant Admin'}
          </button>
        </div>

        {/* Send SMS */}
        {user.phone && (
          <div className="mt-4 pt-4 border-t border-neutral-800">
            <h4 className="text-xs font-semibold text-neutral-400 mb-2">Send SMS to {user.phone}</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={smsText}
                onChange={(e) => setSmsText(e.target.value.slice(0, 160))}
                maxLength={160}
                placeholder="Type a message..."
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
              />
              <button
                onClick={async () => {
                  if (!smsText.trim()) return;
                  setSmsSending(true);
                  setSmsResult(null);
                  try {
                    const res = await fetch('/api/admin/marketing/send', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        recipients: [{ phone: user.phone, name: user.displayName }],
                        message: smsText.trim(),
                      }),
                    });
                    const data = await res.json();
                    if (res.ok && data.sent > 0) {
                      setSmsResult('Sent');
                      setSmsText('');
                    } else {
                      setSmsResult(data.error || 'Failed');
                    }
                  } catch { setSmsResult('Network error'); }
                  finally { setSmsSending(false); }
                }}
                disabled={smsSending || !smsText.trim()}
                className="bg-green-600 hover:bg-green-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {smsSending ? '...' : 'Send'}
              </button>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className={`text-[10px] ${smsText.length > 140 ? 'text-yellow-400' : 'text-neutral-600'}`}>
                {smsText.length}/160
              </span>
              {smsResult && (
                <span className={`text-[10px] font-medium ${smsResult === 'Sent' ? 'text-green-400' : 'text-red-400'}`}>
                  {smsResult}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rating History */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Rating History</h3>
        <div className="flex gap-4 mb-4">
          {['chill', 'cool_af', 'kinda_creepy', 'weirdo'].map((type) => (
            <div key={type} className="text-center">
              <p className={`text-lg font-bold ${
                type === 'weirdo' ? 'text-red-400' :
                type === 'kinda_creepy' ? 'text-yellow-400' :
                type === 'cool_af' ? 'text-blue-400' :
                'text-green-400'
              }`}>
                {ratingCounts[type] ?? 0}
              </p>
              <p className="text-[10px] text-neutral-500 capitalize">{type.replace('_', ' ')}</p>
            </div>
          ))}
        </div>
        {ratings.length === 0 ? (
          <p className="text-xs text-neutral-500">No ratings yet</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {ratings.slice(0, 20).map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  r.type === 'weirdo' ? 'bg-red-500/20 text-red-400' :
                  r.type === 'kinda_creepy' ? 'bg-yellow-500/20 text-yellow-400' :
                  r.type === 'cool_af' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-green-500/20 text-green-400'
                }`}>
                  {r.type.replace('_', ' ')}
                </span>
                <span className="text-neutral-500">{r.direction}</span>
                <span className="text-neutral-600 ml-auto">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ride History */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Ride History ({rides.length})</h3>
        {rides.length === 0 ? (
          <p className="text-xs text-neutral-500">No rides yet</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {rides.map((ride) => (
              <div key={ride.id} className="flex items-center justify-between text-xs border-b border-neutral-800/50 pb-2">
                <div>
                  <span className="font-mono text-neutral-500">{ride.id.slice(0, 8)}</span>
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    ride.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    ride.status === 'cancelled' ? 'bg-neutral-500/20 text-neutral-400' :
                    ride.status === 'disputed' ? 'bg-red-500/20 text-red-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {ride.status}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-white">{fmt(ride.price)}</span>
                  {ride.applicationFee > 0 && (
                    <span className="text-neutral-600 ml-2">fee: {fmt(ride.applicationFee)}</span>
                  )}
                  <span className="text-neutral-600 ml-2">{new Date(ride.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Disputes */}
      {disputes.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Disputes ({disputes.length})</h3>
          <div className="space-y-2">
            {disputes.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs border-b border-neutral-800/50 pb-2">
                <div>
                  <span className="font-mono text-neutral-500">{d.id.slice(0, 8)}</span>
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    d.status === 'open' ? 'bg-yellow-500/20 text-yellow-400' :
                    d.status === 'closed' ? 'bg-neutral-500/20 text-neutral-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {d.status.replace('_', ' ')}
                  </span>
                </div>
                <span className="text-neutral-600">{new Date(d.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
