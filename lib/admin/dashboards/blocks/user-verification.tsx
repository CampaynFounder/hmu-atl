// Block: user.verification
//
// Trust-and-payment readiness signal for the support workflow:
// - Phone present + users.is_verified
// - Video intro present (driver-only signal: have we recorded one?)
// - Stripe Connect onboarding state (drivers)
// - Payment method count (riders)
//
// Not marketAware — verification is per-user not per-market.

import { z } from 'zod';
import { sql } from '@/lib/db/client';
import type { BlockDefinition, BlockFetchContext } from './types';
import { BlockShell, StatGrid, Pill, EmptyState } from './_shell';

const configSchema = z.object({}).strict();
type Config = z.infer<typeof configSchema>;

interface VerificationData {
  profile_type: 'driver' | 'rider' | 'admin';
  phone_present: boolean;
  is_verified: boolean;
  video_url: string | null;
  // Driver-only fields
  stripe_onboarding_complete: boolean | null;
  payout_setup_complete: boolean | null;
  stripe_account_id: string | null;
  // Rider-only fields
  payment_method_count: number;
}

async function fetchVerification(ctx: BlockFetchContext): Promise<VerificationData> {
  if (!ctx.userId) throw new Error('user.verification requires userId');

  const rows = await sql`
    SELECT
      u.profile_type,
      COALESCE(u.phone, dp.phone, rp.phone) AS phone,
      COALESCE(u.is_verified, false) AS is_verified,
      COALESCE(dp.video_url, rp.video_url) AS video_url,
      dp.stripe_onboarding_complete,
      dp.payout_setup_complete,
      dp.stripe_account_id,
      (
        SELECT COUNT(*)
        FROM rider_payment_methods rpm
        WHERE rpm.rider_id = u.id
      ) AS payment_method_count
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
    WHERE u.id = ${ctx.userId}
    LIMIT 1
  `;
  if (!rows.length) throw new Error(`User ${ctx.userId} not found`);
  const r = rows[0];
  return {
    profile_type: r.profile_type as VerificationData['profile_type'],
    phone_present: Boolean(r.phone),
    is_verified: Boolean(r.is_verified),
    video_url: (r.video_url as string | null) ?? null,
    stripe_onboarding_complete: r.stripe_onboarding_complete as boolean | null,
    payout_setup_complete: r.payout_setup_complete as boolean | null,
    stripe_account_id: (r.stripe_account_id as string | null) ?? null,
    payment_method_count: Number(r.payment_method_count ?? 0),
  };
}

function VerificationComponent({ data }: { data: VerificationData }) {
  const isDriver = data.profile_type === 'driver';
  const isRider = data.profile_type === 'rider';

  const stats: Parameters<typeof StatGrid>[0]['stats'] = [
    { label: 'Phone', value: data.phone_present ? 'set' : 'missing', tone: data.phone_present ? 'good' : 'bad' },
    { label: 'Verified', value: data.is_verified ? 'yes' : 'no', tone: data.is_verified ? 'good' : 'bad' },
    { label: 'Video intro', value: data.video_url ? 'recorded' : '—', tone: data.video_url ? 'good' : undefined },
  ];
  if (isDriver) {
    const stripeReady = Boolean(data.stripe_onboarding_complete);
    const payoutReady = Boolean(data.payout_setup_complete);
    stats.push(
      { label: 'Stripe Connect', value: stripeReady ? 'onboarded' : data.stripe_account_id ? 'in progress' : 'not started', tone: stripeReady ? 'good' : 'bad' },
      { label: 'Payout setup', value: payoutReady ? 'ready' : 'not ready', tone: payoutReady ? 'good' : 'bad' },
    );
  }
  if (isRider) {
    stats.push({ label: 'Payment methods', value: data.payment_method_count, tone: data.payment_method_count > 0 ? 'good' : 'bad' });
  }

  return (
    <BlockShell title="Verification">
      <StatGrid cols={3} stats={stats} />
      {data.profile_type === 'admin' && (
        <div className="mt-3"><EmptyState>Admin user — verification fields don&apos;t apply.</EmptyState></div>
      )}
      {isDriver && !data.is_verified && data.video_url && (
        <div className="mt-3">
          <Pill color="#f59e0b" title="Video recorded but no admin review yet">
            ⚠ video pending review
          </Pill>
        </div>
      )}
    </BlockShell>
  );
}

export const userVerificationBlock: BlockDefinition<Config, VerificationData> = {
  key: 'user.verification',
  label: 'Verification',
  description: 'Phone, verification flag, video intro, Stripe Connect (drivers), payment method count (riders).',
  scope: 'user',
  marketAware: false,
  configSchema,
  defaultConfig: {},
  fetch: (ctx) => fetchVerification(ctx),
  Component: VerificationComponent,
};
