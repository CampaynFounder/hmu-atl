'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import SupportChat from '@/components/support/support-chat';

const RIDER_QUICK_ACTIONS = [
  'Driver didn\'t show up',
  'I was overcharged',
  'Report a driver',
  'I need a refund',
  'Help with a ride',
];

export default function RiderSupportClient({ userName }: { userName: string }) {
  return (
    <div style={{
      background: '#080808', minHeight: '100svh', color: '#fff',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Link href="/rider/home" style={{ color: '#00E676', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          <ChevronLeft size={16} /> Home
        </Link>
      </div>
      <div style={{ padding: '12px 20px 16px', flexShrink: 0 }}>
        <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 32, lineHeight: 1 }}>Support</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Get help with rides, charges, and safety</div>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <SupportChat
          greeting={`Hey ${userName}! I can help with ride issues, charges, refunds, or safety reports. What do you need?`}
          placeholder="What happened?"
          quickActions={RIDER_QUICK_ACTIONS}
        />
      </div>
    </div>
  );
}
