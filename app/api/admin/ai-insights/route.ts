// POST /api/admin/ai-insights
// Super-admin only. Gathers recent operational data and feeds it to GPT-4o-mini
// to generate actionable insights across business health, pricing, fulfillment,
// and growth. This is the surface area for model-driven operations — future
// work can wire dynamic pricing and other levers directly to this endpoint.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin?.is_super) return unauthorized();

  const body = await req.json().catch(() => ({})) as {
    market?: string;
    days?: number;
  };
  const days = Math.min(Math.max(Number(body.days ?? 7), 1), 90);
  const marketSlug = body.market && body.market !== 'all' ? body.market : null;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  // ── Gather context data ───────────────────────────────────────────────────
  // Note: use null-check pattern for market filter (no sql fragment interpolation)

  const [rideStats, revenueStats, growthStats, safetyStats, errorStats] = await Promise.all([
    // Ride completion stats
    sql`
      SELECT
        COUNT(*) FILTER (WHERE r.status = 'completed')::int   AS completed,
        COUNT(*) FILTER (WHERE r.status = 'cancelled')::int   AS cancelled,
        COUNT(*) FILTER (WHERE r.status NOT IN ('completed','cancelled'))::int AS in_flight,
        COUNT(*)::int                                          AS total,
        ROUND(AVG(r.final_agreed_price)::numeric, 2)          AS avg_fare,
        ROUND(
          COUNT(*) FILTER (WHERE r.status = 'completed')::numeric /
          NULLIF(COUNT(*) FILTER (WHERE r.status IN ('completed','cancelled')), 0) * 100
        , 1) AS fulfillment_rate
      FROM rides r
      JOIN users u ON u.id = r.rider_id
      LEFT JOIN markets m ON m.id = u.market_id
      WHERE r.created_at > ${since}
        AND (${marketSlug}::text IS NULL OR m.slug = ${marketSlug})
    `,
    // Revenue
    sql`
      SELECT
        ROUND(COALESCE(SUM(r.final_agreed_price), 0)::numeric, 2)   AS gmv,
        ROUND(COALESCE(SUM(r.platform_fee_amount), 0)::numeric, 2)  AS platform_revenue,
        ROUND(COALESCE(SUM(r.stripe_fee_amount), 0)::numeric, 2)    AS stripe_fees,
        ROUND(COALESCE(SUM(r.driver_payout_amount), 0)::numeric, 2) AS driver_payouts,
        COUNT(*)::int                                                AS paid_rides
      FROM rides r
      JOIN users u ON u.id = r.rider_id
      LEFT JOIN markets m ON m.id = u.market_id
      WHERE r.created_at > ${since}
        AND r.status = 'completed'
        AND r.payment_captured = true
        AND (${marketSlug}::text IS NULL OR m.slug = ${marketSlug})
    `,
    // Growth
    sql`
      SELECT
        COUNT(*) FILTER (WHERE u.profile_type = 'rider')::int  AS new_riders,
        COUNT(*) FILTER (WHERE u.profile_type = 'driver')::int AS new_drivers
      FROM users u
      LEFT JOIN markets m ON m.id = u.market_id
      WHERE u.created_at > ${since}
        AND (${marketSlug}::text IS NULL OR m.slug = ${marketSlug})
    `,
    // Open safety events — correct table is ride_safety_events
    sql`
      SELECT COUNT(*)::int AS open_safety_events
      FROM ride_safety_events
      WHERE created_at > ${since} AND admin_resolved_at IS NULL
    `,
    // Ride errors (payment failures)
    sql`
      SELECT COUNT(*)::int AS payment_failures
      FROM rides
      WHERE created_at > ${since}
        AND status = 'ended'
        AND payment_captured = false
    `,
  ]);

  const context = {
    period_days: days,
    market: marketSlug ?? 'all',
    rides: rideStats[0],
    revenue: revenueStats[0],
    growth: growthStats[0],
    safety: safetyStats[0],
    errors: errorStats[0],
  };

  // ── Call model ────────────────────────────────────────────────────────────

  let insights: Record<string, unknown> = {};
  try {
    const res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        max_tokens: 800,
        messages: [
          {
            role: 'system',
            content: `You are an operations intelligence assistant for HMU ATL, a peer-to-peer ride platform in Metro Atlanta and expanding markets. Analyze the provided operational data and return a JSON object with exactly these keys:
- business_health: { score: 0-100, headline: string (max 12 words), summary: string (max 40 words), status: "healthy"|"caution"|"critical" }
- pricing: { recommendation: string (max 40 words), action: "increase"|"decrease"|"hold", confidence: "high"|"medium"|"low" }
- fulfillment: { rate_pct: number, headline: string (max 12 words), suggestion: string (max 40 words) }
- growth: { trend: "up"|"flat"|"down", headline: string (max 12 words), action: string (max 40 words) }
- errors: { severity: "none"|"low"|"medium"|"high", summary: string (max 30 words) }
Be specific, data-driven, and actionable. Reference the actual numbers in your response.`,
          },
          {
            role: 'user',
            content: `Operational data for the last ${days} day(s):\n${JSON.stringify(context, null, 2)}`,
          },
        ],
      }),
    });
    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? '{}';
    insights = JSON.parse(raw);
  } catch (e) {
    console.error('[ai-insights] OpenAI error:', e);
    insights = {
      business_health: { score: 0, headline: 'Analysis unavailable', summary: 'Could not reach AI service.', status: 'caution' },
      pricing: { recommendation: 'Unable to analyze pricing data.', action: 'hold', confidence: 'low' },
      fulfillment: { rate_pct: 0, headline: 'No data', suggestion: 'Check ride data availability.' },
      growth: { trend: 'flat', headline: 'No data', action: 'Review data pipeline.' },
      errors: { severity: 'none', summary: 'Error analysis unavailable.' },
    };
  }

  return NextResponse.json({ insights, context, generatedAt: new Date().toISOString() });
}
