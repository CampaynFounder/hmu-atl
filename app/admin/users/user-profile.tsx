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
    avatarUrl: string | null;
    driverAreas: Record<string, unknown>;
    vehicleInfo: Record<string, unknown>;
    phone: string;
    signupSource: string;
    referredByDriverId: string | null;
    refDriverName: string | null;
    refDriverHandle: string | null;
    lastSignInAt: string | null;
    signInCount: number;
    firstReturnAt: string | null;
    profileVisible: boolean | null;
    paymentReady: boolean;
    stripeOnboardingComplete: boolean;
    paymentMethodCount: number;
    paymentBrand: string | null;
    paymentLast4: string | null;
    paymentExpMonth: number | null;
    paymentExpYear: number | null;
    lifetimeSpend: number;
    lifetimeEarned: number;
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
  activity: {
    event: string;
    properties: Record<string, unknown> | null;
    createdAt: string;
  }[];
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function UserProfile({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [data, setData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [smsText, setSmsText] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [copyFlash, setCopyFlash] = useState<string | null>(null);
  const [nudgeSending, setNudgeSending] = useState(false);
  const [nudgeMsg, setNudgeMsg] = useState<
    | { kind: 'ok'; preview: string }
    | { kind: 'error'; reason: string }
    | { kind: 'dedup'; lastSentAt: string; windowHours: number }
    | null
  >(null);

  useEffect(() => {
    if (!avatarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAvatarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [avatarOpen]);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        const text = await res.text().catch(() => '');
        setError(`Failed to load user (${res.status}): ${text.slice(0, 200)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
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

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-neutral-900 border border-red-500/30 rounded-xl p-6 space-y-3">
        <h3 className="text-red-400 font-bold">Failed to load user</h3>
        <p className="text-xs text-neutral-400 font-mono break-all">{error || 'No data returned'}</p>
        <button onClick={fetchUser} className="text-xs text-[#00E676] hover:underline">Retry</button>
      </div>
    );
  }

  const { user, rides, ratings, disputes, activity = [] } = data;

  const shareLinkDisplay = user.handle ? `atl.hmucashride.com/d/${user.handle}` : '';
  const shareLinkFull = user.handle ? `https://atl.hmucashride.com/d/${user.handle}` : '';
  const isDriver = user.profileType === 'driver' || user.profileType === 'both';

  const copyShareLink = async () => {
    if (!shareLinkFull) return;
    try {
      await navigator.clipboard.writeText(shareLinkFull);
      setCopyFlash('Copied!');
      setTimeout(() => setCopyFlash(null), 1500);
    } catch {
      setCopyFlash('Copy failed');
      setTimeout(() => setCopyFlash(null), 2000);
    }
  };

  const sendShareLinkNudge = async (ackDuplicate = false) => {
    setNudgeSending(true);
    setNudgeMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/send-activation-nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkKey: 'driver_share_link_promo', ackDuplicate }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setNudgeMsg({ kind: 'ok', preview: json.smsPreview || 'Sent' });
      } else if (res.status === 409 && json.error === 'duplicate_within_window') {
        setNudgeMsg({
          kind: 'dedup',
          lastSentAt: json.lastSentAt,
          windowHours: json.windowHours ?? 72,
        });
      } else {
        setNudgeMsg({ kind: 'error', reason: json.reason || json.error || `HTTP ${res.status}` });
      }
    } catch (err) {
      setNudgeMsg({ kind: 'error', reason: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setNudgeSending(false);
    }
  };

  const ratingCounts = ratings.filter((r) => r.direction === 'received').reduce(
    (acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );
  const weirdo3x = (ratingCounts['weirdo'] ?? 0) >= 3;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        {/* Avatar with payment-ready dot */}
        <div className="relative shrink-0">
          {user.avatarUrl ? (
            <button
              type="button"
              onClick={() => setAvatarOpen(true)}
              aria-label="Enlarge avatar"
              className="rounded-full focus:outline-none focus:ring-2 focus:ring-[#00E676]"
            >
              <img
                src={user.avatarUrl}
                alt={user.displayName}
                className="w-14 h-14 rounded-full object-cover border-2 border-neutral-700 hover:border-[#00E676] transition-colors cursor-zoom-in"
              />
            </button>
          ) : (
            <div className="w-14 h-14 rounded-full bg-neutral-800 border-2 border-neutral-700 flex items-center justify-center text-neutral-500 text-lg font-bold">
              {user.displayName?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <span
            title={user.paymentReady
              ? (user.profileType === 'driver' || user.profileType === 'both'
                  ? 'Stripe Connect onboarded — payouts enabled'
                  : 'Saved card on file')
              : 'No payment method linked'}
            className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-neutral-950 flex items-center justify-center text-[10px] leading-none font-bold ${
              user.paymentReady
                ? 'bg-emerald-500 text-emerald-950'
                : 'bg-neutral-700 text-neutral-400'
            }`}
            aria-label={user.paymentReady ? 'Payment ready' : 'No payment method'}
          >
            {user.paymentReady ? '✓' : '!'}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold">{user.displayName}</h2>
            {user.isAdmin && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium">ADMIN</span>
            )}
            {weirdo3x && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">WEIRDO x3+</span>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
              user.accountStatus === 'active' ? 'bg-green-500/20 text-green-400' :
              user.accountStatus === 'suspended' ? 'bg-red-500/20 text-red-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {user.accountStatus}
            </span>
            <span
              title={
                user.paymentReady
                  ? user.profileType === 'driver' || user.profileType === 'both'
                    ? 'Stripe Connect onboarding complete — payouts enabled'
                    : `Saved card on file${user.paymentBrand && user.paymentLast4 ? ` (${user.paymentBrand} •••• ${user.paymentLast4})` : ''}`
                  : 'No payment method linked'
              }
              className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                user.paymentReady
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-neutral-700/40 text-neutral-400'
              }`}
            >
              {user.paymentReady ? 'PAYMENT READY ✓' : 'NO PAYMENT'}
            </span>
          </div>
          {user.handle && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-neutral-500">@{user.handle}</span>
              {user.profileType === 'driver' && (
                <a
                  href={`https://atl.hmucashride.com/d/${user.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[#00E676] hover:underline font-medium"
                >
                  View HMU Page
                </a>
              )}
            </div>
          )}
          <p className="text-xs text-neutral-500 capitalize mt-0.5">{user.profileType}</p>
          {user.paymentBrand && user.paymentLast4 && (
            <p className="text-[11px] text-neutral-400 mt-0.5 font-mono">
              <span className="capitalize">{user.paymentBrand}</span> •••• {user.paymentLast4}
              {user.paymentExpMonth && user.paymentExpYear && (
                <span className="text-neutral-600">
                  {' '}· {String(user.paymentExpMonth).padStart(2, '0')}/{String(user.paymentExpYear).slice(-2)}
                </span>
              )}
              {user.paymentMethodCount > 1 && (
                <span className="text-neutral-600"> · +{user.paymentMethodCount - 1} more</span>
              )}
            </p>
          )}
          {user.profileType !== 'rider' && user.stripeOnboardingComplete && (
            <p className="text-[11px] text-emerald-400/80 mt-0.5">Stripe Connect ✓ payouts enabled</p>
          )}
        </div>
      </div>

      {/* HMU Share Link — drivers only. Surfaces the public profile URL with
          one-click copy + "send activation nudge" so admins can fire the
          canonical driver_share_link_promo SMS straight from this page.
          RBAC follow-up: gate the nudge button on a future
          'activation:send_nudge' slug in lib/admin/route-permissions.ts so
          roles like Sr Growth Manager can use it without full super access. */}
      {isDriver && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">HMU Share Link</h3>
            {copyFlash && (
              <span className="text-[10px] text-[#00E676] font-medium">{copyFlash}</span>
            )}
          </div>
          {user.handle ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <code className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-[#00E676] font-mono truncate">
                  {shareLinkDisplay}
                </code>
                <button
                  onClick={copyShareLink}
                  className="bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors shrink-0"
                >
                  Copy
                </button>
                <a
                  href={shareLinkFull}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors shrink-0"
                >
                  Open
                </a>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => sendShareLinkNudge(false)}
                  disabled={nudgeSending || !user.phone}
                  className="bg-[#00E676] hover:bg-[#00C864] disabled:bg-neutral-700 disabled:text-neutral-500 text-black text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                  title={!user.phone ? 'No phone on profile' : 'Sends the canonical share-link activation SMS'}
                >
                  {nudgeSending ? 'Sending…' : 'Send activation nudge'}
                </button>
                <span className="text-[10px] text-neutral-500">
                  Fires <code className="font-mono">driver_share_link_promo</code> SMS to {user.phone || 'their phone'}
                </span>
              </div>
              {nudgeMsg?.kind === 'ok' && (
                <div className="mt-3 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <p className="text-[11px] text-emerald-400 font-medium">Nudge sent.</p>
                  <p className="text-[10px] text-emerald-400/70 mt-0.5 font-mono break-words">{nudgeMsg.preview}</p>
                </div>
              )}
              {nudgeMsg?.kind === 'dedup' && (
                <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-[11px] text-yellow-400 font-medium">
                    Already nudged in the last {nudgeMsg.windowHours}h
                    {nudgeMsg.lastSentAt && (
                      <> · last sent {new Date(nudgeMsg.lastSentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</>
                    )}.
                  </p>
                  <button
                    onClick={() => sendShareLinkNudge(true)}
                    disabled={nudgeSending}
                    className="mt-2 bg-yellow-600 hover:bg-yellow-700 text-white text-[11px] font-semibold px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                  >
                    Send anyway
                  </button>
                </div>
              )}
              {nudgeMsg?.kind === 'error' && (
                <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-[11px] text-red-400 font-medium">{nudgeMsg.reason}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-neutral-500">
              Driver hasn&apos;t claimed an @handle yet — share link not available.
            </p>
          )}
        </div>
      )}

      {/* Quick Contact */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Quick Contact</h3>
          {user.phone && (
            <button
              onClick={() => navigator.clipboard.writeText(user.phone)}
              className="text-[10px] text-[#00E676] hover:underline font-mono"
            >
              {user.phone}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-neutral-500">Signed Up</p>
            <p className="text-white">{new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            <p className="text-neutral-400">{new Date(user.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
          </div>
          <div>
            <p className="text-neutral-500">How They Joined</p>
            <p className="text-white">{
              user.signupSource === 'hmu_chat' ? 'Chat Booking' :
              user.signupSource === 'homepage_lead' ? 'Homepage Lead' :
              user.signupSource === 'direct' ? 'Direct' : user.signupSource || 'Unknown'
            }</p>
          </div>
          {user.refDriverName && (
            <div>
              <p className="text-neutral-500">Referred By Driver</p>
              <p className="text-[#00E676]">{user.refDriverName}</p>
              {user.refDriverHandle && <p className="text-neutral-400 font-mono">@{user.refDriverHandle}</p>}
            </div>
          )}
          <div>
            <p
              className="text-neutral-500"
              title="Updated by Clerk session.created webhook. Tracks distinct sign-in sessions, not app opens — a user with a long-lived session may show one count per week."
            >
              Last Sign In
            </p>
            {user.lastSignInAt ? (
              <>
                <p className="text-white">{new Date(user.lastSignInAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                <p className="text-neutral-400">{new Date(user.lastSignInAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
              </>
            ) : (
              <p className="text-red-400">Never signed in</p>
            )}
          </div>
          <div>
            <p
              className="text-neutral-500"
              title={
                user.signInCount === 0 && user.lastSignInAt
                  ? 'Last sign-in is known but count was never tracked (predates the session.created handler). Run the sign-in backfill or wait for the next session.'
                  : 'Incremented once per Clerk session.created event. Not every app open — only new sessions.'
              }
            >
              Sign-in Count
            </p>
            <p className="text-white">
              {user.signInCount}
              {user.signInCount === 0 && user.lastSignInAt && (
                <span className="text-[10px] text-yellow-400 ml-2">untracked</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-neutral-500">Profile Type</p>
            <p className="text-white capitalize">{user.profileType}</p>
          </div>
          {(user.profileType === 'rider' || user.profileType === 'both') && (
            <div>
              <p className="text-neutral-500">Lifetime Spend</p>
              <p className="text-white">{fmt(user.lifetimeSpend)}</p>
            </div>
          )}
          {(user.profileType === 'driver' || user.profileType === 'both') && (
            <div>
              <p className="text-neutral-500">Lifetime Earned</p>
              <p className="text-white">{fmt(user.lifetimeEarned)}</p>
            </div>
          )}
          <div>
            <p className="text-neutral-500">Tier</p>
            <p className={user.tier === 'hmu_first' ? 'text-blue-400' : 'text-white'}>{user.tier === 'hmu_first' ? 'HMU First' : 'Free'}</p>
          </div>
          <div>
            <p className="text-neutral-500">Status</p>
            <p className={`capitalize ${
              user.accountStatus === 'active' ? 'text-green-400' :
              user.accountStatus === 'suspended' ? 'text-red-400' :
              'text-yellow-400'
            }`}>{user.accountStatus.replace('_', ' ')}</p>
          </div>
        </div>
      </div>

      {/* Engagement Summary */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Engagement</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-neutral-500">Completed Rides</p>
            <p className="text-white text-lg font-bold">{user.completedRides}</p>
          </div>
          <div>
            <p className="text-neutral-500">Disputes</p>
            <p className={`text-lg font-bold ${user.disputeCount > 0 ? 'text-red-400' : 'text-white'}`}>{user.disputeCount}</p>
          </div>
          <div>
            <p className="text-neutral-500">Chill Score</p>
            <p className="text-white text-lg font-bold">{user.chillScore}%</p>
          </div>
          <div>
            <p className="text-neutral-500">OG Status</p>
            <p className={`text-lg font-bold ${user.ogStatus ? 'text-yellow-400' : 'text-neutral-600'}`}>{user.ogStatus ? 'OG' : 'No'}</p>
          </div>
        </div>
        {/* Last activity / abandon point */}
        {activity && activity.length > 0 && (
          <div className="mt-4 pt-3 border-t border-neutral-800">
            <p className="text-neutral-500 text-xs mb-1">Last Action</p>
            <p className="text-white text-sm font-medium">{activity[0].event.replace(/_/g, ' ')}</p>
            <p className="text-neutral-400 text-[10px]">
              {new Date(activity[0].createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(activity[0].createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </p>
          </div>
        )}
        {(!activity || activity.length === 0) && user.completedRides === 0 && (
          <div className="mt-4 pt-3 border-t border-neutral-800">
            <p className="text-red-400 text-xs font-medium">Abandoned — never completed onboarding</p>
          </div>
        )}
      </div>

      {/* Activity Timeline */}
      {activity && activity.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Activity Timeline</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00E676]/50 shrink-0" />
                <span className="text-white font-medium">{a.event.replace(/_/g, ' ')}</span>
                <span className="text-neutral-600 ml-auto shrink-0">
                  {new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {new Date(a.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* IDs & Integrations */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">IDs</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-neutral-500">Clerk</p>
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

      {/* Browse Visibility — separate from account status */}
      {user.profileType === 'driver' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">Browse Visibility</h3>
              <p className="text-[11px] text-neutral-500 mt-1 max-w-md">
                {user.profileVisible === false
                  ? 'Hidden from /rider/browse. Direct HMU link still works and bookings still flow.'
                  : 'Shown in /rider/browse. Riders discover this driver in the list.'}
              </p>
            </div>
            <button
              onClick={() => updateUser({ profileVisible: !(user.profileVisible !== false) })}
              disabled={saving}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0 ${
                user.profileVisible === false
                  ? 'bg-[#00E676] hover:bg-[#00C864] text-black'
                  : 'bg-neutral-700 hover:bg-neutral-600 text-white'
              }`}
            >
              {user.profileVisible === false ? 'Show in browse' : 'Hide from browse'}
            </button>
          </div>
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

      {avatarOpen && user.avatarUrl && (
        <div
          onClick={() => setAvatarOpen(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 cursor-zoom-out"
          role="dialog"
          aria-modal="true"
          aria-label="Avatar enlarged"
        >
          <img
            src={user.avatarUrl}
            alt={user.displayName}
            onClick={(e) => e.stopPropagation()}
            className="max-w-[92vw] max-h-[92vh] rounded-2xl object-contain shadow-2xl cursor-default"
          />
          <button
            type="button"
            onClick={() => setAvatarOpen(false)}
            aria-label="Close"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-neutral-900/90 border border-neutral-700 text-white text-xl leading-none hover:bg-neutral-800"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
