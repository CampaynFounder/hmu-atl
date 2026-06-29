import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { getPlatformConfig, invalidatePlatformConfig } from '@/lib/platform-config/get';
import { PAYMENTS_DEFAULTS, type PaymentsConfig } from '@/lib/payments/config';

interface PricingModeRow {
  id: string;
  mode_key: string;
  display_name: string;
  description: string | null;
  enabled: boolean;
  is_default_global: boolean;
  hides_subscription: boolean;
  config: unknown;
  updated_at: string;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const modes = await sql`
    SELECT id, mode_key, display_name, description, enabled,
           is_default_global, hides_subscription, config, updated_at
    FROM pricing_modes
    ORDER BY is_default_global DESC, mode_key ASC
  `;

  return NextResponse.json({
    modes: (modes as PricingModeRow[]).map((m) => ({
      id: m.id,
      modeKey: m.mode_key,
      displayName: m.display_name,
      description: m.description,
      enabled: m.enabled,
      isDefaultGlobal: m.is_default_global,
      hidesSubscription: m.hides_subscription,
      config: m.config,
      updatedAt: m.updated_at,
    })),
  });
}

// PATCH — update a single mode by mode_key. Setting isDefaultGlobal=true
// transactionally clears the flag on every other mode (the partial unique
// index on pricing_modes(is_default_global) WHERE TRUE enforces this anyway,
// but doing it ourselves keeps the error messages clear).
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await req.json() as {
    modeKey: string;
    enabled?: boolean;
    isDefaultGlobal?: boolean;
    hidesSubscription?: boolean;
    config?: Record<string, unknown>;
  };

  if (!body.modeKey) {
    return NextResponse.json({ error: 'modeKey required' }, { status: 400 });
  }

  // Sanity-check config when present — must be a plain object (we store as jsonb).
  if (body.config !== undefined && (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config))) {
    return NextResponse.json({ error: 'config must be a JSON object' }, { status: 400 });
  }

  // Per-mode required-field validation. Defaults exist in code as a safety net,
  // but admin-supplied config must be complete and in-range.
  if (body.config !== undefined) {
    const validationError = validateConfigForMode(body.modeKey, body.config);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  if (body.isDefaultGlobal === true) {
    await sql`UPDATE pricing_modes SET is_default_global = FALSE WHERE is_default_global = TRUE AND mode_key <> ${body.modeKey}`;
  }

  // Build a single-pass UPDATE that only touches the fields the caller sent.
  const updated = await sql`
    UPDATE pricing_modes
    SET
      enabled = COALESCE(${body.enabled ?? null}::boolean, enabled),
      is_default_global = COALESCE(${body.isDefaultGlobal ?? null}::boolean, is_default_global),
      hides_subscription = COALESCE(${body.hidesSubscription ?? null}::boolean, hides_subscription),
      config = COALESCE(${body.config !== undefined ? JSON.stringify(body.config) : null}::jsonb, config),
      updated_at = NOW(),
      updated_by = ${admin.id}
    WHERE mode_key = ${body.modeKey}
    RETURNING id, mode_key, enabled, is_default_global, hides_subscription, config, updated_at
  `;

  if (!updated.length) {
    return NextResponse.json({ error: 'mode not found' }, { status: 404 });
  }

  // Source-of-truth sync: the capture strategy reads deposit-only economics from
  // payments:global.depositOnly (via getPaymentsConfig), NOT pricing_modes.config.
  // So when an admin edits the deposit-only fee fields here, mirror the
  // money-affecting fields into payments:global so the two stores can never drift
  // (and the fee/floor/stripe-bearer changes actually take effect at capture).
  if (body.modeKey === 'deposit_only' && body.config) {
    await syncDepositOnlyToPaymentsGlobal(body.config, admin.id);
  }

  const row = updated[0] as PricingModeRow;
  return NextResponse.json({
    mode: {
      id: row.id,
      modeKey: row.mode_key,
      enabled: row.enabled,
      isDefaultGlobal: row.is_default_global,
      hidesSubscription: row.hides_subscription,
      config: row.config,
      updatedAt: row.updated_at,
    },
  });
}

