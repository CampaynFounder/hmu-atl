// /auth-callback/blast — post-auth handoff for the Blast funnel.
// Stream A (per docs/BLAST-V3-AGENT-CONTRACT.md §3 D-13: photo HARD GATE for
// new sign-ups; existing rider sign-in SKIPS username + photo entirely.)
//
// Routing rules (handled in the client):
//   ?mode=signup → username step → photo step → review → Send Blast
//   ?mode=signin → review → Send Blast
//
// Public route (auth checked client-side via useUser; the surface needs to
// render even mid-Clerk-handshake for the spinner to show).

import type { Metadata } from 'next';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { notFound } from 'next/navigation';
import BlastHandoffClient from './blast-handoff-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Almost there — HMU ATL',
  description: 'Wrapping up your blast.',
};

export default async function BlastAuthCallbackPage() {
  if (!(await isFeatureEnabled('blast_booking'))) notFound();
  return <BlastHandoffClient />;
}
