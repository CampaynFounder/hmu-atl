// Rider active ride screen — live ride tracking + extras selection.
// Route: /(rider)/ride/active?rideId=<uuid>
// Rider can add extras from driver's menu (matched/otw states).
// "I'm In" confirms the rider is in the car → final charge captured.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { useAbly } from '@/hooks/use-ably';
import { useNotifications } from '@/contexts/notifications';
import { RideMap } from '@/components/ride/RideMap';
import { toLatLng, LatLng } from '@/components/ride/types';
import { useRideMessages, ChatMessage } from '@/components/ride/useRideMessages';
import { RideChat } from '@/components/ride/RideChat';
import { useRideSafety } from '@/components/ride/useRideSafety';
import { RideSafety } from '@/components/ride/RideSafety';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RideView {
  id: string;
  refCode: string | null;
  status: string;
  agreedPrice: number;
  proposedPrice: number | null;
  proposedPriceReason: string | null;
  isCash: boolean;
  cooAt: string | null;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  tripType: 'one_way' | 'round_trip';
  stops: Array<{ lat: number; lng: number; address?: string }>;
  pickupTime: string | null;
  pickupTimeIsNow: boolean;
  addOnTotal: number;
  driverId: string | null;
  driverHandle: string | null;
  driverFirstName: string | null;
  driverAvatarUrl: string | null;
  driverChillScore: number;
  driverCompletedRides: number;
  otwAt: string | null;
  hereAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
}

interface AddOn {
  id: string;
  name: string;          // ride_add_ons.name
  unit_price: number;    // ride_add_ons.unit_price
  subtotal: number;      // ride_add_ons.subtotal (unit_price × quantity)
  status: string;
  quantity: number;
}

// Line total for an add-on. Prefer the server's subtotal; fall back to
// unit_price × quantity. Guards against NaN when a field is missing.
function addOnLineTotal(a: AddOn): number {
  const sub = Number(a.subtotal);
  if (Number.isFinite(sub) && sub > 0) return sub;
  return (Number(a.unit_price) || 0) * (a.quantity || 1);
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  matched:    { label: 'DRIVER ACCEPTED',  color: colors.amber, bg: colors.amberDim,  border: colors.amberBorder },
  otw:        { label: 'DRIVER EN ROUTE',  color: colors.blue,  bg: colors.blueDim,   border: colors.blueBorder  },
  here:       { label: 'DRIVER ARRIVED',   color: colors.green, bg: colors.greenDim,  border: colors.greenBorder },
  confirming: { label: 'STARTING RIDE',    color: colors.green, bg: colors.greenDim,  border: colors.greenBorder },
  active:     { label: 'ON THE WAY',       color: colors.green, bg: colors.greenDim,  border: colors.greenBorder },
  in_progress:{ label: 'ON THE WAY',       color: colors.green, bg: colors.greenDim,  border: colors.greenBorder },
  ended:      { label: 'RIDE COMPLETE',    color: colors.textTertiary, bg: colors.cardAlt, border: colors.border },
  cancelled:  { label: 'CANCELLED',        color: colors.red,   bg: colors.redDim,    border: colors.redBorder   },
};