function validateConfigForMode(modeKey: string, config: Record<string, unknown>): string | null {
  if (modeKey === 'deposit_only') return validateDepositOnly(config);
  if (modeKey === 'legacy_full_fare') {
    return Object.keys(config).length > 0
      ? 'legacy_full_fare has no mode-level config; tune Pricing Config + Hold Policy instead'
      : null;
  }
  return null;
}

function validateDepositOnly(c: Record<string, unknown>): string | null {
  const required = [
    'feeFloorCents',
    'feePercent',
    'depositMin',
    'depositIncrement',
    'depositMaxPctOfFare',
    'noShowDriverPct',
    'depositRule',
  ] as const;
  for (const k of required) {
    if (c[k] === undefined || c[k] === null || c[k] === '') {
      return `deposit_only.${k} is required`;
    }
  }
  const num = (k: string) => (typeof c[k] === 'number' ? (c[k] as number) : NaN);
  if (!Number.isFinite(num('feeFloorCents')) || num('feeFloorCents') < 0 || num('feeFloorCents') > 100000)
    return 'deposit_only.feeFloorCents must be 0–100000 (cents)';
  if (!Number.isFinite(num('feePercent')) || num('feePercent') < 0 || num('feePercent') > 1)
    return 'deposit_only.feePercent must be 0–1';
  if (!Number.isFinite(num('depositMin')) || num('depositMin') <= 0 || num('depositMin') > 1000)
    return 'deposit_only.depositMin must be > 0 and ≤ 1000';
  if (!Number.isFinite(num('depositIncrement')) || num('depositIncrement') <= 0 || num('depositIncrement') > 100)
    return 'deposit_only.depositIncrement must be > 0 and ≤ 100';
  if (!Number.isFinite(num('depositMaxPctOfFare')) || num('depositMaxPctOfFare') <= 0 || num('depositMaxPctOfFare') > 1)
    return 'deposit_only.depositMaxPctOfFare must be > 0 and ≤ 1';
  if (!Number.isFinite(num('noShowDriverPct')) || num('noShowDriverPct') < 0 || num('noShowDriverPct') > 1)
    return 'deposit_only.noShowDriverPct must be 0–1';
  if (!['rider_select', 'distance_band', 'percent_of_fare'].includes(c.depositRule as string))
    return 'deposit_only.depositRule must be one of rider_select | distance_band | percent_of_fare';
  if (c.stripeFeeBearer !== undefined && !['platform', 'driver'].includes(c.stripeFeeBearer as string))
    return 'deposit_only.stripeFeeBearer must be platform | driver';
  return null;
}

// Mirror the money-affecting deposit-only fields into payments:global.depositOnly
// (the store the capture strategy actually reads). Best-effort: a sync failure
// never blocks the pricing_modes write — it just logs.
async function syncDepositOnlyToPaymentsGlobal(config: Record<string, unknown>, adminId: string): Promise<void> {
  try {
    const current = await getPlatformConfig<PaymentsConfig & Record<string, unknown>>(
      'payments:global',
      PAYMENTS_DEFAULTS as PaymentsConfig & Record<string, unknown>,
    );
    const num = (k: string, fb: number) => (typeof config[k] === 'number' ? (config[k] as number) : fb);
    const next: PaymentsConfig = {
      ...current,
      depositOnly: {
        ...current.depositOnly,
        feeFloorCents: num('feeFloorCents', current.depositOnly.feeFloorCents),
        feePercent: num('feePercent', current.depositOnly.feePercent),
        depositMin: num('depositMin', current.depositOnly.depositMin),
        depositIncrement: num('depositIncrement', current.depositOnly.depositIncrement),
        depositMaxPctOfFare: num('depositMaxPctOfFare', current.depositOnly.depositMaxPctOfFare),
        extrasFeePercent: num('extrasFeePercent', current.depositOnly.extrasFeePercent),
        stripeFeeBearer: config.stripeFeeBearer === 'driver' ? 'driver' : 'platform',
      },
    };
    await sql`
      INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
      VALUES ('payments:global', ${JSON.stringify(next)}::jsonb, ${adminId}, NOW())
      ON CONFLICT (config_key) DO UPDATE SET
        config_value = EXCLUDED.config_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
    `;
    invalidatePlatformConfig('payments:global');
  } catch (e) {
    console.error('[pricing-modes] payments:global deposit-only sync failed:', e);
  }
}
