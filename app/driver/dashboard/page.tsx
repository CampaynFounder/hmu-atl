import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import DriverDashboardClient from './driver-dashboard-client';

export const metadata = { title: 'Dashboard — HMU ATL' };

export default async function DriverDashboardPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  return <DriverDashboardClient />;
}
