// /rider/blast/new — Stream A v3 entry. Renders the bottom-sheet form.
//
// Per docs/BLAST-V3-AGENT-CONTRACT.md §4 Stream A row + §5.1 (mobile-first).
// The page is public (auth gate is on submit, not on page load — see
// middleware.ts allowlist for /rider/blast/new).

import type { Metadata } from 'next';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { notFound } from 'next/navigation';
import BlastFormClient from './blast-form-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Send a Blast — HMU ATL',
  description: 'Tell us where. Drivers HMU back. You pick.',
};

export default async function BlastNewPage() {
  // Feature flag the new flow off by default until staging verifies it.
  if (!(await isFeatureEnabled('blast_booking'))) notFound();
  return (
    <main style={{ paddingTop: 'var(--header-height)', minHeight: '100dvh', background: '#080808' }}>
      <BlastFormClient />
    </main>
  );
}
