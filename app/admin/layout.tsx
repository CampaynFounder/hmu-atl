import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';
import { AdminSidebar } from './components/admin-sidebar';

export const metadata = {
  title: 'HMU Admin',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) redirect('/sign-in');

  // Check is_admin flag
  const adminCheck = await sql`SELECT is_admin FROM users WHERE id = ${user.id} LIMIT 1`;
  if (!adminCheck.length || !adminCheck[0].is_admin) redirect('/');

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex">
      <AdminSidebar />
      <main className="flex-1 min-h-screen overflow-y-auto lg:ml-64">
        <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
