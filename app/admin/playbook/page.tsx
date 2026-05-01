import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/helpers';
import { listPlaybook } from '@/lib/admin/playbook';
import PlaybookClient from './playbook-client';

export default async function PlaybookPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/sign-in');
  // Authoring is super-only. Non-super admins consume entries via the picker
  // inside /admin/messages — they don't need this page.
  if (!admin.is_super) redirect('/admin');

  const entries = await listPlaybook();

  return <PlaybookClient initialEntries={entries} />;
}
