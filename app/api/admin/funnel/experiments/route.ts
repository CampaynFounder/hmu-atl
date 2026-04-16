import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';

// GET: List experiments
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = request.nextUrl.searchParams.get('market_id');
  const status = request.nextUrl.searchParams.get('status');

  let experiments;
  if (marketId && status) {
    experiments = await sql`
      SELECT ce.*, cz.zone_key, cz.page_slug, cz.display_name as zone_display_name
      FROM content_experiments ce
      JOIN content_zones cz ON cz.id = ce.zone_id
      WHERE ce.market_id = ${marketId} AND ce.status = ${status}
      ORDER BY ce.created_at DESC
    `;
  } else if (marketId) {
    experiments = await sql`
      SELECT ce.*, cz.zone_key, cz.page_slug, cz.display_name as zone_display_name
      FROM content_experiments ce
      JOIN content_zones cz ON cz.id = ce.zone_id
      WHERE ce.market_id = ${marketId}
      ORDER BY ce.created_at DESC
    `;
  } else {
    experiments = await sql`
      SELECT ce.*, cz.zone_key, cz.page_slug, cz.display_name as zone_display_name
      FROM content_experiments ce
      JOIN content_zones cz ON cz.id = ce.zone_id
      ORDER BY ce.created_at DESC
    `;
  }

  return NextResponse.json({ experiments });
}

// POST: Create an experiment
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await request.json();
  const { name, zone_id, market_id, variant_ids, goal_event, goal_metric, sample_size_target } = body;

  if (!name || !zone_id || !market_id || !variant_ids?.length || !goal_event) {
    return NextResponse.json({ error: 'name, zone_id, market_id, variant_ids, and goal_event required' }, { status: 400 });
  }

  const rows = await sql`
    INSERT INTO content_experiments (name, zone_id, market_id, variant_ids, goal_event, goal_metric, sample_size_target, created_by)
    VALUES (${name}, ${zone_id}, ${market_id}, ${variant_ids}, ${goal_event}, ${goal_metric || 'conversion_rate'}, ${sample_size_target || 1000}, ${admin.id})
    RETURNING id
  `;

  await logAdminAction(admin.id, 'cms_experiment_created', 'content_experiment', rows[0].id as string, { name, goal_event });

  return NextResponse.json({ id: rows[0].id });
}

// PATCH: Update experiment status (start, pause, complete, declare winner)
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await request.json();
  const { experiment_id, status, winner_variant_id } = body;

  if (!experiment_id || !status) {
    return NextResponse.json({ error: 'experiment_id and status required' }, { status: 400 });
  }

  if (!['draft', 'running', 'paused', 'completed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status };
  if (status === 'running') updates.started_at = new Date().toISOString();
  if (status === 'completed') updates.ended_at = new Date().toISOString();
  if (winner_variant_id) updates.winner_variant_id = winner_variant_id;

  await sql`
    UPDATE content_experiments
    SET status = ${status},
        started_at = ${status === 'running' ? new Date().toISOString() : null},
        ended_at = ${status === 'completed' ? new Date().toISOString() : null},
        winner_variant_id = ${winner_variant_id || null}
    WHERE id = ${experiment_id}
  `;

  await logAdminAction(admin.id, `cms_experiment_${status}`, 'content_experiment', experiment_id, { winner_variant_id });

  return NextResponse.json({ ok: true });
}
