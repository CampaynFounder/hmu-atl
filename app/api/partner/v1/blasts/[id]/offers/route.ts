// GET /api/partner/v1/blasts/{id}/offers — driver responses to a blast.
// Auth: blasts:write (read of the partner's own blast).

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartner } from '@/lib/partner/auth';
import { listPartnerBlastOffers } from '@/lib/partner/blast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticatePartner(req, '', 'blasts:write');
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const result = await listPartnerBlastOffers(auth.ctx, id);
  if (result.ok) {
    return NextResponse.json({ blast_id: result.data.blastId, status: result.data.status, offers: result.data.offers });
  }
  return NextResponse.json({ error: result.error, message: result.message }, { status: result.httpStatus });
}
