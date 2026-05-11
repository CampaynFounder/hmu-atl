// GET  → return the full chat_booking config row
// PATCH → accepts a partial update. Shallow merge of `enabled`,
//         deep merge of `generative` / `deterministic` objects. Does NOT
//         touch `driver_overrides` — those go through /drivers endpoint.
// Cache is invalidated so the next request sees the fresh config immediately
// (important for the admin test playground).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';
import { getChatBookingConfig } from '@/lib/chat/config';

const ALLOWED_TOOL_KEYS = new Set([
  'extract_booking', 'confirm_details', 'calculate_route', 'compare_pricing', 'analyze_sentiment',
]);

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.chatbooking.view')) return unauthorizedResponse();
  const config = await getChatBookingConfig();
  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.chatbooking.edit')) return unauthorizedResponse();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'bad_body' }, { status: 400 });

  const current = await getChatBookingConfig();
  const next = { ...current };

  if (typeof body.enabled === 'boolean') next.enabled = body.enabled;

  if (body.generative && typeof body.generative === 'object') {
    const g = body.generative as Record<string, unknown>;
    next.generative = { ...current.generative };
    if (typeof g.enabled === 'boolean') next.generative.enabled = g.enabled;
    if (typeof g.model === 'string') next.generative.model = g.model;
    if (typeof g.temperature === 'number') {
      next.generative.temperature = Math.max(0, Math.min(2, g.temperature));
    }
    if (g.system_prompt_override === null || typeof g.system_prompt_override === 'string') {
      const trimmed = typeof g.system_prompt_override === 'string' ? g.system_prompt_override.trim() : null;
      next.generative.system_prompt_override = trimmed && trimmed.length > 0 ? trimmed : null;
    }
    if (g.tools_enabled && typeof g.tools_enabled === 'object') {
      next.generative.tools_enabled = { ...current.generative.tools_enabled };
      for (const [k, v] of Object.entries(g.tools_enabled)) {
        if (ALLOWED_TOOL_KEYS.has(k) && typeof v === 'boolean') {
          (next.generative.tools_enabled as Record<string, boolean>)[k] = v;
        }
      }
    }
  }

  if (body.deterministic && typeof body.deterministic === 'object') {
    const d = body.deterministic as Record<string, unknown>;
    next.deterministic = { ...current.deterministic };
    if (typeof d.enforce_min_price === 'boolean') next.deterministic.enforce_min_price = d.enforce_min_price;
    if (typeof d.require_payment_slot === 'boolean') next.deterministic.require_payment_slot = d.require_payment_slot;
    if (typeof d.buffer_minutes === 'number') {
      next.deterministic.buffer_minutes = Math.max(0, Math.min(120, Math.round(d.buffer_minutes)));
    }
    if (typeof d.re_resolve_time_from_text === 'boolean') next.deterministic.re_resolve_time_from_text = d.re_resolve_time_from_text;
  }

  await sql`
    UPDATE platform_config SET
      config_value = ${JSON.stringify(next)}::jsonb,
      updated_by = ${admin.clerk_id},
      updated_at = NOW()
    WHERE config_key = 'chat_booking'
  `;
  invalidatePlatformConfig('chat_booking');

  await logAdminAction(admin.id, 'chat_booking_config_update', 'platform_config', 'chat_booking', {
    enabled: next.enabled,
    generative_enabled: next.generative.enabled,
    model: next.generative.model,
  });

  return NextResponse.json({ config: next });
}
