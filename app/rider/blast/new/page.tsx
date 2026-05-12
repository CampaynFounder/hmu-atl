// /rider/blast/new — the form. Unauth-allowed; auth gate on submit.
// Spec §3.2.

import { isFeatureEnabled } from '@/lib/feature-flags';
import { notFound } from 'next/navigation';
import BlastFormClient from './blast-form-client';

export const dynamic = 'force-dynamic';

export default async function BlastNewPage() {
  if (!(await isFeatureEnabled('blast_booking'))) notFound();
  return <BlastFormClient />;
}
