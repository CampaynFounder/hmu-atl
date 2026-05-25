import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import PricingConfigClient from './pricing-config-client';
import HoldPolicyClient from './hold-policy-client';
import PricingModesClient from './pricing-modes-client';

export default async function PricingPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  const rows = await sql`SELECT id, is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!rows.length || !(rows[0] as { is_admin: boolean }).is_admin) redirect('/');
  return (
    <div className="space-y-10">
      <PricingModesClient />
      <div className="border-t border-neutral-800" />
      <PricingConfigClient />
      <div className="border-t border-neutral-800" />
      <HoldPolicyClient />
    </div>
  );
}
