// /api/admin/growth/targets — acquisition target CRUD.
// Targets live in a single platform_config row keyed `growth.targets` whose
// config_value is { targets: GrowthTarget[] }. We hydrate the row, mutate the
// array, write it back atomically. Pace math is computed by the GET handler so
// the UI just renders, no client-side date arithmetic.
//
// GET    → list with computed pace + actual progress for each target
// POST   → create one (returns the created target)
// DELETE → remove by id (?id=)
//
// Permissions: any admin can read; only roles with monitor.liveops.edit (or super)
// can mutate. We borrow the LiveOps bucket because acquisition targets are an
// executive-monitor concern — when growth gets its own permission scope we'll swap.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';
import { randomUUID } from 'node:crypto';

const CONFIG_KEY = 'growth.targets';

type GrowthTarget = {
  id: string;
  marketId: string | null;       // null = all markets combined
  type: 'driver' | 'rider';
  count: number;                 // signups required by deadline (counted from createdAt)
  deadline: string;              // YYYY-MM-DD (interpreted as end of that day UTC)
  createdAt: string;             // ISO string
  label?: string;                // optional admin-supplied note ("Spring push", etc.)
  campaignName?: string;         // ad campaign tag — e.g. "Spring Push - Decatur"
  metaSpend?: number;            // dollars spent on Meta (FB/IG) ads. 0 = not running.
  googleSpend?: number;          // dollars spent on Google ads. 0 = not running.
};

type StoredTargets = { targets: GrowthTarget[] };

// Spend numbers are dollars (not cents) — admins type "$1,250" mentally so the
// UI takes whole dollars too. 0 is a legitimate value: "we're not running
// Google ads right now" should NOT be treated as missing data, it should be
// treated as a tracked $0. undefined is still allowed for back-compat with
// pre-spend targets.
function validateSpend(body: { metaSpend?: unknown; googleSpend?: unknown }):
  | { metaSpend: number; googleSpend: number }
  | { error: string }
{
  const parse = (raw: unknown, label: string): number | { error: string } => {
    if (raw === undefined || raw === null || raw === '') return 0;
    const n = Number(raw);
    if (!Number.isFinite(n)) return { error: `${label} must be a number` };
    if (n < 0) return { error: `${label} cannot be negative` };
    if (n > 10_000_000) return { error: `${label} is too large` };
    return Math.round(n * 100) / 100;
  };
  const meta = parse(body.metaSpend, 'metaSpend');
  if (typeof meta !== 'number') return meta;
  const google = parse(body.googleSpend, 'googleSpend');
  if (typeof google !== 'number') return google;
  return { metaSpend: meta, googleSpend: google };
}

async function readTargets(): Promise<GrowthTarget[]> {
  const rows = (await sql`
    SELECT config_value FROM platform_config WHERE config_key = ${CONFIG_KEY} LIMIT 1
  `) as Array<{ config_value: StoredTargets }>;
  return rows[0]?.config_value?.targets ?? [];
}

