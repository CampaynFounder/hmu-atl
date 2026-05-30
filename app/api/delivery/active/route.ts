// GET /api/delivery/active — the signed-in rider's current active pickup/delivery
// request (non-terminal status), or { delivery: null }.
//
// Lets the mobile "My Requests" surface re-enter delivery/[id]. There was no
// "my active deliveries" read endpoint — /delivery/[id] only fetches one by id.
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ delivery: null });
  const customerId = (userRows[0] as { id: string }).id;

  const rows = await sql`
    SELECT id, status, merchant_name, customer_address
    FROM delivery_requests
    WHERE customer_id = ${customerId}
      AND status NOT IN ('completed', 'delivered', 'cancelled')
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!rows.length) return NextResponse.json({ delivery: null });

  const row = rows[0] as Record<string, unknown>;
  return NextResponse.json({
    delivery: {
      id: row.id as string,
      status: row.status as string,
      merchantName: (row.merchant_name as string) || '',
      customerAddress: (row.customer_address as string) || '',
    },
  });
}
