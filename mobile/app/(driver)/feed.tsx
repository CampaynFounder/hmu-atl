// Driver requests feed — incoming blast requests + delivery opportunities.
// APIs: GET /drivers/requests, POST /bookings/{id}/accept, POST /bookings/{id}/decline
//       GET /delivery/nearby
// Ably: user:{driverId}:notify → blast_invite / blast_expired triggers refetch

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, RefreshControl, ActivityIndicator, Alert, Share,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { useAbly } from '@/hooks/use-ably';
import { useNotifications } from '@/contexts/notifications';
import { CommentsAccordion } from '@/components/CommentsAccordion';
import { SwipeDeck } from '@/components/SwipeDeck';
import type { DeliveryOpportunity } from '@/shared/delivery-types';

// Matches the camelCase shape returned by GET /api/drivers/requests
interface Stop {
  lat: number;
  lng: number;
  address?: string;
}

interface BlastRequest {
  id: string;
  type: 'blast' | 'direct' | 'open' | 'down_bad';
  locked: boolean;
  targetId: string | null;
  riderName: string;
  riderHandle: string | null;
  riderAvatarUrl: string | null;
  riderChillScore: number;
  riderCompletedRides: number;
  isCash: boolean;
  pickupAreaSlug: string | null;
  dropoffAreaSlug: string | null;
  pickupAddress: string;
  destination: string;
  stops: Stop[];
  roundTrip: boolean;
  time: string;
  price: number;
  expiresAt: string;
  createdAt: string;
  riderOnline: boolean;
  // down_bad-specific (the favor the rider is asking for)
  sumExtraText?: string;
  sumExtraMediaUrl?: string;
  sumExtraMediaType?: 'photo' | 'video';
  isDirectOffer?: boolean;
  // local-only: set after driver taps HMU so the card flips immediately
  _hmuAt?: string;
}

type FeedTab = 'rides' | 'deliveries';

