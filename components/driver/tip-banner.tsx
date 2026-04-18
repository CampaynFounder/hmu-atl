'use client';

// Listens for 'tip' events on user:{userId}:notify and renders a dismissible banner.
// Parent unmounts this component when hide_tips is true, so we never subscribe in that case.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useAbly } from '@/hooks/use-ably';
import { posthog } from '@/components/analytics/posthog-provider';

interface TipPayload {
  id: string;
  title: string;
  body?: string;
  cta_label?: string;
  cta_href?: string;
}

interface Props {
  userId: string;
}

export function TipBanner({ userId }: Props) {
  const [tip, setTip] = useState<TipPayload | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useAbly({
    channelName: `user:${userId}:notify`,
    onMessage: msg => {
      if (msg.name !== 'tip') return;
      const payload = msg.data as TipPayload;
      if (!payload?.id || dismissedIds.has(payload.id)) return;
      setTip(payload);
      posthog.capture('driver_tip_shown', { tip_id: payload.id, title: payload.title });
    },
  });

  function dismiss() {
    if (tip) {
      setDismissedIds(prev => new Set(prev).add(tip.id));
      posthog.capture('driver_tip_dismissed', { tip_id: tip.id });
    }
    setTip(null);
  }

  function clickCta() {
    if (tip) posthog.capture('driver_tip_clicked', { tip_id: tip.id });
  }

  return (
    <AnimatePresence>
      {tip && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="fixed top-0 left-0 right-0 z-30 px-4 pt-3"
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="max-w-lg mx-auto rounded-xl p-4 shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #00E676, #00B248)',
              color: '#080808',
              pointerEvents: 'auto',
            }}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl" aria-hidden>💡</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm leading-tight">{tip.title}</p>
                {tip.body && (
                  <p className="text-xs mt-1 opacity-80">{tip.body}</p>
                )}
                {tip.cta_href && tip.cta_label && (
                  <Link
                    href={tip.cta_href}
                    onClick={clickCta}
                    className="inline-block mt-2 text-xs font-bold underline"
                  >
                    {tip.cta_label} →
                  </Link>
                )}
              </div>
              <button
                onClick={dismiss}
                aria-label="Dismiss"
                className="text-sm font-bold opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
