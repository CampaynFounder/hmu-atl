import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import PricingConfigClient from './pricing-config-client';
import HoldPolicyClient from './hold-policy-client';
import PublicOffersClient from './public-offers-client';
import PricingPreviewClient from './pricing-preview-client';
import PricingTabs from './pricing-tabs';

export default async function PricingPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  const rows = await sql`SELECT id, is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!rows.length || !(rows[0] as { is_admin: boolean }).is_admin) redirect('/');
  return (
    <PricingTabs
      defaultTabId="base"
      tabs={[
        {
          id: 'base',
          label: 'Base Rates',
          content: (
            <div className="space-y-10">
              <PricingConfigClient />
              <div className="border-t border-neutral-800" />
              <HoldPolicyClient />
            </div>
          ),
        },
        { id: 'offers', label: 'Public Offer', content: <PublicOffersClient /> },
        { id: 'preview', label: 'Preview', content: <PricingPreviewClient /> },
      ]}
    />
  );
}