export default function DriverFeed() {
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [tab, setTab] = useState<FeedTab>('rides');
  const [requests, setRequests] = useState<BlastRequest[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState(false);
  const [riderHmuIds, setRiderHmuIds] = useState<Set<string>>(new Set());
  const [marketSlug, setMarketSlug] = useState<string | null>(null);
  const [driverHandle, setDriverHandle] = useState<string | null>(null);

  const driverId = user?.publicMetadata?.databaseId as string | undefined;
  const { registerFeedRefresh } = useNotifications();

  // Stable ref so callbacks don't recreate when Clerk refreshes the session token.
  // Without this, getToken reference changes → fetchDeliveries gets new reference →
  // useEffect fires again on the deliveries tab → infinite re-fetch loop + loading glitch.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    getToken().then(setToken).catch(() => {});
    const interval = setInterval(() => getToken().then(setToken).catch(() => {}), 60_000);
    return () => clearInterval(interval);
  }, [getToken]);

  const fetchRequests = useCallback(async () => {
    try {
      const t = await getTokenRef.current();
      const data = await apiClient<{ requests: BlastRequest[]; marketSlug?: string | null }>('/drivers/requests', t);
      setRequests(data.requests ?? []);
      if (data.marketSlug) setMarketSlug(data.marketSlug);
    } catch (err) {
      console.warn('[feed] fetchRequests error:', err);
    }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const fetchDeliveries = useCallback(async () => {
    setDeliveriesLoading(true);
    try {
      const t = await getTokenRef.current();
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;

      // getLastKnownPositionAsync is instant — getCurrentPositionAsync hangs on simulators.
      const loc = await Location.getLastKnownPositionAsync();
      // Fall back to Atlanta city center if no cached position yet.
      const lat = loc?.coords.latitude ?? 33.749;
      const lng = loc?.coords.longitude ?? -84.388;

      const data = await apiClient<{ opportunities: DeliveryOpportunity[] }>(
        `/delivery/nearby?lat=${lat}&lng=${lng}`,
        t,
      );
      setDeliveries(data.opportunities ?? []);
    } catch (err) {
      console.warn('[feed] fetchDeliveries error:', err);
    }
    finally { setDeliveriesLoading(false); setRefreshing(false); }
  }, []);

  // Initial load + backstop poll. Ably (market:{slug}:feed + user:{id}:notify)
  // is the fast path, but a 20s poll guarantees a new request surfaces even if a
  // socket drops — matching the web driver feed, which polls every 15s. Without
  // this the mobile feed only ever fetched once on mount.
  useEffect(() => {
    void fetchRequests();
    const id = setInterval(() => void fetchRequests(), 20_000);
    return () => clearInterval(id);
  }, [fetchRequests]);
  useEffect(() => { if (tab === 'deliveries') void fetchDeliveries(); }, [tab, fetchDeliveries]);

  // Register with the global notification context so events arriving while the
  // driver is on a different screen (e.g. ride/active) still clear stale cards.
  useEffect(() => {
    return registerFeedRefresh(() => { void fetchRequests(); });
  }, [fetchRequests, registerFeedRefresh]);

  useAbly({
    channelName: driverId ? `user:${driverId}:notify` : null,
    token,
    onMessage: (msg) => {
      // direct_booking_request fires when a rider specifically books this driver.
      // blast_invite fires when the market fan-out includes this driver.
      // down_bad_posted fires when a rider posts a Down Bad favor to the market
      // (or directly to this driver) — same per-driver rail as direct bookings.
      if (
        msg.name === 'blast_invite' ||
        msg.name === 'blast_cancelled' ||
        msg.name === 'direct_booking_request' ||
        msg.name === 'down_bad_posted'
      ) {
        void fetchRequests();
      }
      // delivery_posted fires when a rider creates a store run in this market.
      if (msg.name === 'delivery_posted') {
        void fetchDeliveries();
      }
      if (msg.name === 'blast_expired') {
        const d = msg.data as Record<string, unknown>;
        const blastId = d?.blastId as string | undefined;
        if (blastId) {
          setRequests((prev) => prev.filter((r) => r.id !== blastId));
        }
      }
      // Rider cancelled a matched ride — show banner then refresh
      if (msg.name === 'ride_update') {
        const d = msg.data as Record<string, unknown>;
        if (d?.status === 'cancelled') {
          setCancelNotice(true);
          setTimeout(() => {
            setCancelNotice(false);
            void fetchRequests();
          }, 2500);
        }
      }
      // Rider swiped right on this driver specifically
      if (msg.name === 'blast_rider_hmu') {
        const d = msg.data as Record<string, unknown>;
        const blastId = d?.blastId as string | undefined;
        if (blastId) {
          setRiderHmuIds(prev => new Set(prev).add(blastId));
          void fetchRequests();
        }
      }

      // blast request: rider selected this driver
      if (msg.name === 'blast_match_won') {
        const d = msg.data as Record<string, unknown>;
        const rideId = d?.rideId as string | undefined;
        if (rideId) {
          router.push({ pathname: '/(driver)/ride/active' as any, params: { rideId } });
        }
      }
      // open rider_request: rider picked this driver from the interested pool
      if (msg.name === 'booking_accepted') {
        const d = msg.data as Record<string, unknown>;
        const rideId = d?.rideId as string | undefined;
        if (rideId) {
          router.push({ pathname: '/(driver)/ride/active' as any, params: { rideId } });
        }
      }
    },
  });

  // Market feed channel — every NEW market-wide request broadcasts here:
  // open rider_request, Down Bad, and store-run/delivery. The web driver feeds
  // already subscribe to this; mobile didn't, so these never auto-surfaced in a
  // logged-in driver's view. Refetch on any event (deliveries on delivery_posted).
  useAbly({
    channelName: marketSlug ? `market:${marketSlug}:feed` : null,
    token,
    onMessage: (msg) => {
      if (msg.name === 'delivery_posted') void fetchDeliveries();
      else void fetchRequests();
    },
  });

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (tab === 'rides') void fetchRequests();
    else void fetchDeliveries();
  }, [tab, fetchRequests, fetchDeliveries]);

  // Load the driver handle once so the empty state can share their HMU link.
  useEffect(() => {
    getTokenRef.current()
      .then((t) => apiClient<{ driverHandle: string | null }>('/users/me', t))
      .then((d) => { if (d.driverHandle) setDriverHandle(d.driverHandle); })
      .catch(() => {});
  }, []);

  async function shareHmuLink() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const url = driverHandle
      ? `https://atl.hmucashride.com/d/${driverHandle}`
      : 'https://atl.hmucashride.com';
    try {
      await Share.share({
        message: `Need a ride? HMU 🚗💨 Book me here: ${url}`,
        url,
      });
    } catch { /* user dismissed the share sheet */ }
  }

  async function handleHmu(request: BlastRequest) {
    setActing(request.id);
    try {
      const t = await getToken();
      const res = await apiClient<{ status: string; rideId?: string }>(`/bookings/${request.id}/accept`, t, { method: 'POST' });
      // Direct booking match — go straight to the active ride screen
      if (res.rideId) {
        router.push({ pathname: '/(driver)/ride/active' as any, params: { rideId: res.rideId } });
        return;
      }
      // Blast / open request — flip card to HMU Sent state
      setRequests((prev) => prev.map((r) => r.id === request.id ? { ...r, _hmuAt: new Date().toISOString() } : r));
    } catch (e: any) {
      Alert.alert('Could not HMU', e.message ?? 'Try again');
    } finally {
      setActing(null);
    }
  }

  async function handlePass(request: BlastRequest) {
    // Optimistically remove the card immediately
    setRequests((prev) => prev.filter((r) => r.id !== request.id));
    const t = await getToken();
    apiClient(`/bookings/${request.id}/decline`, t, { method: 'POST' }).catch(() => {});
  }

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  const active = requests.filter((r) => !r._hmuAt);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>
          {tab === 'rides' ? 'INCOMING REQUESTS' : 'DELIVERY JOBS'}
        </Text>
        {tab === 'rides' && active.length > 0 && (
          <View style={s.countBadge}>
            <Text style={s.countText}>{active.length}</Text>
          </View>
        )}
        {tab === 'deliveries' && deliveries.length > 0 && (
          <View style={[s.countBadge, { backgroundColor: colors.pink }]}>
            <Text style={s.countText}>{deliveries.length}</Text>
          </View>
        )}
      </View>

      {/* Tab Toggle */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'rides' && s.tabBtnActive]}
          onPress={() => setTab('rides')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="car-outline"
            size={14}
            color={tab === 'rides' ? colors.green : colors.textFaint}
          />
          <Text style={[s.tabBtnText, tab === 'rides' && s.tabBtnTextActive]}>RIDES</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'deliveries' && s.tabBtnDelivery]}
          onPress={() => setTab('deliveries')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="bag-handle-outline"
            size={14}
            color={tab === 'deliveries' ? colors.pink : colors.textFaint}
          />
          <Text style={[s.tabBtnText, tab === 'deliveries' && s.tabBtnTextDelivery]}>DELIVERIES</Text>
          {tab !== 'deliveries' && deliveries.length > 0 && (
            <View style={s.tabDot}>
              <Text style={s.tabDotText}>{deliveries.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {cancelNotice && (
        <View style={s.cancelBanner}>
          <Ionicons name="close-circle" size={14} color={colors.red} />
          <Text style={s.cancelBannerText}>Rider cancelled this ride</Text>
        </View>
      )}

      {tab === 'rides' ? (
        active.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🔗</Text>
            <Text style={s.emptyTitle}>Share your HMU Link to get requests</Text>
            <Text style={s.emptyBody}>
              Grow your HMU network to earn even more. Post your HMU link on FB —
              we hold their funds upfront, no gas money wasted.
            </Text>
            <TouchableOpacity style={s.shareBtn} activeOpacity={0.85} onPress={shareHmuLink}>
              <Ionicons name="share-social" size={15} color={colors.bg} />
              <Text style={s.shareBtnText}>SHARE MY HMU LINK</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.emptyRefresh} activeOpacity={0.7} onPress={onRefresh}>
              {refreshing
                ? <ActivityIndicator size="small" color={colors.green} />
                : <>
                    <Ionicons name="refresh" size={13} color={colors.green} />
                    <Text style={s.emptyRefreshText}>TAP TO REFRESH</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        ) : (
          <SwipeDeck
            items={active}
            keyExtractor={(item) => item.id}
            rightLabel="HMU"
            leftLabel="NAH"
            onSwipeRight={(item) => handleHmu(item)}
            onSwipeLeft={(item) => handlePass(item)}
            renderCard={(item) => (
              <DeckRequestCard
                request={item}
                riderWantsYou={riderHmuIds.has(item.id)}
                token={token}
              />
            )}
            renderControls={({ onLeft, onRight, topItem }) => (
              <DeckControls
                onPass={onLeft}
                onHmu={onRight}
                isDownBad={topItem?.type === 'down_bad'}
                disabled={!topItem}
              />
            )}
          />
        )
      ) : (
        <FlatList
          data={deliveries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.pink} />}
          ListEmptyComponent={
            deliveriesLoading
              ? <ActivityIndicator size="large" color={colors.pink} style={{ marginTop: 60 }} />
              : (
                <View style={s.empty}>
                  <Text style={s.emptyEmoji}>📦</Text>
                  <Text style={s.emptyTitle}>No deliveries nearby</Text>
                  <Text style={s.emptyBody}>
                    Pull down to refresh. New requests appear as customers place orders.
                  </Text>
                </View>
              )
          }
          renderItem={({ item }) => (
            <DeliveryCard
              opportunity={item}
              onAccept={async () => {
                setActing(item.id);
                try {
                  const t = await getToken();
                  await apiClient(`/delivery/${item.id}/accept`, t, { method: 'POST' });
                  router.push(`/(driver)/delivery/${item.id}` as any);
                } catch (e: any) {
                  Alert.alert('Could not accept', e.message ?? 'Try again');
                } finally {
                  setActing(null);
                }
              }}
              acting={acting === item.id}
            />
          )}
        />
      )}
    </View>
  );
}

