import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db/client';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { ATTRIB_COOKIE, attachAttributionToUser } from '@/lib/attribution';
import { PlaybookShell } from '@/components/driver/playbook-shell';
import DriverDashboardClient from './driver-dashboard-client';

export const metadata = { title: 'Dashboard — HMU ATL' };

export default async function DriverDashboardPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const rows = await sql`
    SELECT id, profile_type, survey_completed_at, survey_skipped_at
    FROM users
    WHERE clerk_id = ${clerkId}
    LIMIT 1
  `;
  const user = rows[0] as {
    id: string;
    profile_type: string;
    survey_completed_at: Date | null;
    survey_skipped_at: Date | null;
  } | undefined;

  let surveyEligible = false;
  let profileCardEligible = false;
  let checklistDismissed = false;
  if (user && user.profile_type === 'driver') {
    const cookieStore = await cookies();
    const cookieId = cookieStore.get(ATTRIB_COOKIE)?.value;
    if (cookieId) {
      // Fire-and-forget; never block render on attribution attach.
      attachAttributionToUser(cookieId, user.id).catch(() => {});
    }
    const flagOn = await isFeatureEnabled('driver_playbook', { userId: user.id });
    if (flagOn) {
      profileCardEligible = true;
      if (!user.survey_completed_at && !user.survey_skipped_at) {
        surveyEligible = true;
      }
      const prefRows = await sql`
        SELECT checklist_dismissed_at FROM user_preferences WHERE user_id = ${user.id} LIMIT 1
      `;
      checklistDismissed = !!(prefRows[0] as { checklist_dismissed_at: Date | null } | undefined)?.checklist_dismissed_at;
    }
  }

  return (
    <>
      <DriverDashboardClient />
      <PlaybookShell
        surveyEligible={surveyEligible}
        profileCardEligible={profileCardEligible}
        checklistDismissed={checklistDismissed}
      />
    </>
  );
}
