import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import MyRidesClient from './my-rides-client';

export default async function DriverRidesPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/onboarding?type=driver');
  const userId = (userRows[0] as { id: string }).id;

  const rides = await sql`
    SELECT r.id, r.status, r.final_agreed_price, r.agreement_summary,
           r.created_at, r.started_at, r.ended_at, r.driver_payout_amount,
           r.platform_fee_amount, r.driver_rating,
           COALESCE(rp.handle, rp.display_name, 'Rider') as rider_name
    FROM rides r
    LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
    WHERE r.driver_id = ${userId}
    ORDER BY r.created_at DESC
    LIMIT 50
  `;

  return (
    <MyRidesClient
      rides={rides.map((r: Record<string, unknown>) => {
        const summary = (r.agreement_summary || {}) as Record<string, unknown>;
        return {
          id: r.id as string,
          status: r.status as string,
          riderName: r.rider_name as string,
          price: Number(r.final_agreed_price || 0),
          destination: (summary.destination as string) || (summary.message as string) || '',
          payout: Number(r.driver_payout_amount || 0),
          platformFee: Number(r.platform_fee_amount || 0),
          rating: r.driver_rating as string | null,
          createdAt: r.created_at as string,
          startedAt: r.started_at as string | null,
          endedAt: r.ended_at as string | null,
        };
      })}
    />
  );
}