// Full-height card body for the driver swipe deck. Same information as BlastCard
// (rider, route, price, Down Bad favor, reputation) but without inline action
// buttons — the deck supplies swipe + the PASS/HMU controls below the stack.
function DeckRequestCard({
  request, riderWantsYou, token,
}: {
  request: BlastRequest;
  riderWantsYou: boolean;
  token: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const msLeft = Math.max(0, new Date(request.expiresAt).getTime() - now);
  const minsLeft = Math.floor(msLeft / 60000);
  const secsLeft = Math.floor((msLeft % 60000) / 1000);
  const isUrgent = minsLeft < 5;
  const isExpired = msLeft === 0;
  const timer = isExpired ? 'EXPIRED' : `${minsLeft}:${String(secsLeft).padStart(2, '0')}`;

  const pickup = request.pickupAddress || request.pickupAreaSlug || 'Pickup';
  const dropoff = request.destination || request.dropoffAreaSlug || 'Dropoff';
  const isDownBad = request.type === 'down_bad';
  const isDirect = request.type === 'direct';

  return (
    <View style={[s.deckCard, shadow.card, isDownBad && s.downBadCard]}>
      {/* ── Rider row ── */}
      <View style={s.riderRow}>
        <RiderAvatar url={request.riderAvatarUrl} name={request.riderHandle ?? request.riderName} />
        <View style={s.riderInfo}>
          <Text style={s.riderHandle} numberOfLines={1}>
            {request.riderHandle ? `@${request.riderHandle}` : request.riderName}
          </Text>
          {request.riderCompletedRides > 0 && (
            <Text style={s.riderMeta}>{request.riderCompletedRides} rides</Text>
          )}
        </View>
        <View style={[s.timerPill, isUrgent && s.timerPillUrgent, isExpired && s.timerPillExpired]}>
          {!isExpired && (
            <Ionicons
              name="time-outline"
              size={11}
              color={isUrgent ? colors.red : colors.textFaint}
              style={{ marginRight: 4 }}
            />
          )}
          <Text style={[s.timerText, isUrgent && s.timerTextUrgent, isExpired && s.timerTextExpired]}>
            {timer}
          </Text>
        </View>
      </View>

      {/* ── Meta chips ── */}
      <View style={s.metaRow}>
        {isDownBad && <MetaChip label={request.isDirectOffer ? '🙏 DOWN BAD · FOR YOU' : '🙏 DOWN BAD'} accent />}
        {isDirect && <MetaChip label="🎯 BOOKED YOU" accent />}
        {riderWantsYou && <MetaChip label="🎯 RIDER WANTS YOU" accent />}
        {request.isCash && <MetaChip label="CASH" cash />}
        {request.roundTrip && <MetaChip label="ROUND TRIP" accent />}
        {request.time ? <MetaChip label={request.time} /> : null}
        {request.riderChillScore > 0 && (
          <MetaChip label={`${Math.round(request.riderChillScore)} chill`} accent />
        )}
      </View>

      {/* ── Route ── */}
      <View style={s.deckRoute}>
        <View style={s.routeRow}>
          <Ionicons name="navigate-outline" size={14} color={colors.textFaint} style={{ marginRight: 6 }} />
          <Text style={s.deckArea} numberOfLines={2}>{pickup} → {dropoff}</Text>
        </View>
        {request.stops.length > 0 && (
          <View style={s.stopsRow}>
            <Ionicons name="git-branch-outline" size={12} color={colors.textFaint} style={{ marginRight: 4 }} />
            <Text style={s.stopsText} numberOfLines={1}>
              {request.stops.length} stop{request.stops.length > 1 ? 's' : ''}
              {request.stops[0]?.address ? `: ${request.stops[0].address}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* ── Down Bad favor (the ask + media) ── */}
      {isDownBad && (request.sumExtraText || request.sumExtraMediaUrl) && (
        <View style={s.downBadAsk}>
          {!!request.sumExtraText && (
            <Text style={s.downBadAskText} numberOfLines={3}>{`“${request.sumExtraText}”`}</Text>
          )}
          {!!request.sumExtraMediaUrl && request.sumExtraMediaType === 'photo' && (
            <Image source={{ uri: request.sumExtraMediaUrl }} style={s.deckDownBadMedia} alt="" />
          )}
          {!!request.sumExtraMediaUrl && request.sumExtraMediaType === 'video' && (
            <View style={[s.deckDownBadMedia, s.downBadVideo]}>
              <Ionicons name="play-circle" size={36} color={colors.pink} />
            </View>
          )}
        </View>
      )}

      <View style={{ flex: 1 }} />

      {/* ── Price ── */}
      <Text style={s.deckPrice}>${Number(request.price).toFixed(2)}</Text>

      {/* ── Rider comments ── */}
      {request.riderHandle && (
        <CommentsAccordion
          handle={request.riderHandle}
          token={token}
          accentColor={colors.textFaint}
        />
      )}
    </View>
  );
}

// PASS / HMU controls under the deck. Trigger the top card's swipe animation so
// a button tap reads the same as a manual swipe.
function DeckControls({
  onPass, onHmu, isDownBad, disabled,
}: {
  onPass: () => void;
  onHmu: () => void;
  isDownBad: boolean;
  disabled: boolean;
}) {
  return (
    <View style={s.deckControls}>
      <TouchableOpacity
        style={[s.deckCtrlBtn, s.deckCtrlPass, disabled && s.disabled]}
        onPress={onPass}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Ionicons name="close" size={26} color={colors.red} />
        <Text style={[s.deckCtrlLabel, { color: colors.red }]}>PASS</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.deckCtrlBtn, s.deckCtrlHmu, disabled && s.disabled]}
        onPress={onHmu}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Ionicons name="paper-plane" size={24} color={colors.green} />
        <Text style={[s.deckCtrlLabel, { color: colors.green }]}>{isDownBad ? 'HELP' : 'HMU'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function RiderAvatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const letter = (name ?? '?')[0].toUpperCase();
  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={s.avatar}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[s.avatar, s.avatarFallback]}>
      <Text style={s.avatarLetter}>{letter}</Text>
    </View>
  );
}

function MetaChip({ label, accent, cash }: { label: string; accent?: boolean; cash?: boolean }) {
  return (
    <View style={[s.chip, accent && s.chipAccent, cash && s.chipCash]}>
      <Text style={[s.chipText, accent && s.chipTextAccent, cash && s.chipTextCash]}>{label}</Text>
    </View>
  );
}

// ── Delivery Opportunity Card ─────────────────────────────────────────────────

function DeliveryCard({
  opportunity, onAccept, acting,
}: {
  opportunity: DeliveryOpportunity;
  onAccept: () => void;
  acting: boolean;
}) {
  const topItems = opportunity.items.slice(0, 3);
  const moreCount = opportunity.itemCount - topItems.length;

  return (
    <View style={[s.card, s.deliveryCard, shadow.card]}>
      {/* Payout highlight */}
      <View style={s.deliveryPayoutRow}>
        <View style={s.deliveryPayoutCol}>
          <Text style={s.deliveryPayoutLabel}>YOU EARN</Text>
          <Text style={[s.deliveryPayoutValue, { color: colors.green }]}>
            ${opportunity.courierEarn.toFixed(2)}
          </Text>
        </View>
        <View style={s.deliveryPayoutCol}>
          <Text style={s.deliveryPayoutLabel}>YOU ADVANCE</Text>
          <Text style={[s.deliveryPayoutValue, { color: colors.amber }]}>
            ~${opportunity.courierAdvance.toFixed(2)}
          </Text>
        </View>
        <View style={s.deliveryPayoutCol}>
          <Text style={s.deliveryPayoutLabel}>TAKE HOME</Text>
          <Text style={[s.deliveryPayoutValue, { color: colors.pink, fontFamily: fonts.display, fontSize: 20 }]}>
            ${opportunity.courierGuaranteed.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Merchant */}
      <View style={s.deliveryMerchantRow}>
        <Ionicons name="storefront-outline" size={14} color={colors.textFaint} />
        <Text style={s.deliveryMerchant} numberOfLines={1}>{opportunity.merchantName}</Text>
        <Text style={s.deliveryDist}>{opportunity.distanceMiles} mi</Text>
      </View>

      {/* Items preview */}
      <View style={s.deliveryItems}>
        {topItems.map((item, i) => (
          <Text key={i} style={s.deliveryItem} numberOfLines={1}>
            {item.quantity}× {item.name}
          </Text>
        ))}
        {moreCount > 0 && (
          <Text style={s.deliveryItemMore}>+{moreCount} more item{moreCount > 1 ? 's' : ''}</Text>
        )}
      </View>

      {/* Accept */}
      <TouchableOpacity
        style={[s.deliveryAcceptBtn, acting && s.disabled]}
        onPress={onAccept}
        disabled={acting}
        activeOpacity={0.85}
      >
        {acting
          ? <ActivityIndicator size="small" color={colors.bg} />
          : <Text style={s.deliveryAcceptText}>ACCEPT JOB 📦</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.textPrimary },
  countBadge: { backgroundColor: colors.green, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.bg },

  cancelBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.redDim, borderBottomWidth: 1, borderBottomColor: colors.redBorder,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
  },
  cancelBannerText: { fontFamily: fonts.mono, fontSize: 12, color: colors.red, letterSpacing: 0.5 },

  list: { paddingHorizontal: spacing.xl, paddingBottom: 48, gap: spacing.md },

  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: spacing.xxl },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.lg },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, textAlign: 'center', lineHeight: 22 },

  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, borderWidth: 1, borderColor: colors.borderStrong },
  downBadCard: { borderColor: colors.pinkBorder },
  downBadAsk: { marginBottom: spacing.md, gap: spacing.sm },
  downBadAskText: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, fontStyle: 'italic', lineHeight: 20 },
  downBadMedia: { width: '100%', height: 160, borderRadius: radius.sm, backgroundColor: colors.cardAlt },
  downBadVideo: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.pinkBorder },

  // Rider row: avatar + name/rides + timer
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: fonts.display, fontSize: 24, color: colors.green },
  riderInfo: { flex: 1 },
  riderHandle: { fontFamily: fonts.mono, fontSize: 13, color: colors.textPrimary, letterSpacing: 0.3 },
  riderMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },

  routeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  area: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, flex: 1 },
  stopsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  stopsText: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, flex: 1 },

  timerPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  timerPillUrgent: { borderColor: colors.redBorder, backgroundColor: colors.redDim },
  timerPillExpired: { borderColor: colors.border, backgroundColor: colors.cardAlt },
  timerText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textFaint },
  timerTextUrgent: { color: colors.red },
  timerTextExpired: { color: colors.textFaint },

  price: { fontFamily: fonts.display, fontSize: 44, color: colors.green, lineHeight: 46, marginBottom: spacing.sm },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg },
  chip: { backgroundColor: colors.cardAlt, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  chipAccent: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  chipCash: { backgroundColor: colors.cashDim, borderColor: colors.cashBorder },
  chipText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary },
  chipTextAccent: { color: colors.green },
  chipTextCash: { color: colors.cash },

  actions: { flexDirection: 'row', gap: spacing.sm },
  passBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.cardAlt, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  passBtnText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary, letterSpacing: 1 },
  hmuBtn: { flex: 2, paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.green, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  hmuBtnText: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.bg, letterSpacing: 0.5 },

  hmdConfirm: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.greenDim, borderRadius: radius.pill, paddingVertical: 14, borderWidth: 1, borderColor: colors.greenBorder },
  hmdConfirmText: { fontFamily: fonts.mono, fontSize: 12, color: colors.green, letterSpacing: 1 },

  // Tab bar
  tabBar: {
    flexDirection: 'row', marginHorizontal: spacing.xl, marginBottom: spacing.sm,
    backgroundColor: colors.cardAlt, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, padding: 3,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: radius.pill,
  },
  tabBtnActive: { backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder },
  tabBtnDelivery: { backgroundColor: colors.pinkDim, borderWidth: 1, borderColor: colors.pinkBorder },
  tabBtnText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 1.5 },
  tabBtnTextActive: { color: colors.green },
  tabBtnTextDelivery: { color: colors.pink },
  tabDot: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center',
  },
  tabDotText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.bg },

  // ── Swipe deck ──
  deckCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginVertical: spacing.md,
  },
  deckRoute: { marginTop: spacing.md },
  deckArea: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  deckDownBadMedia: {
    width: '100%', height: 150, borderRadius: radius.cardInner, marginTop: spacing.sm,
    backgroundColor: colors.bg,
  },
  deckPrice: { fontFamily: fonts.display, fontSize: 44, color: colors.green, marginBottom: spacing.sm },
  deckControls: {
    flexDirection: 'row', justifyContent: 'center', gap: spacing.xxxl,
    paddingVertical: spacing.lg, paddingBottom: spacing.xl,
  },
  deckCtrlBtn: {
    width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderWidth: 1.5, gap: 2,
  },
  deckCtrlPass: { borderColor: colors.redBorder },
  deckCtrlHmu: { borderColor: colors.greenBorder },
  deckCtrlLabel: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1 },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    marginTop: spacing.xl, paddingHorizontal: spacing.xl, paddingVertical: 14,
    borderRadius: radius.pill, backgroundColor: colors.green,
  },
  shareBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1 },
  emptyRefresh: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.lg,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.greenBorder,
    backgroundColor: colors.greenDim,
  },
  emptyRefreshText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.green, letterSpacing: 1 },

  // Delivery card
  deliveryCard: { borderColor: colors.pinkBorder },
  deliveryPayoutRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  deliveryPayoutCol: { flex: 1, alignItems: 'center', gap: 2 },
  deliveryPayoutLabel: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, letterSpacing: 1.2, textAlign: 'center' },
  deliveryPayoutValue: { fontFamily: fonts.monoBold, fontSize: 15, textAlign: 'center' },
  deliveryMerchantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  deliveryMerchant: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, flex: 1 },
  deliveryDist: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint },
  deliveryItems: { gap: 2, marginBottom: spacing.lg },
  deliveryItem: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  deliveryItemMore: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 0.5 },
  deliveryAcceptBtn: {
    backgroundColor: colors.pink, borderRadius: radius.pill,
    paddingVertical: 14, alignItems: 'center',
  },
  deliveryAcceptText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1 },
});
