import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { API_BASE } from '@/lib/api';

export interface AppNotification {
  id: string;
  type: 'new_request' | 'ride_status' | 'cancelled' | 'matched' | 'info';
  title: string;
  body: string;
  route?: string;
  timestamp: number;
}

interface NotificationContextValue {
  unreadRequestCount: number;
  markRequestsSeen: () => void;
  currentBanner: AppNotification | null;
  dismissBanner: () => void;
  registerFeedRefresh: (fn: () => void) => () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadRequestCount: 0,
  markRequestsSeen: () => {},
  currentBanner: null,
  dismissBanner: () => {},
  registerFeedRefresh: () => () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, userId, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [unreadRequestCount, setUnreadRequestCount] = useState(0);
  const [bannerQueue, setBannerQueue] = useState<AppNotification[]>([]);
  const [currentBanner, setCurrentBanner] = useState<AppNotification | null>(null);

  const feedRefreshCallbacks = useRef<Set<() => void>>(new Set());

  const enqueue = useCallback((n: AppNotification) => {
    setBannerQueue((q) => [...q, n]);
  }, []);

  // Drain queue — show one at a time
  useEffect(() => {
    if (currentBanner || bannerQueue.length === 0) return;
    const [next, ...rest] = bannerQueue;
    setCurrentBanner(next);
    setBannerQueue(rest);
  }, [bannerQueue, currentBanner]);

  const dismissBanner = useCallback(() => {
    setCurrentBanner(null);
  }, []);

  const markRequestsSeen = useCallback(() => {
    setUnreadRequestCount(0);
  }, []);

  const registerFeedRefresh = useCallback((fn: () => void) => {
    feedRefreshCallbacks.current.add(fn);
    return () => { feedRefreshCallbacks.current.delete(fn); };
  }, []);

  const triggerFeedRefresh = useCallback(() => {
    feedRefreshCallbacks.current.forEach((fn) => fn());
  }, []);

