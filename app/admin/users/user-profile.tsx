'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAdminAuth } from '@/app/admin/components/admin-auth-context';

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
    marketId: string | null;
    marketName: string | null;
    marketSlug: string | null;
    areaSlugs: string[];
    servicesEntireMarket: boolean;
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
    deletedAt: string | null;
  };
  relatedAccounts?: {
    id: string;
    name: string;
    profileType: string;
    accountStatus: string;
    createdAt: string;
    deletedAt: string | null;
  }[];
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

const DELETE_REASONS = [
  { value: 'wrong_user_type', label: 'Wrong user type', sendsSms: true },
  { value: 'bad_actor',       label: 'Bad actor / spam', sendsSms: false },
  { value: 'duplicate',       label: 'Duplicate account', sendsSms: false },
  { value: 'other',           label: 'Other', sendsSms: false },
] as const;

type DeleteReason = typeof DELETE_REASONS[number]['value'];

function defaultSmsForUser(profileType: string, phone: string): string {
  const isDriver = profileType === 'driver';
  const link = isDriver
    ? 'atl.hmucashride.com/r/express'
    : 'atl.hmucashride.com/driver/express';
  const role = isDriver ? 'rider' : 'driver';
  return `HMU ATL: It looks like you signed up as a ${isDriver ? 'driver' : 'rider'} but may have meant to join as a ${role}. Sign up at: ${link}`;
}

