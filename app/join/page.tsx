import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { RiderJoinFlow } from '@/components/onboarding/rider-join-flow';

export const metadata: Metadata = {
  title: 'Join HMU ATL',
  description: 'Crew-built rides in Atlanta. Find a driver in minutes.',
  openGraph: {
    title: 'HMU ATL — Join the Crew',
    description: 'Peer-to-peer rides for Metro Atlanta. No surge pricing.',
    images: [{ url: '/og-join.png', width: 1200, height: 630 }],
  },
};

export default async function JoinPage() {
  const { userId } = await auth();
  if (userId) redirect('/rider/browse');

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#080808',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RiderJoinFlow />
    </main>
  );
}