  useEffect(() => {
    if (!isSignedIn || !userId) return;

    let cancelled = false;

    async function connect() {
      try {
        const Ably = await import('ably');
        if (cancelled) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = new Ably.Realtime({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          authCallback: async (_tokenParams: any, callback: any) => {
            try {
              const fresh = await getTokenRef.current();
              const res = await fetch(`${API_BASE}/ably/token`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${fresh ?? ''}`,
                },
                body: JSON.stringify({ keyName: 'global-notify', timestamp: Date.now() }),
              });
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const details = await res.json() as any;
              callback(null, details);
            } catch (err) {
              callback(err, null);
            }
          },
          disconnectedRetryTimeout: 5000,
          suspendedRetryTimeout: 15000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        if (cancelled) { client.close(); return; }

        const channel = client.channels.get(`user:${userId}:notify`, {
          params: { rewind: '2m' },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        channel.subscribe((msg: any) => {
          if (cancelled) return;
          const name = (msg.name ?? '') as string;
          handleEvent(name, (msg.data ?? {}) as Record<string, unknown>);
        });

        return () => {
          cancelled = true;
          try { channel.unsubscribe(); } catch {}
          try { client.close(); } catch {}
        };
      } catch (err) {
        console.error('[NotificationProvider]', err);
      }
    }

    const cleanup = connect();
    return () => {
      cancelled = true;
      cleanup.then((fn) => fn?.()).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, userId]);

  function handleEvent(name: string, data: Record<string, unknown>) {
    const rideId = data?.ride_id as string | undefined;

    switch (name) {
      case 'blast_rider_hmu': {
        const hmuPrice = data?.price as number | undefined;
        enqueue({
          id: `rider-hmu-${Date.now()}`,
          type: 'new_request',
          title: 'A RIDER CHOSE YOU',
          body: hmuPrice
            ? `$${hmuPrice} ride — respond before someone else does!`
            : 'A rider picked your card — respond fast!',
          route: '/(driver)/feed',
          timestamp: Date.now(),
        });
        break;
      }

      case 'blast_invite': {
        setUnreadRequestCount((c) => c + 1);
        enqueue({
          id: `blast-${Date.now()}`,
          type: 'new_request',
          title: 'NEW REQUEST',
          body: 'A rider near you is looking for a driver',
          route: '/(driver)/feed',
          timestamp: Date.now(),
        });
        break;
      }

      case 'direct_booking_request': {
        setUnreadRequestCount((c) => c + 1);
        enqueue({
          id: `direct-${Date.now()}`,
          type: 'new_request',
          title: 'DIRECT BOOKING',
          body: 'A rider booked you directly',
          route: '/(driver)/feed',
          timestamp: Date.now(),
        });
        break;
      }

      case 'blast_expired': {
        setUnreadRequestCount((c) => Math.max(0, c - 1));
        triggerFeedRefresh();
        break;
      }

      case 'blast_match_won': {
        const matchedRideId = data?.rideId as string | undefined;
        enqueue({
          id: `matched-${Date.now()}`,
          type: 'matched',
          title: 'MATCHED',
          body: "You got the ride — let's go!",
          route: matchedRideId ? `/(driver)/ride/active?rideId=${matchedRideId}` : '/(driver)/ride/active',
          timestamp: Date.now(),
        });
        triggerFeedRefresh();
        break;
      }

      case 'booking_accepted': {
        const acceptedRideId = data?.rideId as string | undefined;
        enqueue({
          id: `accepted-${Date.now()}`,
          type: 'matched',
          title: 'DRIVER ACCEPTED',
          body: 'Share your exact pickup so your driver can navigate to you.',
          route: acceptedRideId ? `/(rider)/ride/pull-up?rideId=${acceptedRideId}` : '/(rider)/home',
          timestamp: Date.now(),
        });
        break;
      }

      case 'ride_update': {
        const status = data?.status as string | undefined;
        const updateType = data?.type as string | undefined;

        if (updateType === 'add_on_confirmed') {
          enqueue({
            id: `addon-ok-${Date.now()}`,
            type: 'ride_status',
            title: 'EXTRA CONFIRMED',
            body: (data?.message as string) || 'Driver confirmed your add-on.',
            route: rideId ? `/(rider)/ride/${rideId}` : undefined,
            timestamp: Date.now(),
          });
          break;
        }
        if (updateType === 'add_on_rejected') {
          enqueue({
            id: `addon-no-${Date.now()}`,
            type: 'cancelled',
            title: 'EXTRA DECLINED',
            body: (data?.message as string) || 'Driver declined your add-on.',
            route: rideId ? `/(rider)/ride/${rideId}` : undefined,
            timestamp: Date.now(),
          });
          break;
        }
        if (updateType === 'add_on_payment_failed') {
          enqueue({
            id: `addon-fail-${Date.now()}`,
            type: 'cancelled',
            title: 'PAYMENT FAILED',
            body: (data?.message as string) || 'Card declined for this extra.',
            route: rideId ? `/(rider)/ride/${rideId}` : undefined,
            timestamp: Date.now(),
          });
          break;
        }

        if (status === 'cancelled') {
          enqueue({
            id: `cancelled-${Date.now()}`,
            type: 'cancelled',
            title: 'RIDE CANCELLED',
            body: 'The rider cancelled this ride.',
            route: '/(driver)/feed',
            timestamp: Date.now(),
          });
          triggerFeedRefresh();
        } else if (status === 'otw') {
          enqueue({
            id: `otw-${Date.now()}`,
            type: 'ride_status',
            title: 'DRIVER OTW',
            body: 'Your driver is on the way!',
            route: rideId ? `/(rider)/ride/${rideId}` : undefined,
            timestamp: Date.now(),
          });
        } else if (status === 'here') {
          enqueue({
            id: `here-${Date.now()}`,
            type: 'ride_status',
            title: 'DRIVER IS HERE',
            body: 'Your driver has arrived!',
            route: rideId ? `/(rider)/ride/${rideId}` : undefined,
            timestamp: Date.now(),
          });
        } else if (status === 'active') {
          enqueue({
            id: `active-${Date.now()}`,
            type: 'ride_status',
            title: 'RIDE STARTED',
            body: 'You are on your way!',
            route: rideId ? `/(rider)/ride/${rideId}` : undefined,
            timestamp: Date.now(),
          });
        } else if (status === 'ended' || status === 'completed') {
          enqueue({
            id: `ended-${Date.now()}`,
            type: 'ride_status',
            title: 'RIDE COMPLETE',
            body: 'Hope you had a smooth ride. Rate your driver!',
            route: '/(rider)/rides',
            timestamp: Date.now(),
          });
        }
        break;
      }

      default:
        break;
    }
  }

  return (
    <NotificationContext.Provider
      value={{ unreadRequestCount, markRequestsSeen, currentBanner, dismissBanner, registerFeedRefresh }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
