import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { PLAYBOOK_SECTIONS, ECONOMICS_HERO } from '@/content/driver-playbook';
import { listFbGroups } from '@/lib/db/fb-groups';
import PlaybookClient from './playbook-client';

export const metadata = { title: 'Driver Playbook — HMU ATL' };

export default async function DriverPlaybookPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const rows = await sql`
    SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  const user = rows[0] as { id: string; profile_type: string } | undefined;
  if (!user || user.profile_type !== 'driver') redirect('/');

  const enabled = await isFeatureEnabled('driver_playbook', { userId: user.id });
  if (!enabled) redirect('/driver/dashboard');

  const fbGroups = await listFbGroups('atl', true);

  return (
    <PlaybookClient
      hero={ECONOMICS_HERO}
      sections={PLAYBOOK_SECTIONS}
      fbGroups={fbGroups.map(g => ({
        id: g.id,
        name: g.name,
        url: g.url,
        audience: g.audience,
        suggested_caption: g.suggested_caption,
        why_this_group: g.why_this_group,
      }))}
    />
  );
}
