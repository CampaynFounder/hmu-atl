import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import AdminSupportClient from './admin-support-client';

export default async function AdminSupportPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const userRows = await sql`SELECT id, is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length || !(userRows[0] as { is_admin: boolean }).is_admin) redirect('/');

  return <AdminSupportClient />;
}
