import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

const MAX_USERS_PER_CALL = 100;

interface BulkUpdates {
  /** When set, writes driver_profiles.cash_only for every selected driver. */
  cashOnly?: boolean;
  /** When set, writes driver_profiles.accepts_cash for every selected driver. */
  acceptsCash?: boolean;
  /** When set, replaces driver_profiles.area_slugs entirely (admin's selected
   *  market only — drivers in other markets are skipped). */
  areaSlugs?: string[];
  /** When set, writes driver_profiles.services_entire_market. */
  servicesEntireMarket?: boolean;
}

interface BulkBody {
  userIds: string[];
  updates: BulkUpdates;
  /** Admin's currently-selected market. Required when areaSlugs or
   *  servicesEntireMarket is in updates — area slugs are market-scoped. */
  marketId?: string;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  let body: BulkBody;
  try {
    body = (await req.json()) as BulkBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { userIds, updates, marketId } = body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: 'userIds is required (non-empty array)' }, { status: 400 });
  }
  if (userIds.length > MAX_USERS_PER_CALL) {
    return NextResponse.json(
      { error: `Cap is ${MAX_USERS_PER_CALL} users per call` },
      { status: 400 },
    );
  }
  if (!updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'updates object is required' }, { status: 400 });
  }

  const touchesCash = updates.cashOnly !== undefined || updates.acceptsCash !== undefined;
  const touchesAreas = updates.areaSlugs !== undefined || updates.servicesEntireMarket !== undefined;

  if (!touchesCash && !touchesAreas) {
    return NextResponse.json({ error: 'updates must specify at least one field' }, { status: 400 });
  }

  if (touchesAreas && !marketId) {
    return NextResponse.json(
      { error: 'marketId is required when updating area_slugs or services_entire_market' },
      { status: 400 },
    );
  }

  // Validate slugs against market_areas (if any). An empty array is valid —
  // it means "no specific areas, fall back to services_entire_market."
  if (Array.isArray(updates.areaSlugs) && updates.areaSlugs.length > 0) {
    const validRows = await sql`
      SELECT slug FROM market_areas
      WHERE market_id = ${marketId} AND is_active = TRUE AND slug = ANY(${updates.areaSlugs})
    `;
    const validSlugs = new Set((validRows as { slug: string }[]).map((r) => r.slug));
    const invalid = updates.areaSlugs.filter((s) => !validSlugs.has(s));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown area slugs for this market: ${invalid.join(', ')}` },
        { status: 400 },
      );
    }
  }

  // Resolve which selected user IDs are drivers (and, when scoping to a
  // market, are in that market). Anything else is reported as skipped.
  const driverRows = await sql`
    SELECT u.id, u.market_id
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.id = ANY(${userIds}::uuid[])
      AND u.profile_type IN ('driver', 'both')
  `;
  const drivers = driverRows as { id: string; market_id: string | null }[];

  const inScopeIds = touchesAreas
    ? drivers.filter((d) => d.market_id === marketId).map((d) => d.id)
    : drivers.map((d) => d.id);

  const skipped = {
    nonDriver: userIds.filter((id) => !drivers.some((d) => d.id === id)),
    wrongMarket: touchesAreas
      ? drivers.filter((d) => d.market_id !== marketId).map((d) => d.id)
      : [],
  };

  if (inScopeIds.length === 0) {
    return NextResponse.json({
      updatedCount: 0,
      skipped,
      message: 'No in-scope users to update.',
    });
  }

  // Apply updates in a single statement per affected column. Each COALESCE
  // ensures fields not in the request keep their existing values.
  await sql`
    UPDATE driver_profiles SET
      cash_only = COALESCE(${updates.cashOnly ?? null}::boolean, cash_only),
      accepts_cash = COALESCE(${updates.acceptsCash ?? null}::boolean, accepts_cash),
      area_slugs = CASE
        WHEN ${updates.areaSlugs !== undefined}::boolean
        THEN ${updates.areaSlugs ?? []}::text[]
        ELSE area_slugs
      END,
      services_entire_market = COALESCE(${updates.servicesEntireMarket ?? null}::boolean, services_entire_market)
    WHERE user_id = ANY(${inScopeIds}::uuid[])
  `;

  return NextResponse.json({
    updatedCount: inScopeIds.length,
    skipped,
  });
}
