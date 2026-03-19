import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import RiderSettingsClient from './rider-settings-client';

export default async function RiderSettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  return <RiderSettingsClient />;
}
