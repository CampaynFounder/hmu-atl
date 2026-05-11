import { redirect } from 'next/navigation';
import { requireAdmin, hasPermission } from '@/lib/admin/helpers';
import { listTemplates } from '@/lib/sms/templates';
import SmsTemplatesClient from './sms-templates-client';

export default async function SmsTemplatesPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin-login');
  if (!hasPermission(admin, 'admin.smstemplates.view')) redirect('/admin');

  const templates = await listTemplates();
  const canEdit = hasPermission(admin, 'admin.smstemplates.edit');

  return <SmsTemplatesClient initialTemplates={templates} canEdit={canEdit} />;
}
