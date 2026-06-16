// GET  /api/admin/voip-config  — credential status + current platform_config settings
// PATCH /api/admin/voip-config — update webhook secret + IP allowlist in platform_config

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';

export const runtime = 'nodejs';

const VOIPMS_API_URL = 'https://voip.ms/api/v1/rest.php';
const CONFIG_KEY = 'voipms.webhook';

// Includes the rider_growth line's per-market DIDs (the 2nd VoIP.ms number that
// backs /admin/rider-growth) so ops can confirm they're set + webhook-registered.
const MARKET_DID_ENV: Record<string, string> = {
  atl:  'VOIPMS_DID_ATL',
  nola: 'VOIPMS_DID_NOLA',
  hou:  'VOIPMS_DID_HOU',
  dal:  'VOIPMS_DID_DAL',
  mem:  'VOIPMS_DID_MEM',
  'atl (rider growth)':  'VOIPMS_DID_RIDERGROWTH_ATL',
  'nola (rider growth)': 'VOIPMS_DID_RIDERGROWTH_NOLA',
  'hou (rider growth)':  'VOIPMS_DID_RIDERGROWTH_HOU',
  'dal (rider growth)':  'VOIPMS_DID_RIDERGROWTH_DAL',
  'mem (rider growth)':  'VOIPMS_DID_RIDERGROWTH_MEM',
};

async function getDIDRegisteredUrl(username: string, password: string, did: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ api_username: username, api_password: password, method: 'getDIDsInfo', did });
    const res = await fetch(`${VOIPMS_API_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json() as Record<string, unknown>;
    if (data.status !== 'success') return null;
    const dids = data.dids as Array<Record<string, unknown>> | undefined;
    return (dids?.[0]?.sms_url_callback as string) || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.voip')) return unauthorizedResponse();

  const username = process.env.VOIPMS_API_USERNAME || null;
  const password = process.env.VOIPMS_API_PASSWORD || null;

  // Credential status — show last 4 chars of each for confirmation without exposing full values
  const markets = await Promise.all(
    Object.entries(MARKET_DID_ENV).map(async ([slug, envKey]) => {
      const did = process.env[envKey] || null;
      let registeredUrl: string | null = null;
      if (did && username && password) {
        registeredUrl = await getDIDRegisteredUrl(username, password, did);
      }
      return {
        slug,
        envKey,
        didConfigured: !!did,
        didTail: did ? did.slice(-4) : null,
        registeredUrl,
      };
    }),
  );

  // Current platform_config settings
  const rows = await sql`
    SELECT config_value FROM platform_config WHERE config_key = ${CONFIG_KEY} LIMIT 1
  `.catch(() => []);
  const cfg = (rows[0] as { config_value: Record<string, unknown> } | undefined)?.config_value ?? {};

  return NextResponse.json({
    credentials: {
      usernameConfigured: !!username,
      passwordConfigured: !!password,
    },
    markets,
    settings: {
      webhookSecret:    (cfg.webhook_secret    as string)  || '',
      ipAllowlist:      (cfg.ip_allowlist       as string)  || '',
    },
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.voip')) return unauthorizedResponse();

  const body = await req.json().catch(() => ({})) as {
    webhook_secret?: unknown;
    ip_allowlist?: unknown;
  };

  const webhookSecret = typeof body.webhook_secret === 'string' ? body.webhook_secret.trim() : undefined;
  const ipAllowlist   = typeof body.ip_allowlist   === 'string' ? body.ip_allowlist.trim()   : undefined;

  if (webhookSecret === undefined && ipAllowlist === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  // Merge with existing
  const existing = await sql`
    SELECT config_value FROM platform_config WHERE config_key = ${CONFIG_KEY} LIMIT 1
  `.catch(() => []);
  const prev = (existing[0] as { config_value: Record<string, unknown> } | undefined)?.config_value ?? {};

  const next = {
    ...prev,
    ...(webhookSecret !== undefined && { webhook_secret: webhookSecret }),
    ...(ipAllowlist   !== undefined && { ip_allowlist:   ipAllowlist }),
  };

  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${CONFIG_KEY}, ${JSON.stringify(next)}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by   = EXCLUDED.updated_by,
      updated_at   = NOW()
  `;

  invalidatePlatformConfig(CONFIG_KEY);
  await logAdminAction(admin.id, 'voipms_config_update', 'platform_config', CONFIG_KEY, { fields: Object.keys(next) });

  return NextResponse.json({ ok: true, settings: { webhookSecret: next.webhook_secret ?? '', ipAllowlist: next.ip_allowlist ?? '' } });
}
