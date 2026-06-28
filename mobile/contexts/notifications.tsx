import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useStableToken } from '@/hooks/use-stable-token';
import { useRouter, usePathname } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { API_BASE } from '@/lib/api';

// Foreground pushes still surface a banner + sound (background/closed are shown
// by the OS automatically). Set once at module load.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface AppNotification {
  id: string;
  type: 'new_request' | 'ride_status' | 'cancelled' | 'matched' | 'info';
  title: string;
  body: string;
  route?: string;
  timestamp: number;
}

/** The user's current in-flight ride, tracked app-wide so any screen can route
 *  back to it and hint the next action. Mirror of the server `/rides/active`
 *  shape, kept fresh in realtime off the user notify channel. */
export interface ActiveRideState {
  rideId: string;
  status: string;
  isDriver: boolean;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  price?: number | null;
}

/** The single next thing the user should do, derived from ride status. Drives
 *  the global ActiveRideBar label + the route it sends them to. */
export interface NextAction {
  label: string;
  route: string;
}

// Live statuses where a ride is still in-flight (anything past this is history).
const LIVE_RIDE_STATUSES = ['matched', 'otw', 'here', 'confirming', 'active', 'in_progress'];

function deriveNextAction(ride: ActiveRideState | null): NextAction | null {
  if (!ride) return null;
  const route = ride.isDriver
    ? `/(driver)/ride/active?rideId=${ride.rideId}`
    : `/(rider)/ride/active?rideId=${ride.rideId}`;
  const labels: Record<string, string> = ride.isDriver
    ? {
        matched: 'Head to your rider', otw: 'Drive to pickup', here: 'Start the ride',
        confirming: 'Waiting on rider', active: 'Ride in progress', in_progress: 'Ride in progress',
      }
    : {
        matched: 'Pull up to start your ride', otw: 'Your driver is on the way',
        here: 'Your driver is here — hop in', confirming: "Tap I'm In to start",
        active: 'Enjoy your ride', in_progress: 'Enjoy your ride',
      };
  return { label: labels[ride.status] ?? 'View your ride', route };
}

interface NotificationContextValue {
  unreadRequestCount: number;
  markRequestsSeen: () => void;
  currentBanner: AppNotification | null;
  dismissBanner: () => void;
  registerFeedRefresh: (fn: () => void) => () => void;
  /** Register a callback fired whenever a ride update (status or add-on) arrives
   *  on the always-on user notify channel. The active ride screen uses this to
   *  re-pull authoritative state — a reliable backstop for the per-screen ride
   *  channel, which can briefly drop events around reconnects. */
  registerRideRefresh: (fn: () => void) => () => void;
  /** The user's current in-flight ride (null when none). Kept fresh in realtime. */
  activeRide: ActiveRideState | null;
  /** The next action the user should take on their active ride (null when none). */
  nextAction: NextAction | null;
  /** Force a re-pull of /rides/active (e.g. on tab focus). */
  refreshActiveRide: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadRequestCount: 0,
  markRequestsSeen: () => {},
  currentBanner: null,
  dismissBanner: () => {},
  registerFeedRefresh: () => () => {},
  registerRideRefresh: () => () => {},
  activeRide: null,
  nextAction: null,
  refreshActiveRide: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const getToken = useStableToken();
  const router = useRouter();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  // Track the current route so a new-request banner can be suppressed when the
  // driver is already on the feed (the request card surfaces inline there).
  const pathname = usePathname();
  const onFeedRef = useRef(false);
  onFeedRef.current = (pathname ?? '').endsWith('/feed');

  const [unreadRequestCount, setUnreadRequestCount] = useState(0);
  const [bannerQueue, setBannerQueue] = useState<AppNotification[]>([]);
  const [currentBanner, setCurrentBanner] = useState<AppNotification | null>(null);
  const [activeRide, setActiveRide] = useState<ActiveRideState | null>(null);
  // The DB users.id — NOT the Clerk id. The server publishes every ride/booking
  // event to `user:{dbUserId}:notify` (web resolves this id via /api/users/me).
  // Subscribing with the Clerk id silently receives nothing, which kills every
  // app-wide notification (request banners, backstop ride refresh, wallet, etc).
  // So we resolve the DB id first and key the notify subscription on it.
  const [dbUserId, setDbUserId] = useState<string | null>(null);

  const feedRefreshCallbacks = useRef<Set<() => void>>(new Set());
  const rideRefreshCallbacks = useRef<Set<() => void>>(new Set());

