// Driver active ride flow: matched → otw → here → confirming → active → ended → rate
// Route: /(driver)/ride/active?rideId=<uuid>
// This screen owns the full in-ride driver experience.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, Alert, ActivityIndicator, Pressable, Image,
  Linking, ActionSheetIOS, Platform, TextInput, KeyboardAvoidingView, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { startRideTracking, stopRideTracking, refreshTrackingToken } from '@/lib/location-tracking';
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

interface Stop {
  lat: number;
  lng: number;
  address?: string;
}

interface RideView {
  id: string;
  refCode: string | null;
  status: string;
  agreedPrice: number;
  proposedPrice: number | null;
  proposedPriceReason: string | null;
  driverPayout: number;
  platformFee: number;
  isCash: boolean;
  cooAt: string | null;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  tripType: 'one_way' | 'round_trip';
  stops: Stop[];
  riderId: string | null;
  riderHandle: string | null;
  riderFirstName: string | null;
  riderAvatarUrl: string | null;
  riderChillScore: number;
  riderCompletedRides: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  otwAt: string | null;
  hereAt: string | null;
}

type RatingType = 'chill' | 'cool_af' | 'kinda_creepy' | 'weirdo';

interface AddOn {
  id: string;
  name: string;          // ride_add_ons.name
  unit_price: number;    // ride_add_ons.unit_price
  subtotal: number;      // ride_add_ons.subtotal
  status: string;
  quantity: number;
}

function addOnLineTotal(a: AddOn): number {
  const sub = Number(a.subtotal);
  if (Number.isFinite(sub) && sub > 0) return sub;
  return (Number(a.unit_price) || 0) * (a.quantity || 1);
}

interface PendingAddOn {
  id: string;
  name: string;
  subtotal: number;
  quantity: number;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  matched:    { label: 'MATCHED',     color: colors.amber,        bg: colors.amberDim,  border: colors.amberBorder },
  otw:        { label: 'EN ROUTE',    color: colors.blue,         bg: colors.blueDim,   border: colors.blueBorder  },
  here:       { label: 'ARRIVED',     color: colors.green,        bg: colors.greenDim,  border: colors.greenBorder },
  confirming: { label: 'STARTING',    color: colors.green,        bg: colors.greenDim,  border: colors.greenBorder },
  active:     { label: 'IN PROGRESS', color: colors.green,        bg: colors.greenDim,  border: colors.greenBorder },
  in_progress:{ label: 'IN PROGRESS', color: colors.green,        bg: colors.greenDim,  border: colors.greenBorder },
  ended:      { label: 'COMPLETED',   color: colors.textTertiary, bg: colors.cardAlt,   border: colors.border      },
  completed:  { label: 'COMPLETED',   color: colors.textTertiary, bg: colors.cardAlt,   border: colors.border      },
  cancelled:  { label: 'CANCELLED',   color: colors.red,          bg: colors.redDim,    border: colors.redBorder   },
};

function statusMeta(s: string | null | undefined) {
  if (!s) return { label: 'UNKNOWN', color: colors.textFaint, bg: colors.cardAlt, border: colors.border };
  return STATUS_META[s] ?? { label: s.toUpperCase(), color: colors.textFaint, bg: colors.cardAlt, border: colors.border };
}