export function UserProfile({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { admin } = useAdminAuth();
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
  const [handleDraft, setHandleDraft] = useState('');
  const [handleSaving, setHandleSaving] = useState(false);
  const [handleMsg, setHandleMsg] = useState<string | null>(null);
  // Hard delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState<DeleteReason>('wrong_user_type');
  const [deleteConfirmHandle, setDeleteConfirmHandle] = useState('');
  const [deleteSmsMessage, setDeleteSmsMessage] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [nudgeSending, setNudgeSending] = useState(false);
  const [nudgeMsg, setNudgeMsg] = useState<
    | { kind: 'ok'; preview: string }
    | { kind: 'error'; reason: string }
    | { kind: 'dedup'; lastSentAt: string; windowHours: number }
    | null
  >(null);
  // Driver Lab — local draft state, committed on Save
  const [labDraft, setLabDraft] = useState<{
    displayName: string;
    thumbnailUrl: string;
    videoUrl: string;
    vehicleMake: string; vehicleModel: string; vehicleYear: string; vehicleColor: string;
    minimumFare: string;
    lat: string; lng: string;
  } | null>(null);
  const [labSaving, setLabSaving] = useState(false);
  const [labMsg, setLabMsg] = useState<string | null>(null);
  const [labUploading, setLabUploading] = useState(false);
  const labFileRef = useRef<HTMLInputElement>(null);
  // Market & Area assignment
  const [markets, setMarkets] = useState<{ id: string; name: string; slug: string; status: string }[]>([]);
  const [areas, setAreas] = useState<{ slug: string; name: string; cardinal: string; sort_order: number }[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [servicesEntireMarket, setServicesEntireMarket] = useState(false);
  const [marketSaving, setMarketSaving] = useState(false);
  const [marketMsg, setMarketMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAvatarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [avatarOpen]);

  // Load markets list once
  useEffect(() => {
    fetch('/api/admin/markets')
      .then(r => r.json())
      .then(d => setMarkets((d.markets ?? []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        name: m.name as string,
        slug: m.slug as string,
        status: m.status as string,
      }))))
      .catch(() => {});
  }, []);

  // Sync local state from loaded user data
  useEffect(() => {
    if (!data) return;
    setSelectedMarketId(data.user.marketId ?? null);
    setSelectedSlugs(data.user.areaSlugs ?? []);
    setServicesEntireMarket(data.user.servicesEntireMarket ?? false);
  }, [data]);

  // Fetch areas when selected market changes
  useEffect(() => {
    if (!selectedMarketId) { setAreas([]); return; }
    fetch(`/api/admin/markets/${selectedMarketId}/areas`)
      .then(r => r.json())
      .then(d => setAreas(d.areas ?? []))
      .catch(() => setAreas([]));
  }, [selectedMarketId]);

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

  const saveHandle = useCallback(async () => {
    const h = handleDraft.trim();
    if (!h || handleSaving) return;
    setHandleSaving(true);
    setHandleMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: h }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? 'Failed to save handle');
      setHandleMsg('Saved ✓');
      setHandleDraft('');
      await fetchUser();
    } catch (e) {
      setHandleMsg(e instanceof Error ? e.message : 'Failed to save handle');
    } finally {
      setHandleSaving(false);
    }
  }, [handleDraft, handleSaving, userId, fetchUser]);

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

  // Reset a driver's Stripe Connect connection so they can relink from scratch.
  const [resetStripeConfirm, setResetStripeConfirm] = useState(false);
  const [resetStripeLoading, setResetStripeLoading] = useState(false);
  const [resetStripeMsg, setResetStripeMsg] = useState<string | null>(null);

  const resetStripe = async () => {
    setResetStripeLoading(true);
    setResetStripeMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-stripe`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as {
        error?: string; stripeDeleted?: boolean; stripeError?: string;
      };
      if (res.ok) {
        setResetStripeMsg(
          data.stripeDeleted
            ? 'Cleared — driver can now relink (old Stripe account deleted)'
            : `Cleared — driver can now relink${data.stripeError ? ' (Stripe delete skipped)' : ''}`,
        );
        setResetStripeConfirm(false);
        fetchUser();
      } else {
        setResetStripeMsg(data.error || 'Reset failed');
      }
    } catch {
      setResetStripeMsg('Reset failed');
    } finally {
      setResetStripeLoading(false);
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

  const { user, rides, ratings, disputes, activity = [], relatedAccounts = [] } = data;

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
              user.accountStatus === 'deleted' ? 'bg-neutral-700/40 text-neutral-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {user.accountStatus}
              {user.accountStatus === 'deleted' && user.deletedAt
                ? ` · ${new Date(user.deletedAt).toLocaleDateString()}` : ''}
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
          {/* Handle editor — updates driver_profiles/rider_profiles.handle (globally unique) */}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11px] text-neutral-600">@</span>
            <input
              value={handleDraft}
              onChange={(e) => setHandleDraft(e.target.value)}
              placeholder={user.handle || 'set handle'}
              className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-xs text-white w-40"
            />
            <button
              onClick={saveHandle}
              disabled={handleSaving || !handleDraft.trim()}
              className="text-[11px] px-2 py-1 rounded bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30 disabled:opacity-40"
            >
              {handleSaving ? '…' : 'Save handle'}
            </button>
            {handleMsg && <span className="text-[11px] text-neutral-400">{handleMsg}</span>}
          </div>
          {relatedAccounts.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
              <p className="text-[10px] font-semibold text-amber-400 mb-1">
                LINKED ACCOUNTS · same phone ({relatedAccounts.length})
              </p>
              <div className="flex flex-col gap-1">
                {relatedAccounts.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => window.location.assign(`/admin/users/${r.id}`)}
                    className="flex items-center gap-2 text-left text-[11px] text-neutral-300 hover:text-white"
                    title="Open this account"
                  >
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                      r.accountStatus === 'active' ? 'bg-green-500/20 text-green-400' :
                      r.accountStatus === 'deleted' ? 'bg-neutral-700/40 text-neutral-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {r.accountStatus}
                    </span>
                    <span className="truncate">{r.name}</span>
                    <span className="text-neutral-600 capitalize">{r.profileType}</span>
                    <span className="text-neutral-600 ml-auto">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
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

        {/* Reset Stripe Connect — super admin only, drivers only. Lets a driver
            who abandoned onboarding relink from scratch. */}
        {admin?.isSuper && user.profileType !== 'rider' && (
          <div className="mt-4 pt-4 border-t border-neutral-800">
            {!resetStripeConfirm ? (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => { setResetStripeMsg(null); setResetStripeConfirm(true); }}
                  className="bg-amber-950 hover:bg-amber-900 border border-amber-800 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  Reset Stripe Connection
                </button>
                <span className="text-[11px] text-neutral-500">
                  Clears the Connect account so the driver can relink from scratch.
                </span>
                {resetStripeMsg && <span className="text-[11px] text-emerald-400">{resetStripeMsg}</span>}
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-amber-300">
                  Delete this driver&apos;s Stripe Connect account and clear payout setup? They&apos;ll have to relink.
                </span>
                <button
                  onClick={resetStripe}
                  disabled={resetStripeLoading}
                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-black text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  {resetStripeLoading ? 'Resetting…' : 'Confirm reset'}
                </button>
                <button
                  onClick={() => setResetStripeConfirm(false)}
                  disabled={resetStripeLoading}
                  className="border border-neutral-700 text-neutral-300 text-xs font-semibold px-3 py-1.5 rounded-lg"
                >
                  Cancel
                </button>
                {resetStripeMsg && <span className="text-[11px] text-red-400">{resetStripeMsg}</span>}
              </div>
            )}
          </div>
        )}
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

      {/* Driver Lab — edit test driver data without touching the driver's own profile */}
      {(user.profileType === 'driver' || user.profileType === 'both') && (() => {
        const vi = user.vehicleInfo ?? {};
        const draft = labDraft ?? {
          displayName: user.displayName ?? '',
          thumbnailUrl: user.avatarUrl ?? '',
          videoUrl: user.videoUrl ?? '',
          vehicleMake: (vi.make as string) ?? '',
          vehicleModel: (vi.model as string) ?? '',
          vehicleYear: String(vi.year ?? ''),
          vehicleColor: (vi.color as string) ?? '',
          minimumFare: '',
          lat: '',
          lng: '',
        };
        const setField = (k: keyof typeof draft, v: string) =>
          setLabDraft((prev) => ({ ...(prev ?? draft), [k]: v }));

        const handleFileUpload = async (file: File) => {
          setLabUploading(true);
          setLabMsg(null);
          try {
            const fd = new FormData();
            fd.append('video', file, file.name);
            fd.append('profile_type', 'driver');
            fd.append('media_type', 'auto');
            fd.append('save_to_profile', 'false');
            const res = await fetch('/api/upload/video', { method: 'POST', body: fd });
            const result = await res.json() as { url?: string; error?: string };
            if (res.ok && result.url) {
              const isVideo = file.type.startsWith('video/');
              setLabDraft((prev) => ({
                ...(prev ?? draft),
                thumbnailUrl: result.url!,
                ...(isVideo ? { videoUrl: result.url! } : {}),
              }));
              setLabMsg('Uploaded — click Save to apply');
            } else {
              setLabMsg(result.error ?? 'Upload failed');
            }
          } catch {
            setLabMsg('Upload failed');
          } finally {
            setLabUploading(false);
            if (labFileRef.current) labFileRef.current.value = '';
          }
        };

        const saveLab = async () => {
          setLabSaving(true);
          setLabMsg(null);
          const payload: Record<string, unknown> = {};
          if (draft.displayName) payload.displayName = draft.displayName;
          if (draft.thumbnailUrl) payload.thumbnailUrl = draft.thumbnailUrl;
          if (draft.videoUrl) payload.videoUrl = draft.videoUrl;
          const vi: Record<string, unknown> = {};
          if (draft.vehicleMake) vi.make = draft.vehicleMake;
          if (draft.vehicleModel) vi.model = draft.vehicleModel;
          if (draft.vehicleYear) vi.year = Number(draft.vehicleYear);
          if (draft.vehicleColor) vi.color = draft.vehicleColor;
          if (Object.keys(vi).length) payload.vehicleInfo = vi;
          if (draft.minimumFare) payload.minimumFare = Number(draft.minimumFare);
          if (draft.lat && draft.lng) {
            payload.currentLat = Number(draft.lat);
            payload.currentLng = Number(draft.lng);
          }
          try {
            const res = await fetch(`/api/admin/users/${userId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (res.ok) {
              setLabMsg('Saved');
              setLabDraft(null);
              fetchUser();
            } else {
              setLabMsg('Save failed');
            }
          } catch {
            setLabMsg('Save failed');
          } finally {
            setLabSaving(false);
          }
        };

        return (
          <div className="bg-neutral-900 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-amber-400">Driver Lab</h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">Edit test driver data — name, photo, car, fare, location.</p>
              </div>
              <span className="text-[10px] font-bold bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">ADMIN ONLY</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="col-span-2">
                <label className="block text-[11px] text-neutral-400 mb-1">Display name</label>
                <input
                  value={draft.displayName}
                  onChange={(e) => setField('displayName', e.target.value)}
                  placeholder={user.displayName ?? 'Name'}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] text-neutral-400 mb-1">Photo / Video</label>
                {/* Upload button */}
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => labFileRef.current?.click()}
                    disabled={labUploading}
                    className="text-xs font-medium px-3 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white transition-colors disabled:opacity-50"
                  >
                    {labUploading ? 'Uploading…' : '↑ Upload file'}
                  </button>
                  <span className="text-[10px] text-neutral-500 self-center">or paste a URL below</span>
                </div>
                <input
                  ref={labFileRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f); }}
                />
                {/* Photo URL */}
                <div className="flex gap-2 mb-2">
                  <input
                    value={draft.thumbnailUrl}
                    onChange={(e) => setField('thumbnailUrl', e.target.value)}
                    placeholder="Photo URL (https://…)"
                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-amber-500/50"
                  />
                  {draft.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.thumbnailUrl} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0 border border-neutral-700" />
                  )}
                </div>
                {/* Video URL — auto-filled when a video is uploaded */}
                <div className="flex gap-2 items-center">
                  <input
                    value={draft.videoUrl}
                    onChange={(e) => setField('videoUrl', e.target.value)}
                    placeholder="Video URL (https://…) — optional"
                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-amber-500/50"
                  />
                  {draft.videoUrl && (
                    <span className="text-[10px] text-amber-400 shrink-0">▶ video set</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Make</label>
                <input value={draft.vehicleMake} onChange={(e) => setField('vehicleMake', e.target.value)}
                  placeholder="Toyota" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Model</label>
                <input value={draft.vehicleModel} onChange={(e) => setField('vehicleModel', e.target.value)}
                  placeholder="Camry" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Year</label>
                <input value={draft.vehicleYear} onChange={(e) => setField('vehicleYear', e.target.value)}
                  placeholder="2022" type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Color</label>
                <input value={draft.vehicleColor} onChange={(e) => setField('vehicleColor', e.target.value)}
                  placeholder="Black" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-amber-500/50" />
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Min fare ($)</label>
                <input value={draft.minimumFare} onChange={(e) => setField('minimumFare', e.target.value)}
                  placeholder="15" type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-amber-500/50" />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] text-neutral-400 mb-1">Set GPS location (lat, lng) — sets driver as live at this coordinate</label>
                <div className="flex gap-2">
                  <input value={draft.lat} onChange={(e) => setField('lat', e.target.value)}
                    placeholder="33.749" type="number" step="any"
                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-amber-500/50" />
                  <input value={draft.lng} onChange={(e) => setField('lng', e.target.value)}
                    placeholder="-84.388" type="number" step="any"
                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-amber-500/50" />
                </div>
                <p className="text-[10px] text-neutral-600 mt-1">Atlanta downtown: 33.749, -84.388 · Midtown: 33.781, -84.383 · Buckhead: 33.838, -84.365</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveLab}
                disabled={labSaving}
                className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {labSaving ? 'Saving…' : 'Save changes'}
              </button>
              {labMsg && (
                <span className={`text-xs ${labMsg === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>{labMsg}</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Browse Visibility + Blast Exclusion */}
      {user.profileType === 'driver' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">Visibility</h3>
              <p className="text-[11px] text-neutral-500 mt-1 max-w-md">
                {user.profileVisible === false
                  ? 'Hidden from browse and excluded from blast matching. Use this to park test drivers.'
                  : 'Visible in browse and eligible for blast matching.'}
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
              {user.profileVisible === false ? 'Enable driver' : 'Disable driver'}
            </button>
          </div>
        </div>
      )}

      {/* Market Assignment — all profile types; Areas only for drivers */}
      {(user.profileType === 'rider' || user.profileType === 'driver' || user.profileType === 'both') && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold">Market{(user.profileType === 'driver' || user.profileType === 'both') ? ' & Areas' : ''}</h3>

          {/* Market dropdown */}
          <div>
            <label className="text-[11px] text-neutral-400 block mb-1">Market</label>
            <select
              value={selectedMarketId ?? ''}
              onChange={e => {
                setSelectedMarketId(e.target.value || null);
                setSelectedSlugs([]);
              }}
              className="w-full bg-neutral-800 border border-neutral-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-neutral-500"
            >
              <option value="">— Unassigned —</option>
              {markets.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.status.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Areas checkboxes — drivers only */}
          {(user.profileType === 'driver' || user.profileType === 'both') && selectedMarketId && areas.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] text-neutral-400">Service areas</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-[11px] text-neutral-400">Entire market</span>
                  <button
                    type="button"
                    onClick={() => setServicesEntireMarket(v => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      servicesEntireMarket ? 'bg-[#00E676]' : 'bg-neutral-700'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      servicesEntireMarket ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                </label>
              </div>
              {!servicesEntireMarket && (
                <div className="grid grid-cols-2 gap-1.5">
                  {areas.sort((a, b) => a.sort_order - b.sort_order).map(area => (
                    <label
                      key={area.slug}
                      className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300 hover:text-white"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSlugs.includes(area.slug)}
                        onChange={e => {
                          setSelectedSlugs(prev =>
                            e.target.checked
                              ? [...prev, area.slug]
                              : prev.filter(s => s !== area.slug)
                          );
                        }}
                        className="accent-[#00E676] h-3.5 w-3.5 rounded"
                      />
                      {area.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={async () => {
                setMarketSaving(true);
                setMarketMsg(null);
                try {
                  const isDriver = user.profileType === 'driver' || user.profileType === 'both';
                  const res = await fetch(`/api/admin/users/${userId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      marketId: selectedMarketId,
                      ...(isDriver && {
                        areaSlugs: servicesEntireMarket ? [] : selectedSlugs,
                        servicesEntireMarket,
                      }),
                    }),
                  });
                  setMarketMsg(res.ok ? 'Saved' : 'Failed');
                  if (res.ok) fetchUser();
                } catch {
                  setMarketMsg('Failed');
                } finally {
                  setMarketSaving(false);
                }
              }}
              disabled={marketSaving}
              className="bg-[#00E676] hover:bg-[#00C864] text-black text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {marketSaving ? 'Saving…' : 'Save market'}
            </button>
            {marketMsg && (
              <span className={`text-xs ${marketMsg === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>
                {marketMsg}
              </span>
            )}
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

        {/* Hard Delete — super admin only */}
        {admin?.isSuper && (
          <div className="mt-4 pt-4 border-t border-red-900/40">
            <button
              onClick={() => {
                setDeleteReason('wrong_user_type');
                setDeleteConfirmHandle('');
                setDeleteSmsMessage(defaultSmsForUser(user.profileType, user.phone ?? ''));
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              className="bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              Hard Delete Account
            </button>
          </div>
        )}
      </div>

      {/* Hard Delete Dialog */}
      {deleteOpen && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-neutral-900 border border-red-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-bold text-red-400 mb-1">Hard Delete Account</h2>
            <p className="text-xs text-neutral-400 mb-4">
              Permanently removes <span className="text-white font-medium">{data.user.displayName || data.user.handle}</span> from Clerk and Neon.
              Blocked if any ride history exists.
            </p>

            {/* Reason */}
            <label className="block text-xs text-neutral-400 mb-1">Reason</label>
            <select
              value={deleteReason}
              onChange={(e) => {
                const r = e.target.value as DeleteReason;
                setDeleteReason(r);
                if (r === 'wrong_user_type') {
                  setDeleteSmsMessage(defaultSmsForUser(data.user.profileType, data.user.phone ?? ''));
                }
              }}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white mb-4"
            >
              {DELETE_REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            {/* SMS preview / editor */}
            {DELETE_REASONS.find(r => r.value === deleteReason)?.sendsSms ? (
              <div className="mb-4">
                <label className="block text-xs text-neutral-400 mb-1">
                  SMS to send{data.user.phone ? ` → ${data.user.phone}` : ' (no phone on file — SMS will be skipped)'}
                </label>
                <textarea
                  rows={4}
                  maxLength={155}
                  value={deleteSmsMessage}
                  onChange={(e) => setDeleteSmsMessage(e.target.value.slice(0, 155))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white resize-none"
                />
                <div className="flex justify-between mt-1">
                  <span className={`text-[10px] ${deleteSmsMessage.length > 140 ? 'text-yellow-400' : 'text-neutral-600'}`}>
                    {deleteSmsMessage.length}/155
                  </span>
                  {!data.user.phone && (
                    <span className="text-[10px] text-yellow-500">No phone — SMS will not be sent</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-neutral-500 mb-4">No SMS will be sent for this reason.</p>
            )}

            {/* Confirmation */}
            <label className="block text-xs text-neutral-400 mb-1">
              Type <span className="text-white font-mono">{data.user.handle || data.user.displayName}</span> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmHandle}
              onChange={(e) => setDeleteConfirmHandle(e.target.value)}
              placeholder={data.user.handle || data.user.displayName}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white mb-4"
            />

            {deleteError && (
              <p className="text-xs text-red-400 mb-3">{deleteError}</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleteLoading}
                className="text-xs text-neutral-400 hover:text-white transition-colors px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                disabled={deleteLoading || deleteConfirmHandle !== (data.user.handle || data.user.displayName)}
                onClick={async () => {
                  setDeleteLoading(true);
                  setDeleteError(null);
                  try {
                    const sendsSms = DELETE_REASONS.find(r => r.value === deleteReason)?.sendsSms;
                    const res = await fetch('/api/admin/users', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: data.user.id,
                        reason: deleteReason,
                        smsMessage: sendsSms ? deleteSmsMessage : undefined,
                      }),
                    });
                    const json = await res.json();
                    if (!res.ok) {
                      setDeleteError(json.error ?? 'Delete failed');
                    } else {
                      setDeleteOpen(false);
                      onBack();
                    }
                  } catch {
                    setDeleteError('Network error');
                  } finally {
                    setDeleteLoading(false);
                  }
                }}
                className="bg-red-700 hover:bg-red-600 disabled:bg-neutral-800 disabled:text-neutral-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                {deleteLoading ? 'Deleting…' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

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