  // Register this device for OS-level push as soon as the user is signed in —
  // for riders AND drivers (previously only driver home registered, and without
  // a permission prompt, so the token fetch silently failed). Asks permission,
  // gets the Expo push token, and syncs it to /users/push-token. Best-effort.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const current = await Notifications.getPermissionsAsync();
        let granted = current.granted
          || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
        if (!granted) {
          const req = await Notifications.requestPermissionsAsync();
          granted = req.granted;
        }
        if (!granted || cancelled) return;
        const tokenResp = await Notifications.getExpoPushTokenAsync().catch(() => null);
        if (!tokenResp || cancelled) return;
        const clerkToken = await getTokenRef.current();
        if (!clerkToken || cancelled) return;
        await fetch(`${API_BASE}/users/push-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clerkToken}` },
          body: JSON.stringify({
            push_token: tokenResp.data,
            push_platform: Platform.OS === 'ios' ? 'ios' : 'android',
          }),
        }).catch(() => {});
      } catch {
        // push is best-effort — never block the app on it
      }
    })();
    return () => { cancelled = true; };
  }, [isSignedIn]);

  // Route the user to the right screen when they TAP a push (background or
  // cold-start launch). Without this, tapping "Ride accepted" just opened the
  // app on home and the rider waited for Ably to reconnect (5–10s) before the
  // ride surfaced. The push payload carries { type, rideId } — we route off it
  // immediately and optimistically seed the active ride so the destination
  // renders its shell instantly.
  const routeFromPush = useCallback((data: Record<string, unknown> | undefined) => {
    if (!data) return;
    const type = data.type as string | undefined;
    const rideId = (data.rideId ?? data.ride_id) as string | undefined;
    switch (type) {
      case 'booking_accepted':
        if (rideId) {
          setActiveRide({ rideId, status: 'matched', isDriver: false });
          router.push(`/(rider)/ride/active?rideId=${rideId}&seedStatus=matched` as never);
        }
        break;
      case 'blast_match_won':
        if (rideId) {
          setActiveRide({ rideId, status: 'matched', isDriver: true });
          router.push(`/(driver)/ride/active?rideId=${rideId}` as never);
        }
        break;
      case 'ride_update':
        if (rideId) router.push(`/(rider)/ride/active?rideId=${rideId}` as never);
        break;
      case 'blast_invite':
      case 'direct_booking_request':
      case 'blast_rider_hmu':
        router.push('/(driver)/feed' as never);
        break;
      default:
        break;
    }
  }, [router]);

  // Tap handler (warm: app running/backgrounded) + cold-start (app launched by
  // tapping a push). Gated on sign-in so we never route an unauthenticated shell.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;

    Notifications.getLastNotificationResponseAsync()
      .then((resp) => {
        if (cancelled || !resp) return;
        // Defer a tick so the navigator is mounted on a cold launch.
        setTimeout(() => {
          if (!cancelled) routeFromPush(resp.notification.request.content.data as Record<string, unknown>);
        }, 450);
      })
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      routeFromPush(resp.notification.request.content.data as Record<string, unknown>);
      refreshActiveRide();
    });
    return () => { cancelled = true; sub.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, routeFromPush]);

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

  const registerRideRefresh = useCallback((fn: () => void) => {
    rideRefreshCallbacks.current.add(fn);
    return () => { rideRefreshCallbacks.current.delete(fn); };
  }, []);

  const triggerRideRefresh = useCallback(() => {
    rideRefreshCallbacks.current.forEach((fn) => fn());
  }, []);

  // Pull the user's current in-flight ride from the server (source of truth) and
  // mirror it into context. Fired on sign-in and whenever a realtime ride event
  // lands, so any screen can route back to the active ride + hint the next step.
  const refreshActiveRide = useCallback(() => {
    void (async () => {
      try {
        const t = await getTokenRef.current();
        if (!t) return;
        const res = await fetch(`${API_BASE}/rides/active`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!res.ok) return;
        const data = await res.json() as {
          hasActiveRide?: boolean; rideId?: string; status?: string; isDriver?: boolean;
          pickupAddress?: string | null; dropoffAddress?: string | null; price?: number | null;
        };
        if (data?.hasActiveRide && data.rideId && data.status && LIVE_RIDE_STATUSES.includes(data.status)) {
          setActiveRide({
            rideId: data.rideId, status: data.status, isDriver: !!data.isDriver,
            pickupAddress: data.pickupAddress ?? null,
            dropoffAddress: data.dropoffAddress ?? null,
            price: data.price ?? null,
          });
        } else {
          setActiveRide(null);
        }
      } catch { /* best-effort — keep prior state on transient errors */ }
    })();
  }, []);

  // Seed + clear the active ride with the auth state.
  useEffect(() => {
    if (!isSignedIn) { setActiveRide(null); return; }
    refreshActiveRide();
  }, [isSignedIn, refreshActiveRide]);

  // Resolve the DB users.id (the channel the server actually publishes to).
  // Mirrors web's global-ride-alert, which fetches /api/users/me → data.id.
  useEffect(() => {
    if (!isSignedIn) { setDbUserId(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const t = await getTokenRef.current();
        if (!t || cancelled) return;
        const res = await fetch(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${t}` } });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { id?: string };
        if (data?.id && !cancelled) setDbUserId(data.id);
      } catch { /* best-effort — without this, app-wide notify stays silent */ }
    })();
    return () => { cancelled = true; };
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || !dbUserId) return;

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

        const channel = client.channels.get(`user:${dbUserId}:notify`, {
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
  }, [isSignedIn, dbUserId]);

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
        // Always refresh the feed so a driver already on it sees the card appear
        // even if its own channel briefly drops the event.
        triggerFeedRefresh();
        // Already on the feed? The request card surfaces inline — don't stack a
        // redundant banner. The deep-link nudge is only for other screens.
        if (onFeedRef.current) break;
        const reqPrice = data?.price as number | undefined;
        const reqHandle = (data?.riderHandle as string | undefined) || undefined;
        enqueue({
          id: `direct-${Date.now()}`,
          type: 'new_request',
          title: reqHandle ? `@${reqHandle} JUST HMU` : 'NEW RIDE REQUEST',
          body: reqHandle
            ? `@${reqHandle} wants a ride${reqPrice ? ` — $${reqPrice}` : ''}. Tap to respond before it expires.`
            : reqPrice
              ? `A rider wants you — $${reqPrice}. Tap to respond before it expires.`
              : 'A rider booked you directly — tap to respond.',
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
        // Driver just won a ride — surface it app-wide immediately (optimistic),
        // then reconcile with the server.
        if (matchedRideId) setActiveRide({ rideId: matchedRideId, status: 'matched', isDriver: true });
        refreshActiveRide();
        triggerFeedRefresh();
        break;
      }

      case 'booking_accepted': {
        const acceptedRideId = data?.rideId as string | undefined;
        enqueue({
          id: `accepted-${Date.now()}`,
          type: 'matched',
          title: 'DRIVER ACCEPTED',
          body: "You're matched — pull up to lock it in.",
          // Parity with the driver, who lands on their active ride screen on
          // accept. The rider's active screen handles the inline Pull Up (COO)
          // using the addresses they entered at booking — no re-entry, no detour.
          route: acceptedRideId ? `/(rider)/ride/active?rideId=${acceptedRideId}` : '/(rider)/home',
          timestamp: Date.now(),
        });
        // Driver accepted the rider's direct booking. Set the active ride the
        // instant the realtime event lands so the Waiting screen stops its
        // countdown and routes straight in — no 5s poll lag. Reconcile after.
        if (acceptedRideId) setActiveRide({ rideId: acceptedRideId, status: 'matched', isDriver: false });
        refreshActiveRide();
        break;
      }

      case 'ride_update': {
        const status = data?.status as string | undefined;
        const updateType = data?.type as string | undefined;

        // Backstop refresh: re-pull authoritative ride + add-on state on the
        // active ride screen, independent of its per-screen ride channel. This
        // is what guarantees the rider's extras flip to CONFIRMED the moment the
        // driver approves, and that status changes land even across reconnects.
        triggerRideRefresh();

        // Keep the app-wide active ride status in lockstep (drives the global
        // ActiveRideBar + REQUESTS badge). Optimistically patch the status, then
        // reconcile against /rides/active (which also clears it on ended/cancelled).
        if (status && rideId) {
          setActiveRide((prev) => (prev && prev.rideId === rideId ? { ...prev, status } : prev));
        }
        refreshActiveRide();

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

  const nextAction = deriveNextAction(activeRide);

  return (
    <NotificationContext.Provider
      value={{
        unreadRequestCount, markRequestsSeen, currentBanner, dismissBanner,
        registerFeedRefresh, registerRideRefresh,
        activeRide, nextAction, refreshActiveRide,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
