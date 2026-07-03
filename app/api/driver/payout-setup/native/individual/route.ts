// POST /api/driver/payout-setup/native/individual — Option B step 2.
// Submits the driver's KYC (DOB, SSN last 4, address, phone) to their Custom
// account. SSN is passed straight to Stripe and never persisted by us. Gated
// OFF by the driver_payout_native_forms flag.

import { NextRequest, NextResponse } from 'next/server';
import { updateCustomAccountIndividual, getAccountRequirements } from '@/lib/stripe/connect';
import { requireNativePayoutDriver } from '@/lib/stripe/native-payout-guard';

export const runtime = 'nodejs';

const STATE_RE = /^[A-Za-z]{2}$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const SSN4_RE = /^\d{4}$/;
const SSN9_RE = /^\d{9}$/;

export async function POST(req: NextRequest) {
  const g = await requireNativePayoutDriver();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!g.stripeAccountId) return NextResponse.json({ error: 'No account — call /native/account first' }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const individual: Parameters<typeof updateCustomAccountIndividual>[1] = {};

  // DOB: expect { day, month, year }
  if (body.dob && typeof body.dob === 'object') {
    const { day, month, year } = body.dob as { day?: number; month?: number; year?: number };
    if (!day || !month || !year || year < 1900 || year > new Date().getUTCFullYear() - 13) {
      return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
    }
    individual.dob = { day: Number(day), month: Number(month), year: Number(year) };
  }

  // SSN — accept last-4 (normal) or full 9 digits (only if Stripe escalated).
  if (typeof body.ssnLast4 === 'string') {
    const s = body.ssnLast4.replace(/\D/g, '');
    if (!SSN4_RE.test(s)) return NextResponse.json({ error: 'SSN last 4 must be 4 digits' }, { status: 400 });
    individual.ssnLast4 = s;
  }
  if (typeof body.ssnFull === 'string') {
    const s = body.ssnFull.replace(/\D/g, '');
    if (!SSN9_RE.test(s)) return NextResponse.json({ error: 'SSN must be 9 digits' }, { status: 400 });
    individual.idNumber = s;
  }

  if (typeof body.phone === 'string' && body.phone.trim()) individual.phone = body.phone.trim();

  if (body.address && typeof body.address === 'object') {
    const a = body.address as Record<string, string>;
    if (!a.line1 || !a.city || !STATE_RE.test(a.state || '') || !ZIP_RE.test(a.postal_code || '')) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }
    individual.address = {
      line1: a.line1.trim(),
      ...(a.line2 ? { line2: a.line2.trim() } : {}),
      city: a.city.trim(),
      state: a.state.toUpperCase(),
      postal_code: a.postal_code.trim(),
    };
  }

  if (Object.keys(individual).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    await updateCustomAccountIndividual(g.stripeAccountId, individual);
    const requirements = await getAccountRequirements(g.stripeAccountId);
    return NextResponse.json({ ok: true, requirements });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Verification update failed';
    console.error('[native/individual]', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
