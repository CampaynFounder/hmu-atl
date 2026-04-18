import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { DriverPlaybookLayer } from '@/components/driver/driver-playbook-layer';

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const { userId: clerkId } = await auth();

  let playbookEnabled = false;
  let userId: string | null = null;
  let hideTips = false;
  if (clerkId) {
    const rows = await sql`
      SELECT u.id, u.profile_type, up.hide_tips
      FROM users u
      LEFT JOIN user_preferences up ON up.user_id = u.id
      WHERE u.clerk_id = ${clerkId}
      LIMIT 1
    `;
    const user = rows[0] as { id: string; profile_type: string; hide_tips: boolean | null } | undefined;
    if (user && user.profile_type === 'driver') {
      playbookEnabled = await isFeatureEnabled('driver_playbook', { userId: user.id });
      userId = user.id;
      hideTips = !!user.hide_tips;
    }
  }

  return (
    <>
      {children}
      {playbookEnabled && userId && <DriverPlaybookLayer userId={userId} hideTips={hideTips} />}
    </>
  );
}