function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s.toUpperCase(), color: colors.textFaint, bg: colors.cardAlt, border: colors.border };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RiderActiveScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();

  const [ride, setRide] = useState<RideView | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingItem, setAddingItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [driverLocation, setDriverLocation] = useState<LatLng | null>(null);
  const [confirmingRide, setConfirmingRide] = useState(false);
  const [eta, setEta] = useState<{ mi: number; min: number } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [cancelSecs, setCancelSecs] = useState(0);
  const [priceResponding, setPriceResponding] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chat = useRideMessages(rideId, getToken, ride?.driverId ?? null);
  const safety = useRideSafety(rideId, getToken, 'rider');
  const { registerRideRefresh } = useNotifications();

  const [showMenu, setShowMenu] = useState(false);
  const menuSlide = useRef(new Animated.Value(400)).current;

  // Keep token fresh
  useEffect(() => {
    getToken().then(setToken).catch(() => {});
    const interval = setInterval(() => getToken().then(setToken).catch(() => {}), 55_000);
    return () => clearInterval(interval);
  }, [getToken]);

  const fetchRide = useCallback(async () => {
    if (!rideId) return;
    try {
      const t = await getToken();
      const data = await apiClient<RideView>(`/rides/${rideId}/rider-view`, t);
      setRide(data);
      if (data.status === 'ended' || data.status === 'completed') {
        router.replace(`/(rider)/ride/${rideId}` as any);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load ride');
    } finally {
      setLoading(false);
    }
  }, [rideId, getToken]);

  const fetchMenu = useCallback(async () => {
    if (!rideId) return;
    try {
      const t = await getToken();
      const data = await apiClient<{ menu: MenuItem[] }>(`/rides/${rideId}/menu`, t);
      setMenu(data.menu ?? []);
    } catch {
      // Driver may have no menu — not an error
    }
  }, [rideId, getToken]);

  const fetchAddOns = useCallback(async () => {
    if (!rideId) return;
    try {
      const t = await getToken();
      const data = await apiClient<{ addOns: AddOn[] }>(`/rides/${rideId}/add-ons`, t);
      setAddOns(data.addOns ?? []);
    } catch {}
  }, [rideId, getToken]);

  useEffect(() => {
    void fetchRide();
    void fetchMenu();
    void fetchAddOns();
  }, []);

  // Backstop: the always-on user notify channel triggers a re-pull of ride +
  // add-on state whenever the driver acts (OTW/here/start, extra confirmed/
  // rejected). This guarantees status + extras refresh even if the per-screen
  // ride channel briefly misses an event around a reconnect.
  useEffect(() => {
    return registerRideRefresh(() => {
      void fetchRide();
      void fetchAddOns();
    });
  }, [registerRideRefresh, fetchRide, fetchAddOns]);

  // Live updates
  useAbly({
    channelName: rideId ? `ride:${rideId}` : null,
    token,
    rideId,
    onMessage: (msg) => {
      if (msg.name === 'status_change') {
        const d = msg.data as Record<string, unknown>;
        const newStatus = d.status as string;
        setRide((prev) => prev ? { ...prev, status: newStatus } : prev);
        if (newStatus === 'otw') setRide((prev) => prev ? { ...prev, otwAt: new Date().toISOString() } : prev);
        if (newStatus === 'here') setRide((prev) => prev ? { ...prev, hereAt: new Date().toISOString() } : prev);
        if (newStatus === 'active') setRide((prev) => prev ? { ...prev, startedAt: new Date().toISOString() } : prev);
        if (newStatus === 'ended' || newStatus === 'completed') {
          router.replace(`/(rider)/ride/${rideId}` as any);
        }
        if (newStatus === 'cancelled') {
          Alert.alert('Ride cancelled', 'This ride was cancelled.');
          router.replace('/(rider)/home' as any);
        }
      }
      if (msg.name === 'cancel_request_cleared') {
        // Driver declined or it timed out — the ride continues (or a separate
        // status_change to 'cancelled' will fire if it was agreed/timed out).
        setCancelRequested(false);
        setCancelSecs(0);
      }
      if (msg.name === 'location' || msg.name === 'location_update') {
        // Only the driver streams GPS on the ride channel; plot it live.
        const d = msg.data as { userId?: string; lat?: number; lng?: number };
        if (typeof d.lat === 'number' && typeof d.lng === 'number') {
          setDriverLocation({ lat: d.lat, lng: d.lng });
        }
      }
      if (msg.name === 'chat_message') {
        chat.ingest(msg.data as ChatMessage);
      }
      if (msg.name === 'safety_check_prompt') {
        safety.ingestPrompt(msg.data as { checkId?: string; party?: string; autoDismissSeconds?: number });
      }
      if (msg.name === 'price_update_proposed') {
        const d = msg.data as { newPrice?: number; reason?: string | null };
        if (typeof d.newPrice === 'number') {
          setRide((prev) => prev ? { ...prev, proposedPrice: d.newPrice!, proposedPriceReason: d.reason ?? null } : prev);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      }
      if (
        msg.name === 'add_on_confirmed' ||
        msg.name === 'add_on_rejected' ||
        msg.name === 'add_on_removed' ||
        msg.name === 'add_on_payment_failed'
      ) {
        void fetchAddOns();
      }
    },
  });

  // Live ETA + distance from the driver's current GPS, via Mapbox Directions.
  // Target follows the ride phase, matching web: while the driver is en route
  // (otw/here/confirming) the ETA is to PICKUP; once the ride is active it's to
  // the DROPOFF. Re-fetches when the driver moves. Only meaningful once the
  // driver is streaming GPS (OTW onward).
  const status = ride?.status ?? null;
  const isActive = status === 'active' || status === 'in_progress';
  const tLat = isActive ? (ride?.dropoffLat ?? null) : (ride?.pickupLat ?? null);
  const tLng = isActive ? (ride?.dropoffLng ?? null) : (ride?.pickupLng ?? null);
  const etaPhase = status && ['otw', 'here', 'confirming', 'active', 'in_progress'].includes(status);
  useEffect(() => {
    if (!driverLocation || !etaPhase || tLat == null || tLng == null || !MAPBOX_TOKEN) { setEta(null); return; }
    const coords = `${driverLocation.lng},${driverLocation.lat};${tLng},${tLat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}&overview=false`;
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const route = d?.routes?.[0];
        if (route) setEta({ mi: route.distance / 1609.34, min: Math.max(1, Math.round(route.duration / 60)) });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [driverLocation, tLat, tLng, etaPhase]);

  // Cancel-request countdown (only active when a request is pending driver reply).
  useEffect(() => {
    if (!cancelRequested || cancelSecs <= 0) return;
    const id = setInterval(() => setCancelSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cancelRequested, cancelSecs]);

  function requestCancel() {
    if (!ride || cancelling) return;
    const afterOtw = ride.status === 'otw' || ride.status === 'here';
    Alert.alert(
      afterOtw ? 'Request to cancel?' : 'Cancel this ride?',
      afterOtw
        ? "Your driver is on the way. They can agree (no charge) or decline and keep your deposit. If they don't respond in time, it cancels automatically."
        : "You won't be charged.",
      [
        { text: 'Keep ride', style: 'cancel' },
        {
          text: afterOtw ? 'Request cancel' : 'Cancel ride',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const t = await getToken();
              const res = await apiClient<{ status: string; timeoutSeconds?: number }>(
                `/rides/${rideId}/cancel`, t, { method: 'POST', body: JSON.stringify({}) },
              );
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              if (res.status === 'cancel_requested') {
                setCancelRequested(true);
                setCancelSecs(res.timeoutSeconds ?? 180);
              } else {
                router.replace('/(rider)/home' as any);
              }
            } catch (e: any) {
              Alert.alert('Could not cancel', e?.message ?? 'Try again');
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  }

  async function respondPrice(action: 'accept' | 'decline') {
    if (!rideId || priceResponding) return;
    setPriceResponding(true);
    try {
      const t = await getToken();
      const res = await apiClient<{ status: string; newPrice?: number }>(
        `/rides/${rideId}/update-price`, t, { method: 'PATCH', body: JSON.stringify({ action }) },
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRide((prev) => {
        if (!prev) return prev;
        if (action === 'accept' && res.newPrice) {
          return { ...prev, agreedPrice: res.newPrice, proposedPrice: null, proposedPriceReason: null };
        }
        return { ...prev, proposedPrice: null, proposedPriceReason: null };
      });
    } catch (e: any) {
      setError(e?.message ?? 'Could not respond to the price change');
    } finally {
      setPriceResponding(false);
    }
  }

  function openMenu() {
    setShowMenu(true);
    Animated.spring(menuSlide, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 4 }).start();
  }

  function closeMenu() {
    Animated.spring(menuSlide, { toValue: 400, useNativeDriver: true, speed: 14, bounciness: 0 }).start(() => {
      setShowMenu(false);
    });
  }

  async function addExtra(item: MenuItem) {
    if (!rideId || addingItem) return;
    setAddingItem(item.id);
    try {
      const t = await getToken();
      await apiClient(`/rides/${rideId}/add-ons`, t, {
        method: 'POST',
        body: JSON.stringify({ menu_item_id: item.id, quantity: 1 }),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void fetchAddOns();
    } catch (e: any) {
      Alert.alert('Could not add extra', e.message ?? 'Try again');
    } finally {
      setAddingItem(null);
    }
  }

  async function removeExtra(addOnId: string) {
    if (!rideId) return;
    try {
      const t = await getToken();
      await apiClient(`/rides/${rideId}/add-ons`, t, {
        method: 'PATCH',
        body: JSON.stringify({ add_on_id: addOnId, action: 'remove' }),
      });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void fetchAddOns();
    } catch {}
  }

  // "I'm In" — captures payment. The server REQUIRES numeric GPS, so we must get
  // a fix first and surface a denied permission as actionable copy, not a 500.
  async function confirmImIn() {
    if (!rideId || confirmingRide) return;
    setConfirmingRide(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Location needed', "Turn on location so your driver can confirm you're in the car, then tap I'm In again.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const t = await getToken();
      await apiClient(`/rides/${rideId}/confirm-start`, t, {
        method: 'POST',
        body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRide((prev) => (prev ? { ...prev, status: 'active', startedAt: new Date().toISOString() } : prev));
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.toLowerCase().includes('location')) setError("Couldn't get your location — try again near a window.");
      else setError(msg || 'Could not confirm. Try again.');
    } finally {
      setConfirmingRide(false);
    }
  }

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Text style={s.errorText}>{error ?? 'Ride not found'}</Text>
      </View>
    );
  }

  const meta = statusMeta(ride.status);
  const driverName = ride.driverHandle ? `@${ride.driverHandle}` : ride.driverFirstName ?? 'Driver';
  const isPreRide = ['matched', 'otw', 'here'].includes(ride.status);
  const confirmedExtras = addOns.filter(a => a.status === 'confirmed');
  const pendingExtras = addOns.filter(a => a.status === 'pending_driver');
  const confirmedTotal = confirmedExtras.reduce((s, a) => s + addOnLineTotal(a), 0);
  const totalWithExtras = ride.agreedPrice + confirmedTotal;

  const pickupLL = toLatLng(ride.pickupLat, ride.pickupLng);
  const dropoffLL = toLatLng(ride.dropoffLat, ride.dropoffLng);
  const stopsLL = (ride.stops ?? [])
    .map((st) => toLatLng(st.lat, st.lng))
    .filter((x): x is LatLng => x !== null);
  const hasMap = !!(pickupLL || dropoffLL) && !!MAPBOX_TOKEN;
  const isConfirming = ride.status === 'confirming';
  // Before COO, the rider's primary action is Pull Up — it authorizes the
  // deposit hold on their card (routes to the existing COO screen).
  const needsPullUp = ride.status === 'matched' && !ride.cooAt;
  const canChat = ['otw', 'here', 'confirming', 'active', 'ended'].includes(ride.status);
  const canCancel = ['matched', 'otw', 'here'].includes(ride.status) && !cancelRequested;
  function openChat() { setChatOpen(true); chat.setOpen(true); }
  function closeChat() { setChatOpen(false); chat.setOpen(false); }

  // Items not already queued
  const alreadyAdded = new Set(addOns.filter(a => a.status !== 'rejected').map(a => a.name));
  const availableMenu = menu.filter(m => !alreadyAdded.has(m.name));

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Navbar */}
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.navTitle}>YOUR RIDE</Text>
          {ride.refCode && <Text style={s.navRef}>REF: {ride.refCode}</Text>}
        </View>
        <View style={[s.statusPill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
          <Text style={[s.statusLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + (isConfirming || needsPullUp ? 160 : 100) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Driver proposed a new price — accept (re-auths the difference) or decline */}
        {ride.proposedPrice != null && (
          <View style={s.priceCard}>
            <Text style={s.priceCardLabel}>DRIVER PROPOSED A NEW PRICE</Text>
            <Text style={s.priceCardAmount}>
              ${ride.proposedPrice.toFixed(2)}
              <Text style={s.priceCardOld}>  was ${ride.agreedPrice.toFixed(2)}</Text>
            </Text>
            {!!ride.proposedPriceReason && <Text style={s.priceCardReason}>“{ride.proposedPriceReason}”</Text>}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <TouchableOpacity
                style={[s.priceBtn, { backgroundColor: colors.cardAlt }]}
                onPress={() => respondPrice('decline')}
                disabled={priceResponding}
              >
                <Text style={[s.priceBtnText, { color: colors.textPrimary }]}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.priceBtn, { backgroundColor: colors.green }]}
                onPress={() => respondPrice('accept')}
                disabled={priceResponding}
              >
                {priceResponding
                  ? <ActivityIndicator size="small" color={colors.bg} />
                  : <Text style={[s.priceBtnText, { color: colors.bg }]}>Accept ${ride.proposedPrice.toFixed(0)}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Cancel request pending driver reply */}
        {cancelRequested && (
          <View style={s.cancelPending}>
            <Ionicons name="hourglass-outline" size={16} color={colors.amber} />
            <Text style={s.cancelPendingText}>
              Cancel requested — waiting for driver{cancelSecs > 0 ? ` · ${Math.floor(cancelSecs / 60)}:${String(cancelSecs % 60).padStart(2, '0')}` : ''}
            </Text>
          </View>
        )}

        {/* Live map */}
        {hasMap && (
          <RideMap
            viewerRole="rider"
            pickup={pickupLL}
            dropoff={dropoffLL}
            stops={stopsLL}
            driverLocation={driverLocation}
            riderLocation={null}
            status={ride.status}
            mapboxToken={MAPBOX_TOKEN}
            style={s.map}
          />
        )}

        {/* Live ETA — to pickup while the driver is en route, to the
            destination once the ride is active (mirrors the web app). */}
        {['otw', 'here', 'active', 'in_progress'].includes(ride.status) && (
          <View style={s.etaBanner}>
            <Ionicons name="car-sport" size={18} color={colors.green} />
            <Text style={s.etaText}>
              {ride.status === 'here'
                ? 'Driver has arrived'
                : ride.status === 'active' || ride.status === 'in_progress'
                  ? eta
                    ? `About ${eta.min} min to your destination · ${eta.mi.toFixed(1)} mi`
                    : 'On the way to your destination…'
                  : eta
                    ? `Driver ${eta.mi.toFixed(1)} mi away · about ${eta.min} min`
                    : 'Locating your driver…'}
            </Text>
          </View>
        )}

        {/* Fare card */}
        <View style={[s.card, shadow.card]}>
          <Text style={s.cardLabel}>{ride.isCash ? 'CASH FARE' : 'AGREED PRICE'}</Text>
          {confirmedTotal > 0 ? (
            <>
              <Text style={s.fareAmount}>${totalWithExtras.toFixed(2)}</Text>
              <View style={s.extrasRow}>
                <Text style={s.extrasLine}>BASE ${ride.agreedPrice.toFixed(2)}</Text>
                <Text style={[s.extrasLine, { color: colors.amber }]}>+ EXTRAS ${confirmedTotal.toFixed(2)}</Text>
              </View>
            </>
          ) : (
            <Text style={s.fareAmount}>${ride.agreedPrice.toFixed(2)}</Text>
          )}
          {pendingExtras.length > 0 && (
            <View style={s.pendingNote}>
              <Ionicons name="time-outline" size={12} color={colors.amber} />
              <Text style={s.pendingNoteText}>{pendingExtras.length} extra{pendingExtras.length > 1 ? 's' : ''} pending driver approval</Text>
            </View>
          )}
          {!ride.isCash && (
            <View style={s.authRow}>
              <Ionicons
                name={ride.cooAt ? 'checkmark-circle' : 'ellipse-outline'}
                size={14}
                color={ride.cooAt ? colors.green : colors.textFaint}
              />
              <Text style={[s.authText, ride.cooAt && { color: colors.green }]}>
                {ride.cooAt ? 'Deposit authorized on your card' : 'Not authorized yet — tap Pull Up below'}
              </Text>
            </View>
          )}
        </View>

        {/* Route card */}
        <View style={[s.card, shadow.card]}>
          <Text style={s.cardLabel}>ROUTE</Text>
          <View style={s.routeRow}>
            <View style={s.routeDot} />
            <Text style={s.routeAddr} numberOfLines={2}>{ride.pickupAddress ?? 'Pickup'}</Text>
          </View>
          <View style={s.routeLine} />
          <View style={s.routeRow}>
            <View style={[s.routeDot, s.routeDotDest]} />
            <Text style={s.routeAddr} numberOfLines={2}>
              {ride.dropoffAddress ?? 'Dropoff'}{ride.tripType === 'round_trip' ? ' (ROUND TRIP)' : ''}
            </Text>
          </View>
        </View>

        {/* When card */}
        {ride.pickupTime && (
          <View style={[s.card, shadow.card]}>
            <Text style={s.cardLabel}>REQUESTED PICKUP</Text>
            <View style={s.whenRow}>
              <Ionicons name="time-outline" size={16} color={colors.green} />
              <Text style={s.whenText}>{ride.pickupTimeIsNow ? 'Now — ASAP' : ride.pickupTime}</Text>
            </View>
          </View>
        )}

        {/* Driver card */}
        <View style={[s.card, shadow.card]}>
          <Text style={s.cardLabel}>DRIVER</Text>
          <View style={s.driverRow}>
            <DriverAvatar url={ride.driverAvatarUrl} name={driverName} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={s.driverName}>{driverName}</Text>
              <View style={s.driverMeta}>
                {ride.driverChillScore > 0 && (
                  <Text style={s.driverMetaText}>{Math.round(ride.driverChillScore)} chill</Text>
                )}
                {ride.driverCompletedRides > 0 && (
                  <Text style={s.driverMetaText}>{ride.driverCompletedRides} rides</Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Extras card */}
        {addOns.length > 0 && (
          <View style={[s.card, shadow.card]}>
            <Text style={s.cardLabel}>EXTRAS</Text>
            {addOns.map((a, i) => (
              <View key={a.id} style={[s.addOnRow, i === 0 && { borderTopWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.addOnName}>{a.name}</Text>
                  {a.quantity > 1 && <Text style={s.addOnQty}>×{a.quantity}</Text>}
                </View>
                <Text style={s.addOnPrice}>${addOnLineTotal(a).toFixed(2)}</Text>
                <View style={[
                  s.addOnStatus,
                  a.status === 'confirmed' && s.addOnStatusOk,
                  a.status === 'pending_driver' && s.addOnStatusPending,
                  a.status === 'rejected' && s.addOnStatusRejected,
                ]}>
                  <Text style={[
                    s.addOnStatusText,
                    a.status === 'confirmed' && { color: colors.green },
                    a.status === 'pending_driver' && { color: colors.amber },
                    a.status === 'rejected' && { color: colors.red },
                  ]}>
                    {a.status === 'confirmed' ? 'CONFIRMED' :
                     a.status === 'pending_driver' ? 'PENDING' :
                     a.status === 'rejected' ? 'DECLINED' :
                     a.status.replace(/_/g, ' ').toUpperCase()}
                  </Text>
                </View>
                {a.status === 'pending_driver' && isPreRide && (
                  <TouchableOpacity onPress={() => removeExtra(a.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={colors.textFaint} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Add extras CTA */}
        {isPreRide && menu.length > 0 && (
          <TouchableOpacity style={[s.addExtrasCta, shadow.card]} onPress={openMenu} activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={16} color={colors.green} />
            <Text style={s.addExtrasLabel}>ADD EXTRAS</Text>
            {availableMenu.length > 0 && (
              <Text style={s.addExtrasCount}>{availableMenu.length} available</Text>
            )}
          </TouchableOpacity>
        )}

        {error && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle" size={14} color={colors.red} />
            <Text style={s.errorText2}>{error}</Text>
          </View>
        )}

        {/* Cancel — immediate before the driver heads out, a request after */}
        {canCancel && (
          <TouchableOpacity style={s.cancelLink} onPress={requestCancel} disabled={cancelling} activeOpacity={0.7}>
            <Text style={s.cancelLinkText}>
              {cancelling ? 'Cancelling…' : ride.status === 'matched' ? 'Cancel ride' : 'Request to cancel'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Pull Up — authorize the deposit hold on the rider's card (COO) */}
      {needsPullUp && (
        <View style={[s.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <TouchableOpacity
            style={s.imInBtn}
            onPress={() => router.push(`/(rider)/ride/pull-up?rideId=${rideId}` as any)}
            activeOpacity={0.85}
          >
            <Text style={s.imInBtnText}>PULL UP →</Text>
          </TouchableOpacity>
          <Text style={s.imInSub}>Share your spot & authorize the deposit on your card</Text>
        </View>
      )}

      {/* I'm In — capture payment + start the ride */}
      {isConfirming && (
        <View style={[s.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <TouchableOpacity
            style={[s.imInBtn, confirmingRide && { opacity: 0.7 }]}
            onPress={confirmImIn}
            disabled={confirmingRide}
            activeOpacity={0.85}
          >
            {confirmingRide
              ? <ActivityIndicator size="small" color={colors.bg} />
              : <Text style={s.imInBtnText}>I&apos;M IN — PAY ${totalWithExtras.toFixed(0)}</Text>}
          </TouchableOpacity>
          <Text style={s.imInSub}>Confirm you&apos;re in the car to start the ride</Text>
        </View>
      )}

      {/* Chat FAB */}
      {canChat && (
        <TouchableOpacity
          style={[s.chatFab, { bottom: insets.bottom + (isConfirming || needsPullUp ? 170 : 24) }]}
          onPress={openChat}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble-ellipses" size={22} color={colors.bg} />
          {chat.unread > 0 && (
            <View style={s.chatBadge}>
              <Text style={s.chatBadgeText}>{chat.unread > 9 ? '9+' : chat.unread}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      <RideChat
        visible={chatOpen}
        onClose={closeChat}
        messages={chat.messages}
        isMine={chat.isMine}
        onSend={chat.send}
        sending={chat.sending}
        viewerRole="rider"
        rideStatus={ride.status}
        otherName={driverName}
      />

      {canChat && (
        <RideSafety
          check={safety.check}
          respond={safety.respond}
          distress={safety.distress}
          sosOpen={safety.sosOpen}
          setSosOpen={safety.setSosOpen}
          busy={safety.busy}
          bottom={insets.bottom + (isConfirming || needsPullUp ? 170 : 88)}
        />
      )}

      {/* Menu sheet */}
      {showMenu && (
        <Animated.View style={[s.overlay, { transform: [{ translateY: menuSlide }] }]}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>DRIVER EXTRAS</Text>
              <TouchableOpacity onPress={closeMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {availableMenu.length === 0 ? (
                <Text style={s.noItems}>All available extras have been added.</Text>
              ) : (
                availableMenu.map((item) => (
                  <View key={item.id} style={s.menuItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.menuItemName}>{item.name}</Text>
                      {item.description && (
                        <Text style={s.menuItemDesc} numberOfLines={2}>{item.description}</Text>
                      )}
                    </View>
                    <Text style={s.menuItemPrice}>${Number(item.price).toFixed(2)}</Text>
                    <TouchableOpacity
                      style={s.addBtn}
                      onPress={() => addExtra(item)}
                      disabled={addingItem === item.id}
                      activeOpacity={0.8}
                    >
                      {addingItem === item.id
                        ? <ActivityIndicator size="small" color={colors.bg} />
                        : <Text style={s.addBtnLabel}>ADD</Text>
                      }
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// ── Driver avatar ─────────────────────────────────────────────────────────────

function DriverAvatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const letter = (name ?? '?')[0].toUpperCase();
  if (url && !failed) {
    return <Image source={{ uri: url }} style={s.avatar} onError={() => setFailed(true)} />;
  }
  return (
    <View style={[s.avatar, s.avatarFallback]}>
      <Text style={s.avatarLetter}>{letter}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },

  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill, backgroundColor: colors.cardAlt,
    borderWidth: 1, borderColor: colors.border,
  },
  navTitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, letterSpacing: 2 },
  navRef: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1, marginTop: 2 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  statusLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1 },

  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  map: {
    height: 220, borderRadius: radius.card, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, alignItems: 'center', gap: spacing.xs,
  },
  imInBtn: {
    width: '100%', backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center',
  },
  imInBtnText: { fontFamily: fonts.mono, fontSize: 14, color: colors.bg, letterSpacing: 1 },
  imInSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  whenText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.textPrimary },
  etaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.greenDim, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.greenBorder,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.lg,
  },
  etaText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.green, flex: 1 },
  authRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  authText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  cancelPending: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.amberDim, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.amberBorder,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.lg,
  },
  cancelPendingText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.amber, flex: 1 },
  cancelLink: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  cancelLinkText: { fontFamily: fonts.body, fontSize: 14, color: colors.red },
  priceCard: {
    backgroundColor: colors.amberDim, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.amberBorder,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  priceCardLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.amber, letterSpacing: 2 },
  priceCardAmount: { fontFamily: fonts.display, fontSize: 32, color: colors.textPrimary, marginTop: 4 },
  priceCardOld: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textDecorationLine: 'line-through' },
  priceCardReason: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' },
  priceBtn: { flex: 1, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
  priceBtnText: { fontFamily: fonts.mono, fontSize: 13, letterSpacing: 0.5 },
  chatFab: {
    position: 'absolute', right: spacing.xl, width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  chatBadge: {
    position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
    borderWidth: 2, borderColor: colors.bg,
  },
  chatBadgeText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.textPrimary },
  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 3, marginBottom: spacing.md },

  fareAmount: { fontFamily: fonts.display, fontSize: 48, color: colors.green, lineHeight: 52, marginBottom: 4 },
  extrasRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.sm },
  extrasLine: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1 },
  pendingNote: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm,
  },
  pendingNoteText: { fontFamily: fonts.mono, fontSize: 9, color: colors.amber, letterSpacing: 1 },

  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: 4 },
  routeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textFaint, marginTop: 5 },
  routeDotDest: { backgroundColor: colors.green },
  routeLine: { width: 1, height: 18, backgroundColor: colors.border, marginLeft: 3.5, marginBottom: 4 },
  routeAddr: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

  driverRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  avatarLetter: { fontFamily: fonts.display, fontSize: 22, color: colors.green },
  driverName: { fontFamily: fonts.mono, fontSize: 14, color: colors.textPrimary },
  driverMeta: { flexDirection: 'row', gap: spacing.md, marginTop: 4 },
  driverMetaText: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },

  addOnRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  addOnName: { fontFamily: fonts.body, fontSize: 13, color: colors.textPrimary },
  addOnQty: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, marginTop: 2 },
  addOnPrice: { fontFamily: fonts.mono, fontSize: 12, color: colors.green },
  addOnStatus: {
    borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  addOnStatusOk: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  addOnStatusPending: { backgroundColor: colors.amberDim, borderColor: colors.amberBorder },
  addOnStatusRejected: { backgroundColor: colors.redDim, borderColor: colors.redBorder },
  addOnStatusText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },

  addExtrasCta: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.greenBorder,
  },
  addExtrasLabel: { flex: 1, fontFamily: fonts.mono, fontSize: 12, color: colors.green, letterSpacing: 1 },
  addExtrasCount: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.redDim, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.redBorder, marginBottom: spacing.md,
  },
  errorText2: { fontFamily: fonts.body, fontSize: 13, color: colors.red, flex: 1 },

  overlay: {
    position: 'absolute', left: 0, right: 0, bottom: 0, top: '30%',
    backgroundColor: colors.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 20,
  },
  sheet: { flex: 1, paddingHorizontal: spacing.xl },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginVertical: spacing.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  sheetTitle: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary, letterSpacing: 2 },
  noItems: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  menuItemName: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary },
  menuItemDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2, lineHeight: 18 },
  menuItemPrice: { fontFamily: fonts.mono, fontSize: 13, color: colors.green },
  addBtn: {
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  addBtnLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.bg, letterSpacing: 1 },
});