const RATING_OPTIONS: { type: RatingType; label: string; emoji: string; color: string; dim: string; border: string }[] = [
  { type: 'chill',        label: 'CHILL',        emoji: '✅', color: colors.green, dim: colors.greenDim, border: colors.greenBorder },
  { type: 'cool_af',      label: 'COOL AF',      emoji: '😎', color: colors.blue,  dim: colors.blueDim,  border: colors.blueBorder  },
  { type: 'kinda_creepy', label: 'KINDA CREEPY', emoji: '👀', color: colors.amber, dim: colors.amberDim, border: colors.amberBorder },
  { type: 'weirdo',       label: 'WEIRDO',       emoji: '🚩', color: colors.red,   dim: colors.redDim,   border: colors.redBorder   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortAddr(addr: string | null): string {
  if (!addr) return '—';
  return addr.split(',')[0]?.trim() ?? addr;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

async function tryGetGPS(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ActiveRideScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();

  const [ride, setRide] = useState<RideView | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [driverLocation, setDriverLocation] = useState<LatLng | null>(null);
  const [eta, setEta] = useState<{ mi: number; min: number } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const chat = useRideMessages(rideId, getToken, ride?.riderId ?? null);
  const safety = useRideSafety(rideId, getToken, 'driver');
  const { registerRideRefresh } = useNotifications();

  // Rating state
  const [showRating, setShowRating] = useState(false);
  const [selectedRating, setSelectedRating] = useState<RatingType | null>(null);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const ratingSlide = useRef(new Animated.Value(300)).current;

  // Cancel overlay state
  const [showCancel, setShowCancel] = useState(false);
  const cancelSlide = useRef(new Animated.Value(300)).current;
  // Incoming rider cancel-request (driver agrees or declines before timeout)
  const [cancelReq, setCancelReq] = useState<{ reason: string; secs: number } | null>(null);
  const [respondingCancel, setRespondingCancel] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [priceReason, setPriceReason] = useState('');
  const [proposingPrice, setProposingPrice] = useState(false);

  // Add-ons
  const [addOns, setAddOns] = useState<AddOn[]>([]);

  // Extras approval sheet
  const [pendingAddOn, setPendingAddOn] = useState<PendingAddOn | null>(null);
  const pendingAddOnSlide = useRef(new Animated.Value(300)).current;
  const [approving, setApproving] = useState(false);

  // Card entrance animations
  const cardAnims = useRef([0, 1, 2, 3, 4, 5].map(() => ({
    opacity: new Animated.Value(0),
    y: new Animated.Value(16),
  }))).current;

  // Keep token fresh — also refreshes the background location task's stored token
  useEffect(() => {
    const refresh = () => getToken().then(t => {
      if (t) { setToken(t); refreshTrackingToken(t); }
    }).catch(() => {});
    refresh();
    const interval = setInterval(refresh, 55_000);
    return () => clearInterval(interval);
  }, [getToken]);

  // Stop background tracking when screen unmounts (cancelled, ended, or navigated away)
  useEffect(() => {
    return () => { void stopRideTracking(); };
  }, []);

  const fetchAddOns = useCallback(async () => {
    if (!rideId) return;
    try {
      const t = await getToken();
      const data = await apiClient<{ addOns: AddOn[] }>(`/rides/${rideId}/add-ons`, t);
      setAddOns(data.addOns ?? []);
    } catch {}
  }, [rideId, getToken]);

  const fetchRide = useCallback(async () => {
    if (!rideId) return;
    try {
      const t = await getToken();
      const raw = await apiClient<RideView>(`/rides/${rideId}/driver-view`, t);
      const data: RideView = {
        ...raw,
        pickupLat: raw.pickupLat ?? null,
        pickupLng: raw.pickupLng ?? null,
        dropoffLat: raw.dropoffLat ?? null,
        dropoffLng: raw.dropoffLng ?? null,
        tripType: raw.tripType ?? 'one_way',
        stops: Array.isArray(raw.stops) ? raw.stops : [],
      };
      setRide(data);
      if (data.status === 'ended' || data.status === 'completed') openRatingSheet();
    } catch (e: any) {
      setError(e.message ?? 'Failed to load ride');
    } finally {
      setLoading(false);
    }
  }, [rideId, getToken]);

  useEffect(() => {
    void fetchRide();
    void fetchAddOns();
    Animated.stagger(
      65,
      cardAnims.map(({ opacity, y }) =>
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 360, useNativeDriver: true }),
          Animated.timing(y, { toValue: 0, duration: 360, useNativeDriver: true }),
        ])
      )
    ).start();
  }, []);

  // Ably — subscribe to ride channel for live status updates
  useAbly({
    channelName: rideId ? `ride:${rideId}` : null,
    token,
    rideId,
    onMessage: (msg) => {
      if (msg.name === 'coo') {
        const d = msg.data as Record<string, unknown>;
        const pickup = d.pickup as { address?: string; latitude?: number; longitude?: number } | null;
        const dropoff = d.dropoff as { address?: string; latitude?: number; longitude?: number } | null;
        const rawStops = d.stops as Array<{ lat?: number; lng?: number; latitude?: number; longitude?: number; address?: string }> | null;
        setRide((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            cooAt: new Date().toISOString(),
            pickupAddress: pickup?.address ?? prev.pickupAddress,
            pickupLat: pickup?.latitude ?? prev.pickupLat,
            pickupLng: pickup?.longitude ?? prev.pickupLng,
            dropoffAddress: dropoff?.address ?? prev.dropoffAddress,
            dropoffLat: dropoff?.latitude ?? prev.dropoffLat,
            dropoffLng: dropoff?.longitude ?? prev.dropoffLng,
            stops: rawStops
              ? rawStops.map(s => ({ lat: s.lat ?? s.latitude ?? 0, lng: s.lng ?? s.longitude ?? 0, address: s.address }))
              : prev.stops,
          };
        });
      }
      if (msg.name === 'status_change') {
        const d = msg.data as Record<string, unknown>;
        const newStatus = d.status as string;
        setRide((prev) => {
          if (!prev) return prev;
          const patch: Partial<RideView> = { status: newStatus };
          if (newStatus === 'active') patch.startedAt = new Date().toISOString();
          if (newStatus === 'ended') { patch.endedAt = new Date().toISOString(); }
          if (typeof d.driverReceives === 'number') patch.driverPayout = d.driverReceives;
          return { ...prev, ...patch };
        });
        if (newStatus === 'ended' || newStatus === 'completed') { void stopRideTracking(); openRatingSheet(); }
        if (newStatus === 'cancelled') { void stopRideTracking(); openCancelOverlay(); }
      }
      if (msg.name === 'confirm_start') {
        setRide((prev) => prev ? { ...prev, status: 'confirming' } : prev);
      }
      if (msg.name === 'location' || msg.name === 'location_update') {
        // The driver's own GPS, echoed back from the publish task — plots the
        // car on the map. (Only the driver streams location on this channel.)
        const d = msg.data as { lat?: number; lng?: number };
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
      if (msg.name === 'cancel_request') {
        const d = msg.data as { reason?: string; timeoutSeconds?: number };
        setCancelReq({ reason: d.reason || '', secs: d.timeoutSeconds ?? 180 });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      if (msg.name === 'cancel_request_cleared') {
        setCancelReq(null);
      }
      if (msg.name === 'price_update_accepted') {
        const d = msg.data as { newPrice?: number };
        setRide((prev) => prev ? { ...prev, agreedPrice: typeof d.newPrice === 'number' ? d.newPrice : prev.agreedPrice, proposedPrice: null, proposedPriceReason: null } : prev);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Price accepted', 'The rider accepted your new price.');
      }
      if (msg.name === 'price_update_declined') {
        setRide((prev) => prev ? { ...prev, proposedPrice: null, proposedPriceReason: null } : prev);
        Alert.alert('Price declined', 'The rider kept the original price.');
      }
      if (msg.name === 'add_on_pending') {
        const d = msg.data as Record<string, unknown>;
        const ao = d.addOn as PendingAddOn | undefined;
        if (ao?.id) {
          setPendingAddOn(ao);
          Animated.spring(pendingAddOnSlide, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 4 }).start();
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        void fetchAddOns();
      }
      if (
        msg.name === 'add_on_added' ||
        msg.name === 'add_on_updated' ||
        msg.name === 'add_on_removed' ||
        msg.name === 'add_on_confirmed' ||
        msg.name === 'add_on_rejected' ||
        msg.name === 'add_on_payment_failed' ||
        msg.name === 'add_ons_confirmed_all'
      ) {
        void fetchAddOns();
      }
    },
  });

  // Live ETA from the driver's GPS, mirroring the rider's banner: to PICKUP
  // while en route (otw/here/confirming), to the DROPOFF once active. Gives the
  // driver the same time/distance read the rider sees.
  const status = ride?.status ?? null;
  const isActive = status === 'active' || status === 'in_progress';
  const tLat = isActive ? (ride?.dropoffLat ?? null) : (ride?.pickupLat ?? null);
  const tLng = isActive ? (ride?.dropoffLng ?? null) : (ride?.pickupLng ?? null);
  const etaPhase = !!status && ['otw', 'here', 'confirming', 'active', 'in_progress'].includes(status);
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

  // Backstop: the always-on user notify channel re-pulls ride + add-on state on
  // any ride update, independent of the per-screen ride channel.
  useEffect(() => {
    return registerRideRefresh(() => {
      void fetchRide();
      void fetchAddOns();
    });
  }, [registerRideRefresh, fetchRide, fetchAddOns]);

  // ── Rating sheet ──────────────────────────────────────────────────────────

  function openRatingSheet() {
    setShowRating(true);
    Animated.spring(ratingSlide, {
      toValue: 0, useNativeDriver: true, speed: 14, bounciness: 4,
    }).start();
  }

  function openCancelOverlay() {
    setShowCancel(true);
    Animated.spring(cancelSlide, {
      toValue: 0, useNativeDriver: true, speed: 14, bounciness: 4,
    }).start();
  }

  // Count down the incoming cancel request; when it hits 0 the server's timeout
  // cron resolves it (a status_change will arrive) — we just stop showing it.
  useEffect(() => {
    if (!cancelReq || cancelReq.secs <= 0) return;
    const id = setInterval(() => {
      setCancelReq((c) => (c ? { ...c, secs: Math.max(0, c.secs - 1) } : c));
    }, 1000);
    return () => clearInterval(id);
  }, [cancelReq]);

  async function respondToCancel(agree: boolean) {
    if (!rideId || respondingCancel) return;
    setRespondingCancel(true);
    try {
      const t = await getToken();
      if (agree) {
        await apiClient(`/rides/${rideId}/cancel`, t, { method: 'POST', body: JSON.stringify({ agreeToCancel: true }) });
      } else {
        await apiClient(`/rides/${rideId}/cancel-request/decline`, t, { method: 'POST', body: JSON.stringify({}) });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCancelReq(null);
    } catch (e: any) {
      Alert.alert('Could not respond', e?.message ?? 'Try again');
    } finally {
      setRespondingCancel(false);
    }
  }

  // Driver-initiated cancel (free + immediate, only before heading out).
  function driverCancel() {
    if (!rideId || acting) return;
    Alert.alert('Cancel this ride?', 'The rider goes back to browsing. No charge.', [
      { text: 'Keep ride', style: 'cancel' },
      {
        text: 'Cancel ride', style: 'destructive',
        onPress: async () => {
          setActing(true);
          try {
            const t = await getToken();
            await apiClient(`/rides/${rideId}/cancel`, t, { method: 'POST', body: JSON.stringify({}) });
            void stopRideTracking();
            router.replace('/(driver)/home' as any);
          } catch (e: any) {
            Alert.alert('Could not cancel', e?.message ?? 'Try again');
          } finally { setActing(false); }
        },
      },
    ]);
  }

  async function proposePrice() {
    const np = parseFloat(priceInput);
    if (isNaN(np) || np < 1) { Alert.alert('Invalid price', 'Enter a price of at least $1.'); return; }
    if (!rideId || proposingPrice) return;
    setProposingPrice(true);
    try {
      const t = await getToken();
      await apiClient(`/rides/${rideId}/update-price`, t, {
        method: 'POST',
        body: JSON.stringify({ newPrice: np, reason: priceReason.trim() || undefined }),
      });
      setRide((prev) => prev ? { ...prev, proposedPrice: np, proposedPriceReason: priceReason.trim() || null } : prev);
      setShowPriceModal(false); setPriceInput(''); setPriceReason('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Could not update price', e?.message ?? 'Try again');
    } finally { setProposingPrice(false); }
  }

  function openMapsNav(
    address: string | null,
    coords?: { lat: number; lng: number } | null,
  ) {
    if (!address && !coords) return;
    // Prefer coordinates — more precise, works for new streets & rural areas.
    // Fall back to address text for direct bookings that have no lat/lng.
    const appleTarget = coords
      ? `${coords.lat},${coords.lng}`
      : encodeURIComponent(address!);
    const googleTarget = coords
      ? `${coords.lat},${coords.lng}`
      : encodeURIComponent(address!);
    const wazeTarget = coords
      ? `ll=${coords.lat},${coords.lng}`
      : `q=${encodeURIComponent(address!)}`;
    const androidTarget = coords
      ? `${coords.lat},${coords.lng}`
      : encodeURIComponent(address!);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Apple Maps', 'Google Maps', 'Waze', 'Cancel'], cancelButtonIndex: 3 },
        (i) => {
          if (i === 0) void Linking.openURL(`maps://?daddr=${appleTarget}`);
          if (i === 1) void Linking.openURL(`comgooglemaps://?daddr=${googleTarget}&directionsmode=driving`);
          if (i === 2) void Linking.openURL(`waze://?${wazeTarget}&navigate=yes`);
        },
      );
    } else {
      void Linking.openURL(`geo:0,0?q=${androidTarget}`).catch(() =>
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${androidTarget}`)
      );
    }
  }

  async function submitRating() {
    if (!selectedRating || !rideId) return;
    setSubmittingRating(true);
    try {
      const t = await getToken();
      await apiClient(`/rides/${rideId}/rate`, t, {
        method: 'POST',
        body: JSON.stringify({ rating: selectedRating }),
      });
      if (ratingComment.trim()) {
        await apiClient('/comments', t, {
          method: 'POST',
          body: JSON.stringify({ rideId, content: ratingComment.trim() }),
        }).catch(() => {});
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(driver)/home');
    } catch (e: any) {
      Alert.alert('Rating failed', e.message ?? 'Try again');
    } finally {
      setSubmittingRating(false);
    }
  }

  function skipRating() {
    router.replace('/(driver)/home');
  }

  // ── State transition handlers ──────────────────────────────────────────────

  async function goOtw() {
    if (!rideId || acting) return;
    setActing(true);
    setError(null);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const t = await getToken();
      await apiClient(`/rides/${rideId}/otw`, t, { method: 'POST' });
      setRide((prev) => prev ? { ...prev, status: 'otw', otwAt: new Date().toISOString() } : prev);
      // Start background GPS so rider can track driver approach even if driver switches apps
      if (t) void startRideTracking(rideId, t);
    } catch (e: any) {
      setError(e.message ?? 'Could not mark OTW');
    } finally {
      setActing(false);
    }
  }

  async function goHere() {
    if (!rideId || acting) return;
    setActing(true);
    setError(null);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const t = await getToken();
      const gps = await tryGetGPS();
      await apiClient(`/rides/${rideId}/here`, t, {
        method: 'POST',
        body: JSON.stringify(gps ? { driverLat: gps.lat, driverLng: gps.lng } : {}),
      });
      setRide((prev) => prev ? { ...prev, status: 'here', hereAt: new Date().toISOString() } : prev);
    } catch (e: any) {
      setError(e.message ?? 'Could not mark arrived');
    } finally {
      setActing(false);
    }
  }

  async function startRide() {
    if (!rideId || acting) return;
    setActing(true);
    setError(null);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const t = await getToken();
      const gps = await tryGetGPS();
      await apiClient(`/rides/${rideId}/start`, t, {
        method: 'POST',
        body: JSON.stringify(gps ? { driverLat: gps.lat, driverLng: gps.lng } : {}),
      });
      setRide((prev) => prev ? { ...prev, status: 'confirming' } : prev);
    } catch (e: any) {
      setError(e.message ?? 'Could not start ride');
    } finally {
      setActing(false);
    }
  }

  async function endRide() {
    if (!rideId || acting) return;
    Alert.alert(
      'End Ride?',
      'Confirm you have dropped off the rider at their destination.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'END RIDE',
          style: 'destructive',
          onPress: async () => {
            setActing(true);
            setError(null);
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            try {
              const t = await getToken();
              const gps = await tryGetGPS();
              await apiClient(`/rides/${rideId}/end`, t, {
                method: 'POST',
                body: JSON.stringify(gps ? { driverLat: gps.lat, driverLng: gps.lng } : {}),
              });
              void stopRideTracking();
              setRide((prev) => prev ? { ...prev, status: 'ended', endedAt: new Date().toISOString() } : prev);
              openRatingSheet();
            } catch (e: any) {
              setError(e.message ?? 'Could not end ride');
            } finally {
              setActing(false);
            }
          },
        },
      ]
    );
  }

  function dismissAddOnSheet() {
    Animated.spring(pendingAddOnSlide, { toValue: 300, useNativeDriver: true, speed: 14, bounciness: 0 }).start(() => {
      setPendingAddOn(null);
    });
  }

  async function approvePendingAddOn() {
    if (!pendingAddOn || !rideId || approving) return;
    setApproving(true);
    try {
      const t = await getToken();
      await apiClient(`/rides/${rideId}/add-ons`, t, {
        method: 'PATCH',
        body: JSON.stringify({ add_on_id: pendingAddOn.id, action: 'confirm' }),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message ?? 'Failed to confirm extra');
    } finally {
      setApproving(false);
      dismissAddOnSheet();
      void fetchAddOns();
    }
  }

  async function rejectPendingAddOn() {
    if (!pendingAddOn || !rideId || approving) return;
    setApproving(true);
    try {
      const t = await getToken();
      await apiClient(`/rides/${rideId}/add-ons`, t, {
        method: 'PATCH',
        body: JSON.stringify({ add_on_id: pendingAddOn.id, action: 'reject' }),
      });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      setError(e.message ?? 'Failed to reject extra');
    } finally {
      setApproving(false);
      dismissAddOnSheet();
      void fetchAddOns();
    }
  }

  // ── Action button config ───────────────────────────────────────────────────

  function getActionConfig() {
    if (!ride) return null;
    const { status, cooAt } = ride;
    switch (status) {
      case 'matched':
        if (cooAt) {
          return { label: "I'M OTW", enabled: true, bg: colors.amber, fn: goOtw };
        }
        return { label: 'WAITING FOR PULL UP', enabled: false, bg: colors.cardAlt, fn: null };
      case 'otw':
        return { label: "I'M HERE", enabled: true, bg: colors.blue, fn: goHere };
      case 'here':
        return { label: 'START RIDE', enabled: true, bg: colors.green, fn: startRide };
      case 'confirming':
        return { label: 'RIDER CONFIRMING...', enabled: false, bg: colors.cardAlt, fn: null };
      case 'active':
      case 'in_progress':
        return { label: 'END RIDE', enabled: true, bg: colors.red, fn: endRide };
      default:
        return null;
    }
  }

  // ── Animated card wrapper ──────────────────────────────────────────────────

  function card(index: number, children: React.ReactNode, extraStyle?: object) {
    const { opacity, y } = cardAnims[index];
    return (
      <Animated.View
        style={[s.card, shadow.card, extraStyle, { opacity, transform: [{ translateY: y }] }]}
      >
        {children}
      </Animated.View>
    );
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  if (!rideId) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Text style={s.errorText}>No ride ID — navigate here from the feed</Text>
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => { setError(null); setLoading(true); void fetchRide(); }}>
          <Text style={s.errorText}>{error ?? 'Ride not found'}</Text>
          <Text style={[s.errorText, { fontSize: 11, marginTop: 8, color: colors.textFaint }]}>Tap to retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const meta = statusMeta(ride.status);
  const action = getActionConfig();
  const isEnded = ride.status === 'ended' || ride.status === 'completed';
  const isCoo = !!ride.cooAt;
  const isMatched = ride.status === 'matched';
  const isConfirming = ride.status === 'confirming';

  const displayPayout = isEnded && ride.driverPayout > 0
    ? ride.driverPayout
    : ride.agreedPrice;

  const confirmedExtrasTotal = addOns
    .filter(a => a.status === 'confirmed')
    .reduce((sum, a) => sum + addOnLineTotal(a), 0);

  const riderDisplayName = ride.riderHandle
    ? `@${ride.riderHandle}`
    : ride.riderFirstName ?? 'Rider';

  const pickupLL = toLatLng(ride.pickupLat, ride.pickupLng);
  const dropoffLL = toLatLng(ride.dropoffLat, ride.dropoffLng);
  const stopsLL = (ride.stops ?? [])
    .map((st) => toLatLng(st.lat, st.lng))
    .filter((x): x is LatLng => x !== null);
  const hasMap = !!(pickupLL || dropoffLL) && !!MAPBOX_TOKEN;
  const canChat = ['otw', 'here', 'confirming', 'active', 'ended'].includes(ride.status);
  function openChat() { setChatOpen(true); chat.setOpen(true); }
  function closeChat() { setChatOpen(false); chat.setOpen(false); }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ── Navbar ── */}
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.navTitle}>ACTIVE RIDE</Text>
          {ride.refCode && (
            <Text style={s.navRef}>REF: {ride.refCode}</Text>
          )}
        </View>
        <View style={[s.statusPill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
          <Text style={[s.statusLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      {/* Rider cancel-request — agree (no charge) or decline (keep deposit) */}
      {cancelReq && (
        <View style={s.cancelReqBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.cancelReqTitle}>RIDER WANTS TO CANCEL</Text>
            <Text style={s.cancelReqTimer}>
              {Math.floor(cancelReq.secs / 60)}:{String(cancelReq.secs % 60).padStart(2, '0')}
            </Text>
          </View>
          {!!cancelReq.reason && <Text style={s.cancelReqReason}>“{cancelReq.reason}”</Text>}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <TouchableOpacity
              style={[s.cancelReqBtn, { backgroundColor: colors.cardAlt }]}
              onPress={() => respondToCancel(false)}
              disabled={respondingCancel}
            >
              <Text style={[s.cancelReqBtnText, { color: colors.textPrimary }]}>Decline & keep deposit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.cancelReqBtn, { backgroundColor: colors.green }]}
              onPress={() => respondToCancel(true)}
              disabled={respondingCancel}
            >
              {respondingCancel
                ? <ActivityIndicator size="small" color={colors.bg} />
                : <Text style={[s.cancelReqBtnText, { color: colors.bg }]}>Agree — no charge</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Live map ── */}
        {hasMap && (
          <RideMap
            viewerRole="driver"
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

        {/* ── Live ETA — to pickup while en route, to dropoff once active ── */}
        {['otw', 'here', 'confirming', 'active', 'in_progress'].includes(ride.status) && (
          <View style={s.etaBanner}>
            <Ionicons name="navigate" size={16} color={colors.green} />
            <Text style={s.etaText}>
              {isActive
                ? eta
                  ? `${eta.min} min to dropoff (${eta.mi.toFixed(1)} mi)`
                  : 'En route to dropoff…'
                : eta
                  ? `${eta.min} min to pickup (${eta.mi.toFixed(1)} mi)`
                  : 'Locating pickup…'}
            </Text>
          </View>
        )}

        {/* ── Payout card ── */}
        {card(0,
          <View>
            <Text style={s.cardLabel}>
              {isEnded ? 'YOU EARNED' : ride.isCash ? 'CASH FARE' : 'AGREED PRICE'}
            </Text>
            {confirmedExtrasTotal > 0 ? (
              <>
                <Text style={s.payoutAmount}>${(displayPayout + confirmedExtrasTotal).toFixed(2)}</Text>
                <View style={s.extrasBreakdown}>
                  <Text style={s.extrasBreakdownLine}>BASE ${displayPayout.toFixed(2)}</Text>
                  <Text style={[s.extrasBreakdownLine, { color: colors.amber }]}>+ EXTRAS ${confirmedExtrasTotal.toFixed(2)}</Text>
                </View>
              </>
            ) : (
              <Text style={s.payoutAmount}>${displayPayout.toFixed(2)}</Text>
            )}
            {!ride.isCash && !isEnded && ride.platformFee > 0 && (
              <Text style={s.payoutSub}>
                {`After ${(ride.platformFee / ride.agreedPrice * 100).toFixed(0)}% platform fee`}
              </Text>
            )}
            <View style={[s.typePill, ride.isCash
              ? { backgroundColor: colors.cashDim, borderColor: colors.cashBorder }
              : { backgroundColor: colors.greenDim, borderColor: colors.greenBorder }
            ]}>
              <Ionicons
                name={ride.isCash ? 'cash-outline' : 'card-outline'}
                size={11}
                color={ride.isCash ? colors.cash : colors.green}
              />
              <Text style={[s.typeText, { color: ride.isCash ? colors.cash : colors.green }]}>
                {ride.isCash ? 'CASH RIDE' : 'DIGITAL RIDE'}
              </Text>
            </View>
          </View>
        )}

        {/* ── Route card ── */}
        {card(1,
          <>
            <Text style={s.cardLabel}>ROUTE</Text>
            <View style={s.routeWrap}>
              <View style={s.routeStop}>
                <View style={s.routeIconCol}>
                  <View style={s.dotFrom} />
                  <View style={s.connector} />
                </View>
                <View style={s.routeTextCol}>
                  <Text style={s.stopType}>PICKUP</Text>
                  <Text style={s.stopAddr}>{ride.pickupAddress ?? '—'}</Text>
                  {ride.pickupAddress && (
                    <TouchableOpacity style={s.navBtn} onPress={() => openMapsNav(ride.pickupAddress, ride.pickupLat && ride.pickupLng ? { lat: ride.pickupLat, lng: ride.pickupLng } : null)} activeOpacity={0.7}>
                      <Ionicons name="navigate-outline" size={11} color={colors.green} />
                      <Text style={s.navBtnText}>NAVIGATE</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {/* Intermediate stops */}
              {ride.stops.map((stop, idx) => (
                <View key={idx} style={s.routeStop}>
                  <View style={s.routeIconCol}>
                    <View style={[s.dotFrom, { backgroundColor: colors.amber }]} />
                    <View style={s.connector} />
                  </View>
                  <View style={s.routeTextCol}>
                    <Text style={s.stopType}>STOP {idx + 1}</Text>
                    <Text style={s.stopAddr}>{stop.address ?? `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`}</Text>
                    {(stop.address || (stop.lat && stop.lng)) && (
                      <TouchableOpacity style={s.navBtn} onPress={() => openMapsNav(stop.address ?? null, { lat: stop.lat, lng: stop.lng })} activeOpacity={0.7}>
                        <Ionicons name="navigate-outline" size={11} color={colors.green} />
                        <Text style={s.navBtnText}>NAVIGATE</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
              <View style={s.routeStop}>
                <View style={s.routeIconCol}>
                  <Ionicons name="location" size={13} color={colors.green} />
                </View>
                <View style={s.routeTextCol}>
                  <Text style={s.stopType}>DROPOFF{ride.tripType === 'round_trip' ? ' (ROUND TRIP)' : ''}</Text>
                  <Text style={s.stopAddr}>{ride.dropoffAddress ?? '—'}</Text>
                  {ride.dropoffAddress && (
                    <TouchableOpacity style={s.navBtn} onPress={() => openMapsNav(ride.dropoffAddress, ride.dropoffLat && ride.dropoffLng ? { lat: ride.dropoffLat, lng: ride.dropoffLng } : null)} activeOpacity={0.7}>
                      <Ionicons name="navigate-outline" size={11} color={colors.green} />
                      <Text style={s.navBtnText}>NAVIGATE</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── Rider card ── */}
        {card(2,
          <>
            <Text style={s.cardLabel}>RIDER</Text>
            <View style={s.riderRow}>
              <RiderAvatar url={ride.riderAvatarUrl} name={riderDisplayName} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={s.riderName}>{riderDisplayName}</Text>
                <View style={s.riderMeta}>
                  {ride.riderChillScore > 0 && (
                    <Text style={s.riderMetaText}>{Math.round(ride.riderChillScore)} chill</Text>
                  )}
                  {ride.riderCompletedRides > 0 && (
                    <Text style={s.riderMetaText}>{ride.riderCompletedRides} rides</Text>
                  )}
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── Timeline card ── */}
        {card(3,
          <>
            <Text style={s.cardLabel}>TIMELINE</Text>
            <TLRow icon="ellipse" label="MATCHED" value={formatTime(ride.createdAt)} active />
            <TLRow icon="navigate" label="OTW" value={formatTime(ride.otwAt)} active={!!ride.otwAt} />
            <TLRow icon="flag" label="ARRIVED" value={formatTime(ride.hereAt)} active={!!ride.hereAt} />
            <TLRow icon="checkmark-circle" label="STARTED" value={formatTime(ride.startedAt)} active={!!ride.startedAt} />
            <TLRow icon="stop-circle" label="ENDED" value={formatTime(ride.endedAt)} active={!!ride.endedAt} last />
          </>
        )}

        {/* ── Extras card ── */}
        {addOns.length > 0 && card(5,
          <>
            <Text style={s.cardLabel}>EXTRAS</Text>
            {addOns.map((a, i) => (
              <View key={a.id} style={[s.addOnRow, i === 0 && { borderTopWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.addOnName} numberOfLines={1}>{a.name}</Text>
                  {a.quantity > 1 && (
                    <Text style={s.addOnQty}>×{a.quantity}</Text>
                  )}
                </View>
                <Text style={s.addOnPrice}>${addOnLineTotal(a).toFixed(2)}</Text>
                <View style={[
                  s.addOnStatus,
                  a.status === 'confirmed' && s.addOnStatusOk,
                  a.status === 'pending_driver' && s.addOnStatusPending,
                ]}>
                  <Text style={[
                    s.addOnStatusText,
                    a.status === 'confirmed' && { color: colors.green },
                    a.status === 'pending_driver' && { color: colors.amber },
                  ]}>
                    {a.status === 'confirmed' ? 'CONFIRMED' : a.status === 'pending_driver' ? 'PENDING' : a.status.replace(/_/g, ' ').toUpperCase()}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Waiting state helpers ── */}
        {isMatched && !isCoo && card(4,
          <View style={s.waitBox}>
            <Ionicons name="hourglass-outline" size={20} color={colors.amber} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[s.waitTitle, { color: colors.amber }]}>WAITING FOR RIDER</Text>
              <Text style={s.waitBody}>
                Rider is entering their exact pickup location. You'll see it here once they confirm.
              </Text>
            </View>
          </View>
        )}

        {isConfirming && card(4,
          <View style={s.waitBox}>
            <ActivityIndicator size="small" color={colors.green} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[s.waitTitle, { color: colors.green }]}>RIDER CONFIRMING</Text>
              <Text style={s.waitBody}>
                Ask the rider to tap "I'm in the car" on their app to start the ride.
              </Text>
            </View>
          </View>
        )}

        {/* Change price (before OTW) — proposes a new price for the rider to accept */}
        {isMatched && (
          ride.proposedPrice != null ? (
            <View style={s.pricePendingRow}>
              <Ionicons name="hourglass-outline" size={14} color={colors.amber} />
              <Text style={s.pricePendingText}>Proposed ${ride.proposedPrice.toFixed(0)} — waiting for rider</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={s.changePriceBtn}
              onPress={() => { setPriceInput(String(Math.round(ride.agreedPrice))); setShowPriceModal(true); }}
              activeOpacity={0.8}
            >
              <Ionicons name="pricetag-outline" size={15} color={colors.amber} />
              <Text style={s.changePriceText}>Change price</Text>
            </TouchableOpacity>
          )
        )}

        {/* Driver cancel — free + immediate, only before heading out */}
        {isMatched && (
          <TouchableOpacity style={s.driverCancelLink} onPress={driverCancel} disabled={acting} activeOpacity={0.7}>
            <Text style={s.driverCancelText}>Cancel ride</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Change-price modal */}
      <Modal transparent visible={showPriceModal} animationType="fade" onRequestClose={() => setShowPriceModal(false)}>
        <View style={s.priceModalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowPriceModal(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[s.priceModalCard, { paddingBottom: insets.bottom + spacing.lg }]}>
              <Text style={s.priceModalTitle}>PROPOSE A NEW PRICE</Text>
              <Text style={s.priceModalSub}>The rider must accept before it takes effect.</Text>
              <View style={s.priceModalInputRow}>
                <Text style={s.priceModalDollar}>$</Text>
                <TextInput
                  style={s.priceModalInput}
                  value={priceInput}
                  onChangeText={setPriceInput}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textFaint}
                  autoFocus
                />
              </View>
              <TextInput
                style={s.priceModalReason}
                value={priceReason}
                onChangeText={setPriceReason}
                placeholder="Reason (optional) — e.g. longer route, extra stop"
                placeholderTextColor={colors.textFaint}
                maxLength={120}
              />
              <TouchableOpacity style={s.priceModalBtn} onPress={proposePrice} disabled={proposingPrice}>
                {proposingPrice ? <ActivityIndicator color={colors.bg} /> : <Text style={s.priceModalBtnText}>SEND TO RIDER</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Error banner ── */}
      {error && (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle" size={14} color={colors.red} />
          <Text style={s.errorBannerText} numberOfLines={2}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Ionicons name="close" size={14} color={colors.red} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Bottom action button ── */}
      {action && !isEnded && (
        <View style={[s.actionWrap, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[
              s.actionBtn,
              { backgroundColor: action.enabled ? action.bg : colors.cardAlt },
            ]}
            onPress={action.fn ?? undefined}
            disabled={!action.enabled || acting}
            activeOpacity={0.85}
          >
            {acting
              ? <ActivityIndicator size="small" color={action.enabled ? colors.bg : colors.textFaint} />
              : <Text style={[s.actionLabel, { color: action.enabled ? colors.bg : colors.textFaint }]}>
                  {action.label}
                </Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* ── Chat FAB ── */}
      {canChat && (
        <TouchableOpacity
          style={[s.chatFab, { bottom: insets.bottom + (action && !isEnded ? 84 : 24) }]}
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
        viewerRole="driver"
        rideStatus={ride.status}
        otherName={riderDisplayName}
      />

      {canChat && (
        <RideSafety
          check={safety.check}
          respond={safety.respond}
          distress={safety.distress}
          sosOpen={safety.sosOpen}
          setSosOpen={safety.setSosOpen}
          busy={safety.busy}
          bottom={insets.bottom + (action && !isEnded ? 84 : 24)}
        />
      )}

      {/* ── Rider cancelled overlay ── */}
      {showCancel && (
        <Animated.View style={[s.ratingOverlay, { transform: [{ translateY: cancelSlide }] }]}>
          <View style={[s.ratingSheet, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={[s.ratingHandle, { backgroundColor: colors.redBorder }]} />
            <Text style={[s.ratingTitle, { color: colors.red }]}>RIDE CANCELLED</Text>
            <Text style={s.ratingSub}>The rider cancelled this ride.</Text>
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: colors.green, marginTop: spacing.xl }]}
              onPress={() => router.replace('/(driver)/home')}
              activeOpacity={0.85}
            >
              <Text style={s.submitLabel}>GO HOME</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ── Extra approval sheet ── */}
      {pendingAddOn && (
        <Animated.View style={[s.ratingOverlay, { transform: [{ translateY: pendingAddOnSlide }] }]}>
          <View style={[s.ratingSheet, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={[s.ratingHandle, { backgroundColor: colors.amberBorder }]} />
            <Text style={[s.ratingTitle, { color: colors.amber }]}>RIDER WANTS TO ADD</Text>
            <View style={s.addOnApprovalItem}>
              <Text style={s.addOnApprovalName}>{pendingAddOn.name}</Text>
              {pendingAddOn.quantity > 1 && (
                <Text style={s.addOnApprovalQty}>×{pendingAddOn.quantity}</Text>
              )}
              <Text style={s.addOnApprovalPrice}>${Number(pendingAddOn.subtotal).toFixed(2)}</Text>
            </View>
            <Text style={s.ratingSub}>
              Approving charges the rider's card immediately.
            </Text>
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: colors.green, marginTop: spacing.xl }]}
              onPress={approvePendingAddOn}
              disabled={approving}
              activeOpacity={0.85}
            >
              {approving
                ? <ActivityIndicator size="small" color={colors.bg} />
                : <Text style={s.submitLabel}>APPROVE + CHARGE</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: colors.cardAlt, borderColor: colors.redBorder, borderWidth: 1, marginTop: spacing.md }]}
              onPress={rejectPendingAddOn}
              disabled={approving}
              activeOpacity={0.85}
            >
              <Text style={[s.submitLabel, { color: colors.red }]}>DECLINE</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ── Rating overlay ── */}
      {showRating && (
        <Animated.View style={[s.ratingOverlay, { transform: [{ translateY: ratingSlide }] }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[s.ratingSheet, { paddingBottom: insets.bottom + spacing.xl }]}>
              <View style={s.ratingHandle} />
              <Text style={s.ratingTitle}>RATE YOUR RIDER</Text>
              <Text style={s.ratingSub}>How was the ride?</Text>

              <View style={s.ratingGrid}>
                {RATING_OPTIONS.map((opt) => {
                  const selected = selectedRating === opt.type;
                  return (
                    <Pressable
                      key={opt.type}
                      style={[
                        s.ratingOption,
                        selected
                          ? { backgroundColor: opt.dim, borderColor: opt.border }
                          : { backgroundColor: colors.cardAlt, borderColor: colors.border },
                      ]}
                      onPress={() => {
                        setSelectedRating(opt.type);
                        Haptics.selectionAsync();
                      }}
                    >
                      <Text style={s.ratingEmoji}>{opt.emoji}</Text>
                      <Text style={[s.ratingLabel, { color: selected ? opt.color : colors.textSecondary }]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                style={s.ratingComment}
                placeholder="Leave a comment about this rider (optional)…"
                placeholderTextColor={colors.textFaint}
                value={ratingComment}
                onChangeText={setRatingComment}
                multiline
                maxLength={160}
              />

              <TouchableOpacity
                style={[s.submitBtn, !selectedRating && s.submitBtnDisabled]}
                onPress={submitRating}
                disabled={!selectedRating || submittingRating}
                activeOpacity={0.85}
              >
                {submittingRating
                  ? <ActivityIndicator size="small" color={colors.bg} />
                  : <Text style={s.submitLabel}>SUBMIT RATING</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity onPress={skipRating} style={s.skipBtn}>
                <Text style={s.skipLabel}>SKIP FOR NOW</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      )}
    </View>
  );
}

// ── Rider avatar ──────────────────────────────────────────────────────────────

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

// ── Timeline row ──────────────────────────────────────────────────────────────

function TLRow({ icon, label, value, active, last }: {
  icon: string; label: string; value: string; active: boolean; last?: boolean;
}) {
  return (
    <View style={tl.row}>
      <View style={tl.iconCol}>
        <Ionicons name={icon as any} size={13} color={active ? colors.green : colors.textFaint} />
        {!last && <View style={[tl.line, !active && { backgroundColor: colors.border }]} />}
      </View>
      <View style={tl.textCol}>
        <Text style={[tl.label, !active && { color: colors.textFaint }]}>{label}</Text>
        <Text style={[tl.value, !active && { color: colors.textFaint }]}>{value}</Text>
      </View>
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
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
  statusLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 },

  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  map: {
    height: 220, borderRadius: radius.card, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  etaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.greenDim, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.greenBorder,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.lg,
  },
  etaText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.green, flex: 1 },
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
  cancelReqBanner: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md,
    backgroundColor: colors.redDim, borderRadius: radius.card, borderWidth: 1, borderColor: colors.redBorder,
  },
  cancelReqTitle: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.red, letterSpacing: 1 },
  cancelReqTimer: { fontFamily: fonts.mono, fontSize: 13, color: colors.red },
  cancelReqReason: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' },
  cancelReqBtn: { flex: 1, borderRadius: radius.pill, paddingVertical: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  cancelReqBtnText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.5 },
  pricePendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, marginTop: spacing.sm },
  pricePendingText: { fontFamily: fonts.mono, fontSize: 11, color: colors.amber, letterSpacing: 0.5 },
  changePriceBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.amberBorder, borderRadius: radius.card, backgroundColor: colors.amberDim,
  },
  changePriceText: { fontFamily: fonts.mono, fontSize: 12, color: colors.amber, letterSpacing: 1 },
  priceModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  priceModalCard: {
    backgroundColor: colors.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card,
    borderTopWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.md,
  },
  priceModalTitle: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary, letterSpacing: 2 },
  priceModalSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
  priceModalInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderStrong, paddingBottom: spacing.sm },
  priceModalDollar: { fontFamily: fonts.display, fontSize: 32, color: colors.textSecondary },
  priceModalInput: { flex: 1, fontFamily: fonts.display, fontSize: 32, color: colors.textPrimary, padding: 0 },
  priceModalReason: {
    fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  priceModalBtn: { backgroundColor: colors.green, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
  priceModalBtnText: { fontFamily: fonts.mono, fontSize: 14, color: colors.bg, letterSpacing: 1 },
  driverCancelLink: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  driverCancelText: { fontFamily: fonts.body, fontSize: 14, color: colors.red },
  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 3, marginBottom: spacing.md },

  payoutAmount: { fontFamily: fonts.display, fontSize: 56, color: colors.green, lineHeight: 58, marginBottom: 2 },
  payoutSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginBottom: spacing.md },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1,
  },
  typeText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1 },

  routeWrap: { gap: spacing.sm },
  routeStop: { flexDirection: 'row', gap: spacing.md },
  routeIconCol: { width: 16, alignItems: 'center', paddingTop: 2 },
  dotFrom: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textFaint, marginTop: 2 },
  connector: { flex: 1, width: 1, backgroundColor: colors.border, marginVertical: 4 },
  routeTextCol: { flex: 1, paddingBottom: spacing.md },
  stopType: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1.5, marginBottom: 4 },
  stopAddr: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

  riderRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    backgroundColor: colors.cardAlt,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  avatarLetter: { fontFamily: fonts.display, fontSize: 24, color: colors.green },
  riderName: { fontFamily: fonts.mono, fontSize: 14, color: colors.textPrimary, letterSpacing: 0.5 },
  riderMeta: { flexDirection: 'row', gap: spacing.md, marginTop: 4 },
  riderMetaText: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },

  waitBox: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md },
  waitTitle: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2, marginBottom: 6 },
  waitBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, lineHeight: 20 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.xl, marginBottom: spacing.sm,
    backgroundColor: colors.redDim, borderRadius: radius.cardInner,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.redBorder,
  },
  errorBannerText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.red },

  actionWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  actionBtn: {
    height: 58, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontFamily: fonts.monoBold, fontSize: 14, letterSpacing: 1.5 },

  // Rating overlay (slides up from bottom)
  ratingOverlay: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
  },
  ratingSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl, paddingTop: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
    ...shadow.card,
  },
  ratingHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.xl,
  },
  ratingTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.textPrimary, marginBottom: 4 },
  ratingSub: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, marginBottom: spacing.xl },
  ratingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  ratingComment: {
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.borderStrong,
    padding: spacing.md, fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary,
    minHeight: 60, textAlignVertical: 'top', marginBottom: spacing.lg,
  },
  ratingOption: {
    flexBasis: '47%', flexGrow: 1, borderRadius: radius.cardInner,
    paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.sm,
    borderWidth: 1,
  },
  ratingEmoji: { fontSize: 24 },
  ratingLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 },
  submitBtn: {
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: 'center', marginBottom: spacing.md,
  },
  submitBtnDisabled: { backgroundColor: colors.cardAlt },
  submitLabel: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1.5 },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.md },
  skipLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 1 },

  navBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6, alignSelf: 'flex-start',
    paddingVertical: 4, paddingHorizontal: 8,
    borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.greenBorder, backgroundColor: colors.greenDim,
  },
  navBtnText: { fontFamily: fonts.mono, fontSize: 9, color: colors.green, letterSpacing: 1 },

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
  addOnStatusText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },

  extrasBreakdown: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.sm },
  extrasBreakdownLine: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1 },

  addOnApprovalItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    padding: spacing.lg, marginVertical: spacing.lg,
    borderWidth: 1, borderColor: colors.amberBorder, gap: spacing.sm,
  },
  addOnApprovalName: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.textPrimary },
  addOnApprovalQty: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint },
  addOnApprovalPrice: { fontFamily: fonts.display, fontSize: 28, color: colors.amber },
});

const tl = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  iconCol: { width: 20, alignItems: 'center' },
  line: { flex: 1, width: 1, backgroundColor: colors.green, marginTop: 3, minHeight: 18 },
  textCol: { flex: 1, paddingBottom: spacing.xs },
  label: { fontFamily: fonts.mono, fontSize: 9, color: colors.green, letterSpacing: 1.5, marginBottom: 2 },
  value: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
});
