'use client';

// Floating action button — primary entry point to the Driver Playbook.
// Bottom-right, thumb-reach zone. Subtle pulse on mount, shimmer on hover.
// Badge count = incomplete activation steps (fetched lazily).

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';

interface Props {
  onOpen: () => void;
}

export function GetRidersFab({ onOpen }: Props) {
  const [badge, setBadge] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/driver/activation-progress')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.incomplete != null) setBadge(Number(data.incomplete));
      })
      .catch(() => {});
  }, []);

  function handleClick() {
    posthog.capture('driver_get_riders_fab_clicked');
    onOpen();
  }

  return (
    <AnimatePresence>
      {(
        <motion.button
          initial={{ opacity: 0, scale: 0.6, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 20 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          onClick={handleClick}
          aria-label="Get Riders — driver playbook"
          className="fixed z-40 flex items-center gap-2 pl-4 pr-5 py-3 rounded-full font-bold text-sm shadow-2xl"
          style={{
            bottom: 'max(20px, calc(env(safe-area-inset-bottom) + 80px))',
            right: 'max(16px, env(safe-area-inset-right))',
            background: '#00E676',
            color: '#080808',
            boxShadow: '0 10px 30px rgba(0,230,118,0.35), 0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          <motion.span
            animate={{ x: [0, 3, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
            className="text-base"
            aria-hidden
          >
            🚗
          </motion.span>
          <span>Get Riders</span>
          {badge != null && badge > 0 && (
            <span
              className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center"
              style={{ background: '#080808', color: '#00E676' }}
            >
              {badge}
            </span>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
