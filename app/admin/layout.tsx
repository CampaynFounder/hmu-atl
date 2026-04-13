import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { AdminSidebar } from './components/admin-sidebar';
import { AdminMain } from './components/admin-main';
import { MarketProvider } from './components/market-context';
import { SidebarProvider } from './components/sidebar-context';
import { AdminThemeProvider } from './components/theme-context';

export const metadata = {
  title: 'HMU Admin',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkUser = await currentUser();

  if (!clerkUser) redirect('/sign-in');

  // Check is_admin flag directly
  const rows = await sql`
    SELECT is_admin FROM users WHERE clerk_id = ${clerkUser.id} LIMIT 1
  `;
  if (!rows.length || !rows[0].is_admin) redirect('/');

  return (
    <MarketProvider>
      <SidebarProvider>
        <AdminThemeProvider>
          <div className="min-h-screen flex" style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)' }}>
            <AdminSidebar />
            <AdminMain>{children}</AdminMain>
          </div>
        </AdminThemeProvider>
      </SidebarProvider>
    </MarketProvider>
  );
}
