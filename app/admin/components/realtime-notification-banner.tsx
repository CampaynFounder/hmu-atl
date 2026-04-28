'use client';

// Listens to admin:feed for the events configured in
// platform_config.admin.realtime_notifications and pops up dismissable
// banner notifications in the admin portal. Mounted in /admin/layout.tsx
// and gated to super admins via the AdminAuth context.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAbly } from '@/hooks/use-ably';
import { useAdminAuth } from './admin-auth-context';
import {
  EVENT_TO_TYPE,
  REALTIME_NOTIF_DEFAULTS,
  TYPE_LABELS,
  type AdminRealtimeNotifConfig,
  type AdminRealtimeNotifType,
} from '@/lib/admin/realtime-notifications';

interface BannerEntry {
  id: string;
  type: AdminRealtimeNotifType;
  emoji: string;
  title: string;
  detail: string | null;
  href: string | null;
  receivedAt: number;
}

const AUTO_DISMISS_MS = 30_000;
const MAX_VISIBLE = 4;

function formatBanner(type: AdminRealtimeNotifType, eventName: string, data: unknown): { title: string; detail: string | null; href: string | null } {
  const d = (data ?? {}) as Record<string, unknown>;
  switch (type) {
    case 'user_signup': {
      const profileType = String(d.profileType || d.profile_type || 'user');
      const name = (d.name as string) || (d.displayName as string) || 'Unknown';
      const isDriver = profileType === 'driver';
      const isRider = profileType === 'rider';
      const role = isDriver ? 'driver' : isRider ? 'rider' : 'user';
      return {
        title: `New ${role} signup: ${name}`,
        detail: d.test ? 'Test event' : null,
        href: '/admin/users',
      };
    }
    case 'ride_request': {
      const price = d.price ? `$${Number(d.price)}` : 'no price';
      const message = (d.message as string) || (d.destination as string) || '';
      return {
        title: `Ride request • ${price}`,
        detail: message || 'New rider broadcast',
        href: '/admin/dashboard',
      };
    }
    case 'ride_booking': {
      const price = d.price ? `$${Number(d.price)}` : '';
      const driver = (d.driverHandle as string) ? `@${d.driverHandle}` : (d.driverName as string) || 'driver';
      const rider = (d.riderName as string) || 'rider';
      const isDirect = eventName === 'direct_booking_created';
      return {
        title: isDirect ? `Direct booking: ${driver} ${price}` : `Ride matched ${price}`,
        detail: isDirect ? `from ${rider}` : null,
        href: '/admin/dashboard',
      };
    }
  }
}

export function RealtimeNotificationBanner() {
  const { admin } = useAdminAuth();
  const router = useRouter();
  const [config, setConfig] = useState<AdminRealtimeNotifConfig | null>(null);
  const [banners, setBanners] = useState<BannerEntry[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const isSuper = !!admin?.isSuper;

  // Pull current config once. The config is small, doesn't change often,
  // and we don't need to revalidate live — admins toggling will see the
  // banner change next page load.
  useEffect(() => {
    if (!isSuper) return;
    let cancelled = false;
    fetch('/api/admin/realtime-notifications')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return;
        setConfig((data?.config as AdminRealtimeNotifConfig) || REALTIME_NOTIF_DEFAULTS);
      })
      .catch(() => {
        if (!cancelled) setConfig(REALTIME_NOTIF_DEFAULTS);
      });
    return () => { cancelled = true; };
  }, [isSuper]);

  const dismiss = useCallback((id: string) => {
    setBanners(prev => prev.filter(b => b.id !== id));
  }, []);

  const handleAdminEvent = useCallback((msg: { name: string; data: unknown; timestamp: number }) => {
    const type = EVENT_TO_TYPE[msg.name];
    if (!type) return;
    if (!config?.[type]) return;

    // Idempotency: Ably's `rewind: '2m'` re-delivers messages on reconnect,
    // so dedupe by a stable key derived from name + timestamp + a payload
    // hint (postId/userId/rideId).
    const d = (msg.data ?? {}) as Record<string, unknown>;
    const dedupeKey = `${msg.name}:${msg.timestamp}:${(d.postId as string) || (d.userId as string) || (d.rideId as string) || ''}`;
    if (seenIdsRef.current.has(dedupeKey)) return;
    seenIdsRef.current.add(dedupeKey);
    if (seenIdsRef.current.size > 200) seenIdsRef.current = new Set();

    const meta = TYPE_LABELS[type];
    const formatted = formatBanner(type, msg.name, msg.data);
    const id = `${dedupeKey}:${Math.random().toString(36).slice(2, 8)}`;

    setBanners(prev => {
      // Cap visible stack — drop the oldest if we're over.
      const next: BannerEntry[] = [
        ...prev.slice(-MAX_VISIBLE + 1),
        {
          id,
          type,
          emoji: meta.emoji,
          title: formatted.title,
          detail: formatted.detail,
          href: formatted.href,
          receivedAt: Date.now(),
        },
      ];
      return next;
    });

    // Auto-dismiss after window. Each banner manages its own timer via id.
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [config, dismiss]);

  // Only subscribe once we have a config and we're a super admin.
  useAbly({
    channelName: isSuper && config ? 'admin:feed' : null,
    onMessage: handleAdminEvent,
  });

  if (!isSuper || banners.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 'max(16px, env(safe-area-inset-top))',
        right: 16,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 'min(360px, calc(100vw - 32px))',
        pointerEvents: 'none',
      }}
    >
      {banners.map((b) => (
        <div
          key={b.id}
          role="alert"
          style={{
            pointerEvents: 'auto',
            background: '#0c1f10',
            border: '1px solid rgba(0,230,118,0.35)',
            borderRadius: 12,
            padding: '12px 14px',
            color: '#e6ffe6',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
            animation: 'rtnSlideIn 220ms ease-out',
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{b.emoji}</span>
          <div
            onClick={() => { if (b.href) router.push(b.href); dismiss(b.id); }}
            style={{ flex: 1, cursor: b.href ? 'pointer' : 'default', minWidth: 0 }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: '#fff' }}>{b.title}</div>
            {b.detail && (
              <div style={{ fontSize: 11, color: '#9fe3b3', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.detail}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismiss(b.id)}
            aria-label="Dismiss"
            style={{
              background: 'transparent', border: 'none', color: '#7fa890',
              cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2, flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
      <style>{`
        @keyframes rtnSlideIn {
          from { transform: translateX(8px); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}
