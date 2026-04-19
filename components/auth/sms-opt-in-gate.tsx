// Server component gate for the SMS opt-in prompt.
// Renders the client banner only when ALL of:
//  - conversation_agent feature flag is ON
//  - user is signed in, is a driver or rider, Neon row exists
//  - users.opt_in_sms = FALSE
//  - signed up within the last 30 days (don't pester long-term users)
//  - hmu_sms_prompt_dismissed cookie is absent

import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db/client';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { getConfig } from '@/lib/conversation/config';
import { SmsOptInPrompt } from './sms-opt-in-prompt';

const DISMISS_COOKIE = 'hmu_sms_prompt_dismissed';
const SIGNUP_WINDOW_DAYS = 30;

export async function SmsOptInGate() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const cookieStore = await cookies();
  if (cookieStore.get(DISMISS_COOKIE)) return null;

  const rows = await sql`
    SELECT id, profile_type, opt_in_sms, created_at
    FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  const user = rows[0] as {
    id: string;
    profile_type: string;
    opt_in_sms: boolean;
    created_at: Date;
  } | undefined;
  if (!user) return null;
  if (user.opt_in_sms) return null;
  if (user.profile_type !== 'driver' && user.profile_type !== 'rider') return null;

  const createdMs = new Date(user.created_at).getTime();
  const ageDays = (Date.now() - createdMs) / 86_400_000;
  if (ageDays > SIGNUP_WINDOW_DAYS) return null;

  const flagOn = await isFeatureEnabled('conversation_agent', { userId: user.id });
  if (!flagOn) return null;

  const config = await getConfig();
  return <SmsOptInPrompt disclosureText={config.opt_in_disclosure_text} />;
}
