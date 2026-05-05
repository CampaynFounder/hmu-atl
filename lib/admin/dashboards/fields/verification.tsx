// Trust + payment-readiness fields. Common support workflow: "why can't this
// driver get paid?" or "why isn't this rider matching?"

import type { FieldDefinition } from './types';
import { FlagChip } from './renderers';

export const verificationFields: FieldDefinition[] = [
  {
    key: 'users.is_verified',
    label: 'Verified',
    category: 'Verification',
    description: 'Admin-verified flag on the users row.',
    applies_to: ['any'],
    render: 'flag',
    source: { kind: 'user_column', column: 'is_verified' },
    Render: ({ value }) => <FlagChip label="Verified" active={Boolean(value)} activeText="✓ verified" color="#4ade80" />,
  },
  {
    key: 'users.phone_present',
    label: 'Phone present',
    category: 'Verification',
    description: 'Whether any phone number is on file (users / driver / rider).',
    applies_to: ['any'],
    render: 'flag',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const [r] = await sql`
        SELECT (COALESCE(u.phone, dp.phone, rp.phone) IS NOT NULL) AS v
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.id = ${ctx.userId} LIMIT 1`;
      return Boolean(r?.v);
    } },
    Render: ({ value }) => <FlagChip label="Phone" active={Boolean(value)} activeText="set" color="#4ade80" />,
  },
  {
    key: 'driver.video_recorded',
    label: 'Video intro',
    category: 'Verification',
    description: 'Driver has a recorded intro video (manual review separate).',
    applies_to: ['driver'],
    render: 'flag',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const [r] = await sql`SELECT (video_url IS NOT NULL) AS v FROM driver_profiles WHERE user_id = ${ctx.userId} LIMIT 1`;
      return Boolean(r?.v);
    } },
    Render: ({ value }) => <FlagChip label="Video intro" active={Boolean(value)} activeText="recorded" color="#60a5fa" />,
  },
  {
    key: 'driver.stripe_onboarded',
    label: 'Stripe Connect',
    category: 'Verification',
    description: 'Driver completed Stripe Connect onboarding.',
    applies_to: ['driver'],
    render: 'flag',
    source: { kind: 'driver_column', column: 'stripe_onboarding_complete' },
    Render: ({ value }) => <FlagChip label="Stripe" active={Boolean(value)} activeText="onboarded" color="#4ade80" />,
  },
  {
    key: 'driver.payout_setup',
    label: 'Payout setup',
    category: 'Verification',
    description: 'Driver has completed payout setup (bank/debit/etc).',
    applies_to: ['driver'],
    render: 'flag',
    source: { kind: 'driver_column', column: 'payout_setup_complete' },
    Render: ({ value }) => <FlagChip label="Payout" active={Boolean(value)} activeText="ready" color="#4ade80" />,
  },
  {
    key: 'rider.payment_method_count',
    label: 'Payment methods',
    category: 'Verification',
    description: 'Saved card / Apple Pay / Cash App Pay count for this rider.',
    applies_to: ['rider'],
    render: 'stat',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const [r] = await sql`SELECT COUNT(*)::int AS v FROM rider_payment_methods WHERE rider_id = ${ctx.userId}`;
      return Number(r?.v ?? 0);
    } },
    Render: ({ value }) => {
      const n = Number(value ?? 0);
      return <FlagChip label="Payment methods" active={n > 0} activeText={`${n} on file`} color={n > 0 ? '#4ade80' : '#f87171'} />;
    },
  },
];
