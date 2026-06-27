// POST /api/mobile/demo-signin — App-store reviewer login bypass.
//
// Phone-OTP apps can't be reviewed by Apple/Google because reviewers can't
// receive the SMS code. This route lets a SINGLE pre-seeded demo account log in
// WITHOUT an OTP: the app sends the demo phone + a fixed code (documented to the
// reviewers), and we mint a short-lived Clerk sign-in token (ticket) for the
// demo user. The mobile app completes login with `strategy: 'ticket'`.
//
// Safety:
//   • Disabled unless BOTH DEMO_LOGIN_PHONE and DEMO_LOGIN_CODE are set as
//     Worker secrets — so prod has no backdoor until we deliberately turn it on,
//     and turning it off is a single secret deletion.
//   • Only ever issues a token for the one user whose verified phone == the
//     configured demo phone. No other account is reachable.
//   • Token TTL is 5 min and the demo account is a sandbox rider.
//   • A strict per-IP rate limiter guards the code check, so even a short
//     numeric DEMO_LOGIN_CODE (app-store reviewers can only type digits) can't
//     be brute-forced into this sandbox account: 1M combos / 8-per-15min ≈ years.
import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { checkRateLimit } from '@/lib/rate-limit/check';

export const runtime = 'nodejs';

// Comma-separated list of E.164 demo phones (e.g. one rider + one driver demo
// account), all sharing the same bypass code. A single value works too.
const DEMO_PHONES = (process.env.DEMO_LOGIN_PHONE || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DEMO_CODE = process.env.DEMO_LOGIN_CODE || '';

// Last-10-digit NANPA compare so "+1 (678) 813-1008" == "6788131008".
function norm10(value: string): string {
  const d = (value || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

// Length-safe constant-time-ish string compare (avoids early-exit timing leak).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest) {
  // Feature disabled unless explicitly configured.
  if (DEMO_PHONES.length === 0 || !DEMO_CODE) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Brute-force guard. This endpoint has no Clerk OTP, so a short numeric code is
  // only safe behind a strict per-IP limiter. A legitimate reviewer types the
  // code once; 8 attempts / 15 min leaves room for typos while making a 6-digit
  // sweep take years.
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown';
  const rl = await checkRateLimit({ key: `mobile:demo-signin:${ip}`, limit: 8, windowSeconds: 900 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  let body: { phone?: string; code?: string };
  try {
    body = (await req.json()) as { phone?: string; code?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Match the submitted phone to a configured demo phone; use the configured
  // (E.164) value for the Clerk lookup so the format is always exact.
  const matched = DEMO_PHONES.find((p) => norm10(p) === norm10(body.phone ?? ''));
  const codeOk = safeEqual(body.code ?? '', DEMO_CODE);
  // Single generic 401 for any mismatch — don't reveal which field was wrong.
  if (!matched || !codeOk) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  try {
    const clerk = await clerkClient();
    const list = await clerk.users.getUserList({ phoneNumber: [matched], limit: 1 });
    const user = list.data[0];
    if (!user) {
      // Misconfiguration: phone/code matched but the demo user isn't provisioned.
      return NextResponse.json({ error: 'Demo account not provisioned' }, { status: 500 });
    }

    const token = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 300,
    });

    return NextResponse.json({ ticket: token.token });
  } catch (err) {
    console.error('[mobile/demo-signin] failed:', err);
    return NextResponse.json({ error: 'Sign-in failed' }, { status: 500 });
  }
}