async function writeTargets(targets: GrowthTarget[], adminId: string) {
  const json = JSON.stringify({ targets });
  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${CONFIG_KEY}, ${json}::jsonb, ${adminId}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by   = EXCLUDED.updated_by,
      updated_at   = NOW()
  `;
  invalidatePlatformConfig(CONFIG_KEY);
}

// Pace: how many signups have happened since target was created, vs how many we
// "should" have at this point on a linear path to the deadline.
async function decorateWithPace(targets: GrowthTarget[]) {
  if (targets.length === 0) return [];
  const now = Date.now();

  return Promise.all(
    targets.map(async (t) => {
      const startMs = new Date(t.createdAt).getTime();
      const endMs = new Date(`${t.deadline}T23:59:59Z`).getTime();
      const totalDays = Math.max(1, (endMs - startMs) / 86_400_000);
      const daysElapsed = Math.max(0, Math.min(totalDays, (now - startMs) / 86_400_000));
      const daysRemaining = Math.max(0, (endMs - now) / 86_400_000);

      const profileType = t.type;
      const rows = (await sql`
        SELECT COUNT(*)::int AS c
        FROM users
        WHERE profile_type = ${profileType}
          AND created_at >= ${t.createdAt}::timestamptz
          AND (${t.marketId}::uuid IS NULL OR market_id = ${t.marketId}::uuid)
      `) as Array<{ c: number }>;
      const actual = rows[0]?.c ?? 0;

      const expectedNow = Math.round((daysElapsed / totalDays) * t.count);
      const requiredPerDayRemaining =
        daysRemaining > 0 ? Math.max(0, (t.count - actual) / daysRemaining) : 0;
      const onTrack = actual >= expectedNow;
      const pctComplete = Math.min(100, Math.round((actual / t.count) * 100));
      const projectedAtDeadline =
        daysElapsed > 0 ? Math.round((actual / daysElapsed) * totalDays) : 0;

      // Spend + CAC. Blended only — we don't yet attribute signups per channel
      // at the user level (utm_source on user_attribution will let us in v2).
      // Math is null-safe: missing spend or zero signups means "not enough data
      // to compute" rather than a misleading $0 or $Infinity.
      const metaSpend = Math.max(0, Number(t.metaSpend ?? 0));
      const googleSpend = Math.max(0, Number(t.googleSpend ?? 0));
      const totalSpend = metaSpend + googleSpend;
      const blendedCac = actual > 0 ? totalSpend / actual : null;
      const remainingSignups = Math.max(0, t.count - actual);
      const requiredAdditionalSpend =
        blendedCac !== null ? Math.round(blendedCac * remainingSignups * 100) / 100 : null;

      return {
        ...t,
        actual,
        expectedNow,
        requiredPerDayRemaining: Math.round(requiredPerDayRemaining * 10) / 10,
        onTrack,
        pctComplete,
        daysRemaining: Math.ceil(daysRemaining),
        projectedAtDeadline,
        metaSpend,
        googleSpend,
        totalSpend,
        blendedCac: blendedCac !== null ? Math.round(blendedCac * 100) / 100 : null,
        requiredAdditionalSpend,
        remainingSignups,
      };
    }),
  );
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const targets = await readTargets();
  const decorated = await decorateWithPace(targets);
  return NextResponse.json({ targets: decorated });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'monitor.liveops.edit')) return unauthorizedResponse();

  const body = await req.json().catch(() => ({})) as Partial<GrowthTarget>;
  const type = body.type;
  const count = Number(body.count);
  const deadline = body.deadline;
  const marketId = body.marketId ?? null;
  const label = body.label?.trim().slice(0, 80) || undefined;
  const campaignName = body.campaignName?.trim().slice(0, 80) || undefined;

  if (type !== 'driver' && type !== 'rider') {
    return NextResponse.json({ error: 'type must be driver or rider' }, { status: 400 });
  }
  if (!Number.isFinite(count) || count <= 0 || count > 1_000_000) {
    return NextResponse.json({ error: 'count must be a positive integer' }, { status: 400 });
  }
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return NextResponse.json({ error: 'deadline must be YYYY-MM-DD' }, { status: 400 });
  }
  if (new Date(`${deadline}T23:59:59Z`).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'deadline must be in the future' }, { status: 400 });
  }

  const spendValidation = validateSpend(body);
  if ('error' in spendValidation) {
    return NextResponse.json({ error: spendValidation.error }, { status: 400 });
  }

  const target: GrowthTarget = {
    id: randomUUID(),
    marketId,
    type,
    count: Math.round(count),
    deadline,
    createdAt: new Date().toISOString(),
    label,
    campaignName,
    metaSpend: spendValidation.metaSpend,
    googleSpend: spendValidation.googleSpend,
  };

  const existing = await readTargets();
  const next = [...existing, target];
  await writeTargets(next, admin.id);
  await logAdminAction(admin.id, 'growth_target_create', 'platform_config', CONFIG_KEY, { target });

  const [decorated] = await decorateWithPace([target]);
  return NextResponse.json({ target: decorated });
}

// PATCH — update a target in place. Used to log spend as a campaign runs
// (admin types "we spent another $200 on Meta this week", saves). We deliberately
// only allow editing fields that change over a campaign's life: spend, campaign
// name, label. Type/count/deadline/market are immutable — if those need to
// change, delete and recreate so historical pace math stays clean.
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'monitor.liveops.edit')) return unauthorizedResponse();

  const body = await req.json().catch(() => ({})) as Partial<GrowthTarget> & { id?: string };
  const id = body.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = await readTargets();
  const idx = existing.findIndex((t) => t.id === id);
  if (idx === -1) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const spendValidation = validateSpend(body);
  if ('error' in spendValidation) {
    return NextResponse.json({ error: spendValidation.error }, { status: 400 });
  }

  const updated: GrowthTarget = {
    ...existing[idx],
    label: body.label !== undefined ? (body.label?.trim().slice(0, 80) || undefined) : existing[idx].label,
    campaignName: body.campaignName !== undefined
      ? (body.campaignName?.trim().slice(0, 80) || undefined)
      : existing[idx].campaignName,
    metaSpend: spendValidation.metaSpend,
    googleSpend: spendValidation.googleSpend,
  };

  const next = [...existing];
  next[idx] = updated;
  await writeTargets(next, admin.id);
  await logAdminAction(admin.id, 'growth_target_update', 'platform_config', CONFIG_KEY, {
    id, before: existing[idx], after: updated,
  });

  const [decorated] = await decorateWithPace([updated]);
  return NextResponse.json({ target: decorated });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'monitor.liveops.edit')) return unauthorizedResponse();

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = await readTargets();
  const removed = existing.find((t) => t.id === id);
  if (!removed) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const next = existing.filter((t) => t.id !== id);
  await writeTargets(next, admin.id);
  await logAdminAction(admin.id, 'growth_target_delete', 'platform_config', CONFIG_KEY, { removed });

  return NextResponse.json({ ok: true });
}
