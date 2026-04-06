'use client';

import { Construction } from 'lucide-react';

export default function MaintenancePage() {
  return (
    <div
      className="min-h-screen bg-[#080808] text-white flex items-center justify-center px-6"
      style={{ fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}
    >
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-[#141414] rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#1a1a1a]">
          <Construction className="w-10 h-10 text-[#00e676]" />
        </div>
        <h1
          className="text-4xl mb-3 text-[#00e676]"
          style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", letterSpacing: 3 }}
        >
          Scheduled Maintenance
        </h1>
        <p className="text-[#bbb] text-lg mb-2">
          We&apos;re making HMU ATL even better.
        </p>
        <p className="text-[#666] text-sm mb-8">
          The app is temporarily offline for upgrades. We&apos;ll be back shortly.
        </p>
        <div
          className="inline-block bg-[#141414] border border-[#1a1a1a] rounded-xl px-6 py-3 text-[#00e676] text-xs uppercase tracking-widest"
          style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}
        >
          Back soon
        </div>
      </div>
    </div>
  );
}
