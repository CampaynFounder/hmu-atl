import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import RiderProfileClient from './rider-profile-client';

export default async function RiderProfilePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const rows = await sql`
    SELECT rp.display_name, rp.first_name, rp.last_name, rp.lgbtq_friendly,
           rp.stripe_customer_id, u.tier, u.id as user_id
    FROM users u
    JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;
  if (!rows.length) redirect('/onboarding?type=rider');

  const p = rows[0] as Record<string, unknown>;

  // Check for actual saved payment methods, not just customer ID
  const pmRows = await sql`
    SELECT id, brand, last4 FROM rider_payment_methods
    WHERE rider_id = ${p.user_id} AND is_default = true
    LIMIT 1
  `;
  const defaultPm = pmRows[0] as Record<string, unknown> | undefined;

  return (
    <RiderProfileClient
      profile={{
        displayName: (p.display_name as string) || (p.first_name as string) || 'Rider',
        firstName: (p.first_name as string) || '',
        lastName: (p.last_name as string) || '',
        lgbtqFriendly: (p.lgbtq_friendly as boolean) || false,
        hasPaymentMethod: !!defaultPm,
        paymentBrand: (defaultPm?.brand as string) || null,
        paymentLast4: (defaultPm?.last4 as string) || null,
      }}
    />
  );
}
