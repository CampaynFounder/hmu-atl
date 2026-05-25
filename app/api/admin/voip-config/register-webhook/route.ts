// POST /api/admin/voip-config/register-webhook
// Attempts to register the inbound or delivery-receipt callback URL for a market DID
// via the VoIP.ms API (setDIDInfo with sms_url_callback). If the API call fails or
// VoIP.ms does not support this method, returns the URL the admin should paste into
// the VoIP.ms portal manually.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

const VOIPMS_API_URL = 'https://voip.ms/api/v1/rest.php';

const MARKET_DID_ENV: Record<string, string> = {
  atl:  'VOIPMS_DID_ATL',
  nola: 'VOIPMS_DID_NOLA',
  hou:  'VOIPMS_DID_HOU',
  dal:  'VOIPMS_DID_DAL',
  mem:  'VOIPMS_DID_MEM',
};

function buildCallbackUrl(type: 'inbound' | 'delivery', secret: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://atl.hmucashride.com';
  const path = type === 'inbound'
    ? '/api/webhooks/voipms'
    : '/api/blast/voipms/webhook';
  return secret ? `${base}${path}?secret=${encodeURIComponent(secret)}` : `${base}${path}`;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.voip')) return unauthorizedResponse();

  const body = await req.json().catch(() => ({})) as {
    market?: unknown;
    type?: unknown;
  };

  const market = typeof body.market === 'string' ? body.market.toLowerCase() : null;
  const type   = body.type === 'inbound' || body.type === 'delivery' ? body.type : null;

  if (!market || !MARKET_DID_ENV[market]) {
    return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  }
  if (!type) {
    return NextResponse.json({ error: 'type must be "inbound" or "delivery"' }, { status: 400 });
  }

  const username = process.env.VOIPMS_API_USERNAME;
  const password = process.env.VOIPMS_API_PASSWORD;
  const did      = process.env[MARKET_DID_ENV[market]];

  if (!username || !password) {
    return NextResponse.json({ error: 'VoIP.ms credentials not configured in Worker secrets' }, { status: 503 });
  }
  if (!did) {
    return NextResponse.json({ error: `${MARKET_DID_ENV[market]} not set — no DID configured for ${market}` }, { status: 400 });
  }

  // Get the webhook secret from platform_config
  const cfgRows = await sql`
    SELECT config_value FROM platform_config WHERE config_key = 'voipms.webhook' LIMIT 1
  `.catch(() => []);
  const cfg = (cfgRows[0] as { config_value: Record<string, unknown> } | undefined)?.config_value ?? {};
  const secret = (cfg.webhook_secret as string) || '';

  const callbackUrl = buildCallbackUrl(type, secret);

  // Try the VoIP.ms API. VoIP.ms uses setDIDInfo to update DID-level settings.
  // The sms_url_callback field sets the SMS delivery/inbound webhook URL.
  let apiSuccess = false;
  let apiError: string | null = null;
  let apiRaw: unknown = null;

  try {
    const params = new URLSearchParams({
      api_username: username,
      api_password: password,
      method: 'setDIDInfo',
      did,
      sms_url_callback: callbackUrl,
    });
    const res = await fetch(`${VOIPMS_API_URL}?${params}`, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json() as Record<string, unknown>;
    apiRaw = data;

    if (data.status === 'success') {
      apiSuccess = true;
    } else {
      apiError = String(data.status ?? 'unknown_error');
    }
  } catch (e) {
    apiError = e instanceof Error ? e.message : 'Network error';
  }

  await logAdminAction(admin.id, 'voipms_register_webhook', 'voipms', did, {
    market, type, callbackUrl, apiSuccess, apiError,
  });

  return NextResponse.json({
    ok: apiSuccess,
    callbackUrl,
    did: did.slice(-4),
    market,
    type,
    // Always return the URL so admin can paste it manually if API call fails
    manualSetupUrl: 'https://voip.ms/m/didsmanage.php',
    ...(apiError && { apiError, apiRaw }),
  });
}
