import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { DriverPlaybookLayer } from '@/components/driver/driver-playbook-layer';

// Wraps every /driver/* route. Decides whether to mount the Playbook
// overlay (FAB + command palette + tip banner). The layer is additive — if
// anything here throws (Neon blip, flag lookup error, etc.) we must still
// render the underlying page. Do NOT let this layout fail a driver page.
export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const context = await loadContext().catch((err) => {
    console.error('[driver/layout] context load failed — rendering page without playbook layer:', err);
    return { playbookEnabled: false, userId: null as string | null, hideTips: false };
  });

  return (
    <>
      {children}
      {context.playbookEnabled && context.userId && (
        <DriverPlaybookLayer userId={context.userId} hideTips={context.hideTips} />
      )}
    </>
  );
}

async function loadContext(): Promise<{ playbookEnabled: boolean; userId: string | null; hideTips: boolean }> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { playbookEnabled: false, userId: null, hideTips: false };

  const rows = await sql`
    SELECT u.id, u.profile_type, up.hide_tips
    FROM users u
    LEFT JOIN user_preferences up ON up.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  const user = rows[0] as { id: string; profile_type: string; hide_tips: boolean | null } | undefined;
  if (!user || user.profile_type !== 'driver') {
    return { playbookEnabled: false, userId: null, hideTips: false };
  }

  const playbookEnabled = await isFeatureEnabled('driver_playbook', { userId: user.id });
  return { playbookEnabled, userId: user.id, hideTips: !!user.hide_tips };
}
