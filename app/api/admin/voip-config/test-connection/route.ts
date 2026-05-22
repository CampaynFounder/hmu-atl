// POST /api/admin/voip-config/test-connection
// Calls VoIP.ms getBalance to verify credentials are valid.

import { NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';

const VOIPMS_API_URL = 'https://voip.ms/api/v1/rest.php';

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.voip')) return unauthorizedResponse();

  const username = process.env.VOIPMS_API_USERNAME;
  const password = process.env.VOIPMS_API_PASSWORD;

  if (!username || !password) {
    return NextResponse.json({
      ok: false,
      error: 'VOIPMS_API_USERNAME or VOIPMS_API_PASSWORD not set in Worker secrets',
    });
  }

  try {
    const params = new URLSearchParams({ api_username: username, api_password: password, method: 'getBalance' });
    const res = await fetch(`${VOIPMS_API_URL}?${params}`, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json() as Record<string, unknown>;

    if (data.status === 'success') {
      return NextResponse.json({
        ok: true,
        balance: (data.balance as string) ?? null,
      });
    }

    return NextResponse.json({
      ok: false,
      error: String(data.status ?? 'unknown_error'),
      raw: data,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'Network error',
    });
  }
}
