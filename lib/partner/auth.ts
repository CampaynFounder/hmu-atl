// Partner API authentication.
//
// Replaces the Clerk `auth()` call at the top of partner route handlers. A
// partner request must carry:
//   Authorization: Bearer <api key>          (e.g. hmu_live_…)
//   X-HMU-Signature: t=<unix>,v1=<hmac hex>   (HMAC-SHA256 of "<t>.<rawBody>")
//
// The signature follows the Stripe webhook pattern: it binds the request body
// and a timestamp so a leaked key alone can't be replayed against a tampered
// body, and stale requests (>5 min) are rejected.
//
// Usage in a route handler:
//   const rawBody = await req.text();           // '' for GET
//   const result = await authenticatePartner(req, rawBody, 'drivers:read');
//   if (!result.ok) return result.res;
//   const { partner } = result.ctx;

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { sha256Hex, hmacSha256Hex, timingSafeEqual } from '@/lib/partner/crypto';

// How far a request timestamp may drift from server time before we reject it.
const SIGNATURE_TOLERANCE_SECONDS = 300;

export type PartnerScope =
  | 'drivers:read'
  | 'quotes:read'
  | 'bookings:write'
  | 'blasts:write';

export interface PartnerContext {
  partner: {
    id: string;
    name: string;
    payerMode: 'pass_through' | 'vendor_funded';
    vendorStripeCustomerId: string | null;
    markupBps: number;
    marketIds: string[];
    webhookUrl: string | null;
    scopes: string[];
    status: string;
  };
  key: {
    id: string;
    mode: 'test' | 'live';
  };
}

export type PartnerAuthResult =
  | { ok: true; ctx: PartnerContext }
  | { ok: false; res: NextResponse };

function err(status: number, code: string, message: string): { ok: false; res: NextResponse } {
  return { ok: false, res: NextResponse.json({ error: code, message }, { status }) };
}

function fireAuditFailure(req: NextRequest, code: string): void {
  // Best-effort; never block or throw on the audit write.
  void sql`
    INSERT INTO api_audit_log (partner_id, endpoint, method, status, request_id)
    VALUES (NULL, ${req.nextUrl.pathname}, ${req.method}, ${code === 'rate_limited' ? 429 : 401}, ${code})
  `.catch(() => {});
}

function parseSignatureHeader(header: string | null): { t: number; v1: string } | null {
  if (!header) return null;
  let t: number | null = null;
  let v1: string | null = null;
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2).map((s) => s.trim());
    if (k === 't') t = Number(v);
    else if (k === 'v1') v1 = v;
  }
  if (t === null || !Number.isFinite(t) || !v1) return null;
  return { t, v1 };
}

export async function authenticatePartner(
  req: NextRequest,
  rawBody: string,
  requiredScope: PartnerScope,
): Promise<PartnerAuthResult> {
  // 1. Extract the Bearer API key.
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    fireAuditFailure(req, 'missing_key');
    return err(401, 'unauthorized', 'Missing Bearer API key');
  }
  const presentedKey = authHeader.slice('Bearer '.length).trim();
  if (!presentedKey) {
    fireAuditFailure(req, 'missing_key');
    return err(401, 'unauthorized', 'Missing Bearer API key');
  }

  // 2. Look up the key by its hash (the raw key is never stored).
  const keyHash = await sha256Hex(presentedKey);
  const rows = await sql`
    SELECT k.id AS key_id, k.mode, k.signing_secret, k.revoked_at,
           p.id AS partner_id, p.name, p.payer_mode, p.vendor_stripe_customer_id,
           p.markup_bps, p.market_ids, p.webhook_url, p.scopes,
           p.rate_limit_per_min, p.status
    FROM api_keys k
    JOIN api_partners p ON p.id = k.partner_id
    WHERE k.key_hash = ${keyHash}
    LIMIT 1
  `;
  const row = rows[0] as
    | {
        key_id: string;
        mode: 'test' | 'live';
        signing_secret: string;
        revoked_at: string | null;
        partner_id: string;
        name: string;
        payer_mode: 'pass_through' | 'vendor_funded';
        vendor_stripe_customer_id: string | null;
        markup_bps: number;
        market_ids: string[];
        webhook_url: string | null;
        scopes: string[];
        rate_limit_per_min: number;
        status: string;
      }
    | undefined;

  if (!row) {
    fireAuditFailure(req, 'invalid_key');
    return err(401, 'unauthorized', 'Invalid API key');
  }
  if (row.revoked_at) {
    fireAuditFailure(req, 'revoked_key');
    return err(401, 'unauthorized', 'API key has been revoked');
  }
  if (row.status !== 'active') {
    fireAuditFailure(req, 'partner_suspended');
    return err(403, 'forbidden', 'Partner account is suspended');
  }

  // 3. Verify the request signature (binds body + timestamp to the key).
  const sig = parseSignatureHeader(req.headers.get('x-hmu-signature'));
  if (!sig) {
    fireAuditFailure(req, 'missing_signature');
    return err(401, 'unauthorized', 'Missing or malformed X-HMU-Signature header');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - sig.t) > SIGNATURE_TOLERANCE_SECONDS) {
    fireAuditFailure(req, 'stale_signature');
    return err(401, 'unauthorized', 'Signature timestamp outside tolerance');
  }
  const expected = await hmacSha256Hex(row.signing_secret, `${sig.t}.${rawBody}`);
  if (!timingSafeEqual(expected, sig.v1)) {
    fireAuditFailure(req, 'bad_signature');
    return err(401, 'unauthorized', 'Signature verification failed');
  }

  // 4. Scope check.
  const scopes = Array.isArray(row.scopes) ? row.scopes : [];
  if (!scopes.includes(requiredScope) && !scopes.includes('*')) {
    fireAuditFailure(req, 'insufficient_scope');
    return err(403, 'forbidden', `API key lacks required scope: ${requiredScope}`);
  }

  // 5. Per-partner rate limit (Neon-backed rolling window).
  const rl = await checkRateLimit({
    key: `partner:${row.partner_id}:min`,
    limit: row.rate_limit_per_min,
    windowSeconds: 60,
  });
  if (!rl.ok) {
    fireAuditFailure(req, 'rate_limited');
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'rate_limited', message: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      ),
    };
  }

  // 6. Touch last_used_at (best-effort).
  void sql`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${row.key_id}`.catch(() => {});

  return {
    ok: true,
    ctx: {
      partner: {
        id: row.partner_id,
        name: row.name,
        payerMode: row.payer_mode,
        vendorStripeCustomerId: row.vendor_stripe_customer_id,
        markupBps: row.markup_bps,
        marketIds: Array.isArray(row.market_ids) ? row.market_ids : [],
        webhookUrl: row.webhook_url,
        scopes,
        status: row.status,
      },
      key: { id: row.key_id, mode: row.mode },
    },
  };
}
