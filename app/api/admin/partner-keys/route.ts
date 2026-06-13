// Admin: manage partner API accounts + keys.
//   GET                         → list partners (+ their key prefixes; never secrets)
//   POST  { action: 'create_partner', ... }   → create an api_partners row
//   POST  { action: 'mint_key', partner_id, mode } → mint a key (returns plaintext ONCE)
//   POST  { action: 'revoke_key', key_id }    → revoke a key
//   PATCH { partner_id, ...fields }            → update a partner
//
// Super-admin only (controls live API credentials + money config).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { sha256Hex, randomToken } from '@/lib/partner/crypto';

export const runtime = 'nodejs';

const VALID_SCOPES = ['drivers:read', 'quotes:read', 'bookings:write', 'blasts:write'];
const VALID_PAYER = ['vendor_funded', 'pass_through'];

function sanitizeScopes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((s): s is string => typeof s === 'string' && VALID_SCOPES.includes(s));
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin || !hasPermission(admin, 'admin.partnerkeys')) return unauthorizedResponse();

  const rows = await sql`
    SELECT p.id, p.name, p.payer_mode, p.markup_bps, p.market_ids, p.scopes,
           p.status, p.rate_limit_per_min,
           p.webhook_url,
           (p.vendor_stripe_customer_id IS NOT NULL) AS has_vendor_customer,
           p.created_at,
           (
             SELECT COALESCE(json_agg(json_build_object(
               'id', k.id, 'mode', k.mode, 'prefix', k.key_prefix,
               'revoked', k.revoked_at IS NOT NULL,
               'lastUsed', k.last_used_at
             ) ORDER BY k.created_at DESC), '[]')
             FROM api_keys k WHERE k.partner_id = p.id
           ) AS keys
    FROM api_partners p
    ORDER BY p.created_at DESC
  `;
  return NextResponse.json({ partners: rows });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !hasPermission(admin, 'admin.partnerkeys')) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;

  if (action === 'create_partner') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const payerMode = VALID_PAYER.includes(body.payer_mode as string) ? (body.payer_mode as string) : 'vendor_funded';
    const scopes = sanitizeScopes(body.scopes);
    const rows = await sql`
      INSERT INTO api_partners (name, payer_mode, scopes, market_ids, rate_limit_per_min, status)
      VALUES (${name}, ${payerMode}, ${scopes}, '{}', 120, 'active')
      RETURNING id
    `;
    const id = (rows[0] as { id: string }).id;
    await logAdminAction(admin.id, 'partner_create', 'api_partners', id, { name, payerMode });
    return NextResponse.json({ id });
  }

  if (action === 'mint_key') {
    const partnerId = body.partner_id as string;
    if (!partnerId) return NextResponse.json({ error: 'partner_id is required' }, { status: 400 });
    const mode = body.mode === 'live' ? 'live' : 'test';
    const key = `hmu_${mode}_${randomToken(20)}`;
    const signingSecret = `whsec_${randomToken(24)}`;
    const keyHash = await sha256Hex(key);
    const prefix = key.slice(0, 16);
    await sql`
      INSERT INTO api_keys (partner_id, mode, key_prefix, key_hash, signing_secret)
      VALUES (${partnerId}, ${mode}, ${prefix}, ${keyHash}, ${signingSecret})
    `;
    await logAdminAction(admin.id, 'partner_mint_key', 'api_partners', partnerId, { mode, prefix });
    // Returned exactly once — the key is stored only as a hash.
    return NextResponse.json({ api_key: key, signing_secret: signingSecret, mode, prefix });
  }

  if (action === 'revoke_key') {
    const keyId = body.key_id as string;
    if (!keyId) return NextResponse.json({ error: 'key_id is required' }, { status: 400 });
    await sql`UPDATE api_keys SET revoked_at = NOW() WHERE id = ${keyId}`;
    await logAdminAction(admin.id, 'partner_revoke_key', 'api_keys', keyId, {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !hasPermission(admin, 'admin.partnerkeys')) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const partnerId = body.partner_id as string;
  if (!partnerId) return NextResponse.json({ error: 'partner_id is required' }, { status: 400 });

  // Each field updated only when present (COALESCE keeps the existing value otherwise).
  const scopes = body.scopes !== undefined ? sanitizeScopes(body.scopes) : null;
  const status = body.status === 'active' || body.status === 'suspended' ? body.status : null;
  const payerMode = VALID_PAYER.includes(body.payer_mode as string) ? (body.payer_mode as string) : null;
  const webhookUrl = body.webhook_url === null ? '' : (typeof body.webhook_url === 'string' ? body.webhook_url : null);
  const vendorCustomer = body.vendor_stripe_customer_id === null ? '' : (typeof body.vendor_stripe_customer_id === 'string' ? body.vendor_stripe_customer_id : null);
  const marketIds = Array.isArray(body.market_ids) ? (body.market_ids as string[]) : null;
  const markupBps = typeof body.markup_bps === 'number' ? body.markup_bps : null;
  const rateLimit = typeof body.rate_limit_per_min === 'number' ? body.rate_limit_per_min : null;

  const rows = await sql`
    UPDATE api_partners SET
      scopes = COALESCE(${scopes}::text[], scopes),
      status = COALESCE(${status}, status),
      payer_mode = COALESCE(${payerMode}, payer_mode),
      webhook_url = CASE WHEN ${webhookUrl}::text IS NULL THEN webhook_url
                         WHEN ${webhookUrl} = '' THEN NULL ELSE ${webhookUrl} END,
      vendor_stripe_customer_id = CASE WHEN ${vendorCustomer}::text IS NULL THEN vendor_stripe_customer_id
                         WHEN ${vendorCustomer} = '' THEN NULL ELSE ${vendorCustomer} END,
      market_ids = COALESCE(${marketIds}::uuid[], market_ids),
      markup_bps = COALESCE(${markupBps}, markup_bps),
      rate_limit_per_min = COALESCE(${rateLimit}, rate_limit_per_min),
      updated_at = NOW()
    WHERE id = ${partnerId}
    RETURNING id
  `;
  if (!rows.length) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });

  // Auto-generate a webhook signing secret if a webhook_url was set and none exists.
  if (webhookUrl) {
    await sql`UPDATE api_partners SET webhook_secret = ${`whsec_${randomToken(24)}`}
              WHERE id = ${partnerId} AND (webhook_secret IS NULL OR webhook_secret = '')`;
  }

  await logAdminAction(admin.id, 'partner_update', 'api_partners', partnerId, {});
  return NextResponse.json({ ok: true });
}
