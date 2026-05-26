import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';

const GITHUB_REPO = 'CampaynFounder/hmu-atl';
const WORKFLOW_FILE = 'smoke-tests.yml';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 503 });
  }

  const { env, market } = await req.json() as { env?: string; market?: string };
  const targetEnv = env ?? 'staging';
  const targetMarket = market ?? 'atl';

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { env: targetEnv, market: targetMarket },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    return NextResponse.json({ error: body.message ?? 'Dispatch failed' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, env: targetEnv, market: targetMarket });
}
