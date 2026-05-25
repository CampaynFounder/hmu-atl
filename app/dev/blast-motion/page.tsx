// /dev/blast-motion — admin-gated visual demo of every Gate 2.3 motion
// primitive plus the ScoreBreakdownBars component. Lets the parallel stream
// agents visually verify the primitives without standing up the actual
// surfaces that consume them.
//
// Per docs/BLAST-V3-AGENT-CONTRACT.md §6.5 ("Each primitive ships with: ... a
// `__demo` route") + §11.2 frontend feel bar.

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/helpers';
import { BlastMotionGallery } from './gallery';

export const metadata = {
  title: 'Blast Motion Library — Dev',
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function BlastMotionDevPage() {
  const admin = await requireAdmin();
  if (!admin) {
    // Match the project's admin auth convention — non-admins land at home.
    redirect('/');
  }
  return <BlastMotionGallery />;
}
