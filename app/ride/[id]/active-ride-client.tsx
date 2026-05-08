'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useAbly } from '@/hooks/use-ably';
import { fbEvent, fbCustomEvent } from '@/components/analytics/meta-pixel';
import Link from 'next/link';
import RideChat from '@/components/ride/ride-chat';
import RiderProfileOverlay from '@/components/rider/rider-profile-overlay';
import DriverProfileOverlay from '@/components/driver/driver-profile-overlay';
import { AddressAutocomplete } from '@/components/ride/address-autocomplete';
import type { ValidatedAddress, ValidatedStop } from '@/lib/db/types';
import AddOnMenuSheet from '@/components/ride/add-on-menu-sheet';
import DriverAddOnApproval from '@/components/ride/driver-add-on-approval';
import SafetyCheckOverlay from '@/components/ride/safety-check-overlay';
import SafetyTile from '@/components/ride/safety-tile';
import dynamic from 'next/dynamic';

const InlinePaymentForm = dynamic(() => import('@/components/payments/inline-payment-form'), { ssr: false });

// Mapbox GL loaded via CDN script tag — accessed as window.mapboxgl
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const mapboxgl: any;

// ── Theme constants (inline, no CSS vars) ──
const COLORS = {
  green: '#00E676',
  black: '#080808',
  card: '#141414',
  white: '#FFFFFF',
  gray: '#888888',
  grayLight: '#AAAAAA',
  red: '#FF5252',
  blue: '#448AFF',
  yellow: '#FFD740',
  orange: '#FF9100',
};

const FONTS = {
  display: "'Bebas Neue', sans-serif",
  body: "'DM Sans', sans-serif",
  mono: "'Space Mono', monospace",
};

// ── Types ──
interface RideData {
  refCode: string | null;
  status: string;
  driverName: string;
  driverHandle: string | null;
  driverAvatarUrl: string | null;
  riderName: string;
  agreedPrice: number;
  agreementSummary: Record<string, unknown> | null;
  pickup: Record<string, unknown> | null;
  dropoff: Record<string, unknown> | null;
  stops: unknown[] | null;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  otwAt: string | null;
  hereAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  disputeWindowExpiresAt: string | null;
  earlyEndReason: string | null;
  earlyEndNotes: string | null;
  riderAcknowledgedEarlyEnd: boolean | null;
  driverPayoutAmount: number;
  platformFeeAmount: number;
  cooAt: string | null;
  riderLat: number | null;
  riderLng: number | null;
  riderLocationText: string | null;
  riderHandle: string | null;
  riderAvatarUrl: string | null;
  driverPlate: string | null;
  driverPlateState: string | null;
  isCash: boolean;
  proposedPrice: number | null;
  proposedPriceReason: string | null;
  waitMinutes: number;
  confirmDeadline: string | null;
  addOns: { id: string; name: string; unitPrice: number; quantity: number; subtotal: number; status: string; addedBy: string }[];
  addOnTotal: number;
}

interface ActiveRideClientProps {
  rideId: string;
  userId: string;
  isDriver: boolean;
  initialRide: RideData;
  mapboxToken: string;
}

type RatingType = 'chill' | 'cool_af' | 'kinda_creepy' | 'weirdo';

const RATING_OPTIONS: { type: RatingType; label: string; emoji: string; description: string; color: string }[] = [
  { type: 'chill', label: 'CHILL', emoji: '\u2705', description: 'Good vibes', color: COLORS.green },
  { type: 'cool_af', label: 'Cool AF', emoji: '\uD83D\uDE0E', description: 'Great energy', color: COLORS.blue },
  { type: 'kinda_creepy', label: 'Kinda Creepy', emoji: '\uD83D\uDC40', description: 'Something felt off', color: COLORS.yellow },
  { type: 'weirdo', label: 'WEIRDO', emoji: '\uD83D\uDEA9', description: 'Safety concern', color: COLORS.red },
];

// ── Status display config ──
function getStatusDisplay(status: string, isDriver: boolean): { label: string; color: string } {
  switch (status) {
    case 'matched':
      return isDriver
        ? { label: 'MATCHED', color: COLORS.green }
        : { label: 'MATCHED', color: COLORS.green };
    case 'otw':
      return { label: 'OTW', color: COLORS.orange };
    case 'here':
      return { label: 'HERE', color: COLORS.yellow };
    case 'confirming':
      return isDriver
        ? { label: 'CONFIRMING', color: COLORS.orange }
        : { label: 'CONFIRM RIDE', color: COLORS.orange };
    case 'active':
      return { label: 'RIDE ACTIVE', color: COLORS.green };
    case 'ended':
      return { label: 'RIDE ENDED', color: COLORS.grayLight };
    case 'completed':
      return { label: 'COMPLETED', color: COLORS.green };
    case 'disputed':
      return { label: 'DISPUTED', color: COLORS.red };
    case 'cancelled':
      return { label: 'CANCELLED', color: COLORS.red };
    default:
      return { label: status.toUpperCase(), color: COLORS.gray };
  }
}

export default function ActiveRideClient({
  rideId,
  userId,
  isDriver,
  initialRide,
  mapboxToken,
}: ActiveRideClientProps) {
  const [ride, setRide] = useState<RideData>({
    ...initialRide,
    agreedPrice: Number(initialRide.agreedPrice || 0),
    addOnTotal: Number(initialRide.addOnTotal || 0),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rated, setRated] = useState(false);
  const [disputeWindowRemaining, setDisputeWindowRemaining] = useState<number | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [eta, setEta] = useState<{ minutes: number; miles: number } | null>(null);
  const [lastLocationUpdate, setLastLocationUpdate] = useState<number>(Date.now());
  const [etaStale, setEtaStale] = useState(false);
  const smsNudgeSent = useRef(false);
  const [chatMessages, setChatMessages] = useState<{ id: string; senderId: string; content: string; createdAt: string; type?: string; quickKey?: string | null }[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [viewingRiderProfile, setViewingRiderProfile] = useState(false);
  const [viewingDriverProfile, setViewingDriverProfile] = useState(false);
  const [waitCountdown, setWaitCountdown] = useState<number | null>(null);
  const [showPulloff, setShowPulloff] = useState(false);
  const [confirmCountdown, setConfirmCountdown] = useState<number | null>(null);
  const autoConfirmFired = useRef(false);
  const [extensionRequested, setExtensionRequested] = useState(false);
  const [extensionPending, setExtensionPending] = useState(false);
  const [extensionsGranted, setExtensionsGranted] = useState(0);
  const [addOnReview, setAddOnReview] = useState<Map<string, string>>(new Map());
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [menuSheetOpen, setMenuSheetOpen] = useState(false);
  const addOnPanelRef = useRef<HTMLDivElement>(null);
  const [pendingStop, setPendingStop] = useState<{ address: string; latitude?: number; longitude?: number } | null>(null);
  const [cancelRequest, setCancelRequest] = useState<{ message: string; reason: string } | null>(null);
  const [endRideConfirm, setEndRideConfirm] = useState<{ show: boolean; reason: string; notes: string }>({ show: false, reason: '', notes: '' });
  const [addingMidRideStop, setAddingMidRideStop] = useState(false);
  // Location request: driver asks rider for live GPS
  const [locationRequested, setLocationRequested] = useState(false);
  const [locationRequestPending, setLocationRequestPending] = useState(false); // rider sees this
  const [priceEditorOpen, setPriceEditorOpen] = useState(false);
  const [priceEditorValue, setPriceEditorValue] = useState('');
  // Address update flow — rider can edit addresses post-COO before OTW
  const [editingAddress, setEditingAddress] = useState<'pickup' | 'dropoff' | null>(null);
  const [pendingAddressUpdate, setPendingAddressUpdate] = useState<{
    type: 'pickup' | 'dropoff';
    address: string;
    latitude: number;
    longitude: number;
    riderName?: string;
  } | null>(null);
  const [addressUpdateSent, setAddressUpdateSent] = useState(false);
  const [timingCollapsed, setTimingCollapsed] = useState(false);
  const [stopsExpanded, setStopsExpanded] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    emoji: string;
    color: string;
    sub?: string;
  } | null>(null);

  // Safety check-in prompt — server pushes via Ably when a check is due.
  // Overlay mounts while pendingCheck is non-null; it clears via onResolved.
  const [pendingCheck, setPendingCheck] = useState<{
    checkId: string;
    party: 'rider' | 'driver';
    autoDismissSeconds: number;
  } | null>(null);

  const [headingUp, setHeadingUp] = useState(true); // heading-up mode for driver during OTW/active
  const prevDriverLocation = useRef<{ lat: number; lng: number } | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any | null>(null);
  const driverMarkerRef = useRef<any | null>(null);
  const riderMarkerRef = useRef<any | null>(null);
  const routeDrawnRef = useRef(false);
  const pickupMarkerRef = useRef<any | null>(null);
  const dropoffMarkerRef = useRef<any | null>(null);

  // GPS tracking for driver during active ride phases
  const shouldTrackGps = isDriver && ['matched', 'otw', 'here', 'confirming', 'active'].includes(ride.status);
  const geo = useGeolocation({ rideId, enabled: shouldTrackGps });

  // Ably real-time subscription
  const handleAblyMessage = useCallback((msg: { name: string; data: unknown }) => {
    const data = msg.data as Record<string, unknown>;

    switch (msg.name) {
      case 'status_update': {
        const newStatus = data.status as string;
        const now = new Date().toISOString();
        setRide(prev => ({
          ...prev,
          status: newStatus,
          ...(newStatus === 'otw' ? { otwAt: now } : {}),
          ...(newStatus === 'here' ? { hereAt: now, waitMinutes: Number(data.waitMinutes || prev.waitMinutes) } : {}),
          ...(newStatus === 'active' ? { startedAt: now } : {}),
          ...(newStatus === 'ended' ? { endedAt: now } : {}),
        }));
        showStatusNotification(newStatus);
        break;
      }
      case 'location_update': {
        const lat = data.lat as number;
        const lng = data.lng as number;
        setDriverLocation({ lat, lng });
        break;
      }
      case 'ride_ended': {
        setRide(prev => ({
          ...prev,
          status: 'ended',
          endedAt: data.ended_at as string,
          disputeWindowExpiresAt: data.dispute_window_expires_at as string,
          driverPayoutAmount: Number(data.driver_payout_amount || prev.driverPayoutAmount),
          platformFeeAmount: Number(data.platform_fee_amount || prev.platformFeeAmount),
        }));
        showStatusNotification('ended');
        break;
      }
      case 'dispute_filed': {
        setRide(prev => ({ ...prev, status: 'disputed' }));
        showNotification('A dispute has been filed', '\uD83D\uDEA8', COLORS.red);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
        break;
      }
      case 'coo': {
        const pickup = data.pickup as Record<string, unknown> | null;
        const dropoff = data.dropoff as Record<string, unknown> | null;
        setRide(prev => ({
          ...prev,
          cooAt: new Date().toISOString(),
          riderLat: data.riderLat as number | null,
          riderLng: data.riderLng as number | null,
          riderLocationText: data.riderLocation as string | null,
          pickupAddress: (pickup?.address as string) || (data.riderLocation as string) || prev.pickupAddress,
          pickupLat: (pickup?.latitude as number) || prev.pickupLat,
          pickupLng: (pickup?.longitude as number) || prev.pickupLng,
          dropoffAddress: (dropoff?.address as string) || prev.dropoffAddress,
          dropoffLat: (dropoff?.latitude as number) || prev.dropoffLat,
          dropoffLng: (dropoff?.longitude as number) || prev.dropoffLng,
          stops: (data.stops as unknown[]) || prev.stops,
        }));
        showNotification('Pull Up — Payment ready!', '\uD83D\uDCB0', COLORS.green, 'Rider confirmed pickup location');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        break;
      }
      case 'status_change': {
        const newStatus = data.status as string;
        if (newStatus) {
          const now = new Date().toISOString();
          setRide(prev => ({
            ...prev,
            status: newStatus,
            ...(newStatus === 'otw' ? { otwAt: now } : {}),
            ...(newStatus === 'here' ? { hereAt: now, waitMinutes: Number(data.waitMinutes || prev.waitMinutes) } : {}),
            ...(newStatus === 'confirming' ? { confirmDeadline: (data.confirmDeadline as string) || null } : {}),
            ...(newStatus === 'active' ? { startedAt: now } : {}),
            ...(newStatus === 'ended' ? { endedAt: now } : {}),
          }));
          showStatusNotification(newStatus);
          // Vibrate + haptic on cancel for immediate attention
          if (newStatus === 'cancelled' && navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 200]);
          }
        }
        break;
      }
      case 'location': {
        setDriverLocation({ lat: data.lat as number, lng: data.lng as number });
        setLastLocationUpdate(Date.now());
        setEtaStale(false);
        break;
      }
      case 'chat_message': {
        const msg = {
          id: data.id as string,
          senderId: data.senderId as string,
          content: data.content as string,
          createdAt: data.createdAt as string,
          type: (data.type as string) || 'chat',
          quickKey: (data.quickKey as string) || null,
        };
        setChatMessages(prev => {
          // Skip if we already have this exact message
          if (prev.some(m => m.id === msg.id)) return prev;
          // Replace optimistic message from same sender with matching content
          const withoutOptimistic = prev.filter(m =>
            !(m.id.startsWith('opt_') && m.senderId === msg.senderId && m.content === msg.content)
          );
          return [...withoutOptimistic, msg];
        });
        if (msg.senderId !== userId && !chatOpenRef.current) {
          setChatUnread(prev => prev + 1);
        }
        break;
      }
      case 'cancel_request': {
        if (isDriver) {
          setCancelRequest({
            message: (data.message as string) || 'Rider wants to cancel',
            reason: (data.reason as string) || '',
          });
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        break;
      }
      case 'add_on_disputed': {
        if (isDriver) {
          showNotification('Rider is disputing an add-on', '\u26A0\uFE0F', COLORS.yellow, 'Review in your ride summary');
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          // Refresh add-ons
          fetch(`/api/rides/${rideId}/add-ons`).then(r => r.json()).then(d => {
            if (d.addOns) setRide(prev => ({ ...prev, addOns: d.addOns, addOnTotal: d.total }));
          }).catch(() => {});
        }
        break;
      }
      case 'add_on_removed': {
        // Refresh add-ons for both parties
        fetch(`/api/rides/${rideId}/add-ons`).then(r => r.json()).then(d => {
          if (d.addOns) setRide(prev => ({ ...prev, addOns: d.addOns, addOnTotal: d.total }));
        }).catch(() => {});
        if (!isDriver) {
          showNotification('Driver approved add-on removal', '\u2705', COLORS.green);
        }
        break;
      }
      case 'extend_wait_request': {
        // Rider is asking for more time — driver sees prompt
        if (isDriver) {
          showNotification('Rider needs more time', '⏱', COLORS.orange, 'Tap to extend wait');
          setExtensionPending(true);
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        }
        break;
      }
      case 'extend_wait_approved': {
        // Driver approved — extend the wait timer
        const extraMinutes = Number(data.extraMinutes || 3);
        setRide(prev => ({
          ...prev,
          waitMinutes: prev.waitMinutes + extraMinutes,
        }));
        setExtensionRequested(false);
        setExtensionPending(false);
        setExtensionsGranted(prev => prev + 1);
        if (!isDriver) {
          showNotification(`Driver gave you ${extraMinutes} more min`, '✅', COLORS.green);
        }
        break;
      }
      case 'extend_wait_denied': {
        setExtensionRequested(false);
        setExtensionPending(false);
        if (!isDriver) {
          showNotification('Driver can\'t wait longer — hurry!', '🏃', COLORS.red);
        }
        break;
      }
      case 'price_update_proposed': {
        if (!isDriver) {
          const proposed = Number(data.newPrice);
          setRide(prev => ({ ...prev, proposedPrice: proposed, proposedPriceReason: (data.reason as string) || null }));
          showNotification(`Driver updated price to $${proposed}`, '💰', COLORS.orange, 'Review the new price');
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        }
        break;
      }
      case 'price_update_accepted': {
        const accepted = Number(data.newPrice);
        setRide(prev => ({ ...prev, agreedPrice: accepted, proposedPrice: null, proposedPriceReason: null }));
        if (isDriver) {
          showNotification('Rider accepted the new price', '✅', COLORS.green);
        }
        break;
      }
      case 'price_update_declined': {
        setRide(prev => ({ ...prev, proposedPrice: null, proposedPriceReason: null }));
        if (isDriver) {
          showNotification('Rider declined — keeping original price', '❌', COLORS.red);
        }
        break;
      }
      case 'stops_updated': {
        const updatedStops = data.stops as unknown[];
        if (Array.isArray(updatedStops)) {
          setRide(prev => ({ ...prev, stops: updatedStops }));
          // Check if a stop was just reached
          const justReached = (updatedStops as { reached_at?: string; address?: string }[]).find(s => {
            const reachedAt = s.reached_at ? new Date(s.reached_at).getTime() : 0;
            return Date.now() - reachedAt < 30000; // within last 30s
          });
          if (justReached) {
            showNotification(`Stop reached: ${justReached.address || 'Stop'}`, '✅', COLORS.green);
          }
        }
        break;
      }
      case 'stop_requested': {
        if (isDriver) {
          setPendingStop({ address: data.address as string, latitude: data.latitude as number, longitude: data.longitude as number });
          showNotification('Rider wants to add a stop', '📍', COLORS.orange, data.address as string);
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        break;
      }
      case 'stop_accepted': {
        const stop = data.stop as Record<string, unknown>;
        setRide(prev => ({
          ...prev,
          stops: [...(Array.isArray(prev.stops) ? prev.stops : []), stop],
        }));
        setPendingStop(null);
        if (!isDriver) {
          showNotification('Driver accepted your stop', '✅', COLORS.green);
        }
        break;
      }
      case 'stop_declined': {
        setPendingStop(null);
        if (!isDriver) {
          showNotification('Driver declined the stop', '❌', COLORS.red, data.message as string);
        }
        break;
      }
      case 'confirm_start': {
        // Driver tapped Start Ride — rider needs to confirm
        const deadline = data.confirmDeadline as string;
        setRide(prev => ({
          ...prev,
          status: 'confirming',
          confirmDeadline: deadline,
        }));
        if (!isDriver) {
          showNotification('Confirm you\'re in the car', '🚗', COLORS.orange, '2 min to confirm');
          if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
        }
        break;
      }
      case 'add_on_pending': {
        // Rider requested an add-on — driver must confirm
        const addOn = data.addOn as { id: string; name: string; subtotal: number; quantity: number };
        const addOnTotal = Number(data.addOnTotal ?? 0);
        if (addOn) {
          setRide(prev => ({
            ...prev,
            addOns: [...prev.addOns.filter(a => a.id !== addOn.id), {
              id: addOn.id,
              name: addOn.name,
              unitPrice: Number(addOn.subtotal || 0) / (Number(addOn.quantity) || 1),
              quantity: Number(addOn.quantity) || 1,
              subtotal: Number(addOn.subtotal || 0),
              status: 'pending_driver',
              addedBy: 'rider',
            }],
            addOnTotal,
          }));
          if (isDriver) {
            showNotification(`Rider wants to add: ${addOn.name}`, '🛒', COLORS.orange, `$${Number(addOn.subtotal || 0).toFixed(2)} — scroll down to approve`);
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            // Auto-scroll to approval panel
            setTimeout(() => addOnPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
          }
        }
        break;
      }
      case 'add_on_confirmed':
      case 'add_on_rejected':
      case 'add_ons_confirmed_all': {
        // Driver confirmed or rejected — refresh to get accurate totals
        fetch(`/api/rides/${rideId}/add-ons`).then(r => r.json()).then(d => {
          if (d.addOns) setRide(prev => ({ ...prev, addOns: d.addOns, addOnTotal: Number(d.total ?? 0) }));
        }).catch(() => {});
        if (!isDriver) {
          if (msg.name === 'add_on_confirmed' || msg.name === 'add_ons_confirmed_all') {
            showNotification('Driver confirmed your add-on', '✅', COLORS.green);
          } else {
            showNotification('Driver declined your add-on request', '❌', COLORS.red);
          }
        }
        break;
      }
      case 'removal_requested': {
        // Rider wants to remove an add-on — driver must approve
        fetch(`/api/rides/${rideId}/add-ons`).then(r => r.json()).then(d => {
          if (d.addOns) setRide(prev => ({ ...prev, addOns: d.addOns, addOnTotal: Number(d.total ?? 0) }));
        }).catch(() => {});
        if (isDriver) {
          const aon = data.addOn as { name: string; subtotal: number } | undefined;
          showNotification(`Rider wants to remove: ${aon?.name || 'an add-on'}`, '🗑️', COLORS.orange, `−$${Number(aon?.subtotal || 0).toFixed(2)} — scroll down to approve`);
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          setTimeout(() => addOnPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
        }
        break;
      }
      case 'removal_rejected': {
        // Driver rejected the removal — item stays confirmed
        fetch(`/api/rides/${rideId}/add-ons`).then(r => r.json()).then(d => {
          if (d.addOns) setRide(prev => ({ ...prev, addOns: d.addOns, addOnTotal: Number(d.total ?? 0) }));
        }).catch(() => {});
        if (!isDriver) {
          showNotification('Driver declined your removal request', '⚠️', COLORS.yellow, 'You can dispute this charge');
        }
        break;
      }
      case 'location_request': {
        // Driver is asking rider for live GPS
        if (!isDriver) {
          setLocationRequestPending(true);
          showNotification('Driver needs your exact location', '📍', COLORS.orange, 'Tap to share your GPS');
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        break;
      }
      case 'location_shared': {
        // Rider shared their live GPS
        const lat = data.lat as number;
        const lng = data.lng as number;
        setRide(prev => ({ ...prev, riderLat: lat, riderLng: lng }));
        setLocationRequested(false);
        setLocationRequestPending(false);
        if (isDriver) {
          showNotification('Rider shared their location', '📍', COLORS.green, 'Pin dropped on map');
        }
        break;
      }
      case 'location_request_expired': {
        setLocationRequested(false);
        setLocationRequestPending(false);
        if (isDriver) {
          showNotification('Rider didn\'t share location', '📍', COLORS.gray);
        }
        break;
      }
      case 'address_update_proposed': {
        // Driver sees rider's proposed address change
        if (isDriver) {
          setPendingAddressUpdate({
            type: data.addressType as 'pickup' | 'dropoff',
            address: data.address as string,
            latitude: data.latitude as number,
            longitude: data.longitude as number,
            riderName: data.riderName as string,
          });
          showNotification(
            `Rider wants to update ${data.addressType as string}`,
            '📍',
            COLORS.orange,
            data.address as string,
          );
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        break;
      }
      case 'address_update_confirmed': {
        // Address change was approved by driver
        const addrType = data.addressType as string;
        const addr = data.address as string;
        const lat = data.latitude as number;
        const lng = data.longitude as number;
        if (addrType === 'pickup') {
          setRide(prev => ({ ...prev, pickupAddress: addr, pickupLat: lat, pickupLng: lng }));
        } else {
          setRide(prev => ({ ...prev, dropoffAddress: addr, dropoffLat: lat, dropoffLng: lng }));
        }
        setEditingAddress(null);
        setAddressUpdateSent(false);
        setPendingAddressUpdate(null);
        if (!isDriver) {
          showNotification(`Driver confirmed new ${addrType}`, '✅', COLORS.green, addr);
        }
        break;
      }
      case 'address_update_rejected': {
        setEditingAddress(null);
        setAddressUpdateSent(false);
        setPendingAddressUpdate(null);
        if (!isDriver) {
          showNotification('Driver kept the original address', '❌', COLORS.red);
        }
        break;
      }
      case 'safety_check_prompt': {
        // Server fires a prompt targeted at one party. Ignore prompts meant
        // for the other side; the overlay is only meaningful for the person
        // who is being asked.
        const targetParty = data.party as 'rider' | 'driver' | undefined;
        const myParty: 'rider' | 'driver' = isDriver ? 'driver' : 'rider';
        if (targetParty !== myParty) break;
        const checkId = data.checkId as string | undefined;
        if (!checkId) break;
        // Drop duplicate prompts for the same check (Ably rewind can replay).
        setPendingCheck((prev) => {
          if (prev && prev.checkId === checkId) return prev;
          return {
            checkId,
            party: myParty,
            autoDismissSeconds: (data.autoDismissSeconds as number | undefined) ?? 60,
          };
        });
        try { navigator.vibrate?.(60); } catch { /* ignore */ }
        break;
      }
      case 'safety_check_response': {
        // Counterparty acknowledged their own check. Not surfaced to the
        // other side today — kept here so admin-facing tooling can filter on
        // message name if needed.
        break;
      }
      default:
        break;
    }
  }, [isDriver]);

  const { connected: ablyConnected } = useAbly({
    channelName: `ride:${rideId}`,
    rideId,
    onMessage: handleAblyMessage,
  });

  // Update driver marker on GPS change
  useEffect(() => {
    if (isDriver && geo.lat && geo.lng) {
      setDriverLocation({ lat: geo.lat, lng: geo.lng });
    }
  }, [isDriver, geo.lat, geo.lng]);

  // Auto-detect stop proximity during active ride (driver only)
  const reachedStopsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!isDriver || !geo.lat || !geo.lng) return;
    if (!['active', 'otw', 'here'].includes(ride.status)) return;
    const stops = Array.isArray(ride.stops) ? ride.stops as Record<string, unknown>[] : [];
    if (stops.length === 0) return;

    for (const stop of stops) {
      const order = Number(stop.order);
      if (stop.verified || reachedStopsRef.current.has(order)) continue;

      const stopLat = Number(stop.latitude);
      const stopLng = Number(stop.longitude);
      if (!stopLat || !stopLng) continue;

      // Simple distance check in feet (Haversine)
      const R = 3958.8 * 5280; // earth radius in feet
      const dLat = (stopLat - geo.lat) * Math.PI / 180;
      const dLng = (stopLng - geo.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(geo.lat * Math.PI / 180) * Math.cos(stopLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      const distFeet = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      if (distFeet <= 300) {
        reachedStopsRef.current.add(order);
        fetch(`/api/rides/${rideId}/stop-reached`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stopOrder: order, driverLat: geo.lat, driverLng: geo.lng }),
        }).then(res => res.json()).then(data => {
          if (data.status === 'verified') {
            setRide(prev => {
              const updatedStops = Array.isArray(prev.stops) ? [...prev.stops] as Record<string, unknown>[] : [];
              const idx = updatedStops.findIndex(s => Number(s.order) === order);
              if (idx !== -1) updatedStops[idx] = { ...updatedStops[idx], verified: true, reached_at: new Date().toISOString() };
              return { ...prev, stops: updatedStops };
            });
          }
        }).catch(() => {});
      }
    }
  }, [isDriver, geo.lat, geo.lng, ride.status, ride.stops, rideId]);

  // ── Map initialization — wait for Mapbox GL to load ──
  useEffect(() => {
    if (!mapContainerRef.current || !mapboxToken || mapRef.current) return;

    function initMap() {
      if (typeof mapboxgl === 'undefined') return false;

      mapboxgl.accessToken = mapboxToken;

      // Center preference: live driver → pickup → dropoff → ATL fallback.
      // Using pickup/dropoff before the ATL fallback means multi-market rides
      // (e.g. NOLA) open centered on their actual coords even if GPS hasn't
      // streamed in yet. ATL rides still fall back identically when no coords.
      const center: [number, number] = driverLocation
        ? [driverLocation.lng, driverLocation.lat]
        : (ride.pickupLat && ride.pickupLng)
          ? [ride.pickupLng, ride.pickupLat]
          : (ride.dropoffLat && ride.dropoffLng)
            ? [ride.dropoffLng, ride.dropoffLat]
            : [-84.388, 33.749]; // Atlanta default — last-resort only

      const map = new mapboxgl.Map({
        container: mapContainerRef.current!,
        style: 'mapbox://styles/mapbox/dark-v11',
        center,
        zoom: 14,
        attributionControl: false,
      });

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

      // When map style reloads (tab resume, background restore), redraw everything
      map.on('style.load', () => {
        routeDrawnRef.current = false;
        // Re-add markers — remove existing and let the update effects re-create them
        if (driverMarkerRef.current) { driverMarkerRef.current.remove(); driverMarkerRef.current = null; }
        if (riderMarkerRef.current) { riderMarkerRef.current.remove(); riderMarkerRef.current = null; }
        if (pickupMarkerRef.current) { pickupMarkerRef.current.remove(); pickupMarkerRef.current = null; }
        if (dropoffMarkerRef.current) { dropoffMarkerRef.current.remove(); dropoffMarkerRef.current = null; }
      });

      mapRef.current = map;
      return true;
    }

    // Try immediately, then poll until loaded
    if (initMap()) return () => { mapRef.current?.remove(); mapRef.current = null; };

    const poll = setInterval(() => {
      if (initMap()) clearInterval(poll);
    }, 200);

    return () => {
      clearInterval(poll);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapboxToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update driver marker ──
  useEffect(() => {
    if (!mapRef.current || !driverLocation || typeof mapboxgl === 'undefined') return;

    if (!driverMarkerRef.current) {
      const el = document.createElement('div');
      el.style.width = '18px';
      el.style.height = '18px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = COLORS.green;
      el.style.border = '3px solid ' + COLORS.white;
      el.style.boxShadow = '0 0 12px ' + COLORS.green;

      driverMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([driverLocation.lng, driverLocation.lat])
        .addTo(mapRef.current);
    } else {
      driverMarkerRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
    }

    // Fly to driver location — with heading if enabled
    if (shouldTrackGps || !isDriver) {
      const isMovingPhase = ['otw', 'active'].includes(ride.status);
      const prev = prevDriverLocation.current;
      let bearing: number | undefined;

      if (isDriver && headingUp && isMovingPhase && prev && driverLocation) {
        // Calculate bearing from previous to current position
        const dLon = (driverLocation.lng - prev.lng) * Math.PI / 180;
        const lat1 = prev.lat * Math.PI / 180;
        const lat2 = driverLocation.lat * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      }

      mapRef.current.easeTo({
        center: [driverLocation.lng, driverLocation.lat],
        ...(bearing !== undefined ? { bearing, pitch: 50 } : {}),
        ...(!headingUp || !isMovingPhase ? { bearing: 0, pitch: 0 } : {}),
        duration: 1000,
      });
    }

    if (driverLocation) prevDriverLocation.current = { ...driverLocation };
  }, [driverLocation, shouldTrackGps, isDriver, headingUp, ride.status]);

  // ── Rider location marker (from COO or live updates) ──
  useEffect(() => {
    if (!mapRef.current || typeof mapboxgl === 'undefined') return;

    const lat = ride.riderLat;
    const lng = ride.riderLng;
    if (!lat || !lng) return;

    if (!riderMarkerRef.current) {
      const el = document.createElement('div');
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = COLORS.blue;
      el.style.border = '3px solid ' + COLORS.white;
      el.style.boxShadow = '0 0 10px ' + COLORS.blue;

      riderMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(mapRef.current);
    } else {
      riderMarkerRef.current.setLngLat([lng, lat]);
    }

    // Fit map to show both markers when both exist
    if (driverLocation && mapRef.current) {
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([lng, lat]);
      bounds.extend([driverLocation.lng, driverLocation.lat]);
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 1000 });
    }
  }, [ride.riderLat, ride.riderLng, driverLocation]);

  // ── Pickup + Dropoff markers (static — placed once) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof mapboxgl === 'undefined') return;

    if (ride.pickupLat && ride.pickupLng && !pickupMarkerRef.current) {
      const pEl = document.createElement('div');
      pEl.style.width = '14px';
      pEl.style.height = '14px';
      pEl.style.borderRadius = '50%';
      pEl.style.border = `3px solid ${COLORS.green}`;
      pEl.style.backgroundColor = 'transparent';
      pEl.style.boxShadow = `0 0 8px ${COLORS.green}`;
      pickupMarkerRef.current = new mapboxgl.Marker({ element: pEl })
        .setLngLat([ride.pickupLng, ride.pickupLat])
        .addTo(map);
    }

    if (ride.dropoffLat && ride.dropoffLng && !dropoffMarkerRef.current) {
      const dEl = document.createElement('div');
      dEl.style.width = '14px';
      dEl.style.height = '14px';
      dEl.style.borderRadius = '3px';
      dEl.style.backgroundColor = COLORS.green;
      dEl.style.border = `2px solid ${COLORS.white}`;
      dEl.style.boxShadow = `0 0 8px ${COLORS.green}`;
      dropoffMarkerRef.current = new mapboxgl.Marker({ element: dEl })
        .setLngLat([ride.dropoffLng, ride.dropoffLat])
        .addTo(map);
    }
  }, [ride.pickupLat, ride.pickupLng, ride.dropoffLat, ride.dropoffLng]);

  // ── Live route line from driver's current location to destination ──
  // Redraws on every GPS update so the route always reflects current position.
  // OTW/HERE: driver → pickup (via stops if any)
  // ACTIVE: driver → next unreached stop → dropoff
  const routeFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRouteFetch = useRef(0);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof mapboxgl === 'undefined') return;
    if (!driverLocation) return;
    if (!['otw', 'here', 'confirming', 'active'].includes(ride.status)) return;

    // Throttle route fetches to max once per 15 seconds
    const now = Date.now();
    if (now - lastRouteFetch.current < 15_000) {
      // Schedule a deferred update if one isn't already pending
      if (!routeFetchTimer.current) {
        routeFetchTimer.current = setTimeout(() => {
          routeFetchTimer.current = null;
          // Re-trigger by updating a harmless ref — the effect will re-run
          lastRouteFetch.current = 0;
          setLastLocationUpdate(Date.now());
        }, 15_000 - (now - lastRouteFetch.current));
      }
      return;
    }
    lastRouteFetch.current = now;

    // ── Build route based on role + ride phase ──
    // Driver: always from their location to the next destination
    // Rider OTW/HERE: driver → rider (green) + rider trip preview pickup → stops → dropoff (blue)
    // Rider ACTIVE: driver (=rider) → stops → dropoff (green, same car)
    // Active ride: both see driver → unreached stops → dropoff

    let destLat: number | null | undefined;
    let destLng: number | null | undefined;
    const waypoints: string[] = [];

    if (ride.status === 'active') {
      destLat = ride.dropoffLat;
      destLng = ride.dropoffLng;
      if (Array.isArray(ride.stops)) {
        for (const s of ride.stops as Array<Record<string, unknown>>) {
          if (s.longitude && s.latitude && !s.reached) {
            waypoints.push(`${s.longitude},${s.latitude}`);
          }
        }
      }
    } else if (isDriver) {
      // Driver OTW/HERE: driver → pickup
      destLat = ride.pickupLat || ride.riderLat;
      destLng = ride.pickupLng || ride.riderLng;
    } else {
      // Rider OTW/HERE: show driver → rider (where is my driver?)
      destLat = ride.riderLat || ride.pickupLat;
      destLng = ride.riderLng || ride.pickupLng;
    }

    if (!destLat || !destLng) return;

    // Build coordinates string: driver → waypoints → destination
    let coords = `${driverLocation.lng},${driverLocation.lat}`;
    for (const wp of waypoints) {
      coords += `;${wp}`;
    }
    coords += `;${destLng},${destLat}`;

    // ── Rider trip preview line (OTW/HERE only): pickup → stops → dropoff ──
    // Shows rider their full upcoming route in blue while waiting for driver
    if (!isDriver && ['otw', 'here', 'confirming'].includes(ride.status) && ride.pickupLat && ride.pickupLng && ride.dropoffLat && ride.dropoffLng) {
      let tripCoords = `${ride.pickupLng},${ride.pickupLat}`;
      if (Array.isArray(ride.stops)) {
        for (const s of ride.stops as Array<Record<string, unknown>>) {
          if (s.longitude && s.latitude) tripCoords += `;${s.longitude},${s.latitude}`;
        }
      }
      tripCoords += `;${ride.dropoffLng},${ride.dropoffLat}`;

      const tripUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${tripCoords}?access_token=${mapboxToken}&overview=full&geometries=geojson`;
      fetch(tripUrl)
        .then(r => r.json())
        .then(tripData => {
          if (!tripData.routes?.[0]?.geometry || !mapRef.current) return;
          const m = mapRef.current;
          const tripGeojson = { type: 'Feature' as const, properties: {}, geometry: tripData.routes[0].geometry };
          const applyTrip = () => {
            if (!m) return;
            const existing = m.getSource('trip-preview') as { setData?: (d: unknown) => void } | undefined;
            if (existing?.setData) {
              existing.setData(tripGeojson);
            } else {
              m.addSource('trip-preview', { type: 'geojson', data: tripGeojson });
              m.addLayer({
                id: 'trip-preview-glow', type: 'line', source: 'trip-preview',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#448AFF', 'line-width': 6, 'line-opacity': 0.15 },
              });
              m.addLayer({
                id: 'trip-preview-line', type: 'line', source: 'trip-preview',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#448AFF', 'line-width': 2.5, 'line-opacity': 0.6, 'line-dasharray': [4, 3] },
              });
            }
          };
          if (m.isStyleLoaded()) applyTrip();
          else m.on('style.load', applyTrip);
        })
        .catch(() => {});
    }

    // Remove trip preview when ride becomes active (rider is in the car)
    if (ride.status === 'active' && mapRef.current) {
      const m = mapRef.current;
      try {
        if (m.getLayer('trip-preview-line')) m.removeLayer('trip-preview-line');
        if (m.getLayer('trip-preview-glow')) m.removeLayer('trip-preview-glow');
        if (m.getSource('trip-preview')) m.removeSource('trip-preview');
      } catch { /* already removed */ }
    }

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${mapboxToken}&overview=full&geometries=geojson`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!data.routes?.[0]?.geometry || !mapRef.current) return;
        const m = mapRef.current;

        const geojson = {
          type: 'Feature' as const,
          properties: {},
          geometry: data.routes[0].geometry,
        };

        const applyRoute = () => {
          if (!m) return;

          // Update existing source or create new one
          const existingGlow = m.getSource('route-glow') as { setData?: (d: unknown) => void } | undefined;
          const existingRoute = m.getSource('route') as { setData?: (d: unknown) => void } | undefined;

          if (existingGlow?.setData) {
            existingGlow.setData(geojson);
          } else {
            m.addSource('route-glow', { type: 'geojson', data: geojson });
            m.addLayer({
              id: 'route-glow',
              type: 'line',
              source: 'route-glow',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: { 'line-color': COLORS.green, 'line-width': 8, 'line-opacity': 0.2 },
            });
          }

          if (existingRoute?.setData) {
            existingRoute.setData(geojson);
          } else {
            m.addSource('route', { type: 'geojson', data: geojson });
            m.addLayer({
              id: 'route-line',
              type: 'line',
              source: 'route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: { 'line-color': COLORS.green, 'line-width': 3, 'line-opacity': 0.85 },
            });
          }

          // Fit bounds on first draw only (don't keep jerking the view)
          if (!routeDrawnRef.current) {
            const routeBounds = new mapboxgl.LngLatBounds();
            routeBounds.extend([driverLocation.lng, driverLocation.lat]);
            routeBounds.extend([destLng!, destLat!]);
            for (const coord of data.routes[0].geometry.coordinates) {
              routeBounds.extend(coord);
            }
            m.fitBounds(routeBounds, { padding: 60, maxZoom: 15, duration: 1000 });
          }

          routeDrawnRef.current = true;
        };

        if (m.isStyleLoaded()) applyRoute();
        else m.on('style.load', applyRoute);
      })
      .catch(() => {
        // Directions API failed — draw straight line from driver to destination
        const m = mapRef.current;
        if (!m) return;

        const straightLine = {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'LineString' as const,
            coordinates: [[driverLocation.lng, driverLocation.lat], [destLng!, destLat!]],
          },
        };

        const applyFallback = () => {
          if (!m) return;
          const existing = m.getSource('route') as { setData?: (d: unknown) => void } | undefined;
          if (existing?.setData) {
            existing.setData(straightLine);
          } else {
            m.addSource('route', { type: 'geojson', data: straightLine });
            m.addLayer({
              id: 'route-line',
              type: 'line',
              source: 'route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: { 'line-color': COLORS.green, 'line-width': 2, 'line-opacity': 0.5, 'line-dasharray': [2, 4] },
            });
          }
          routeDrawnRef.current = true;
        };

        if (m.isStyleLoaded()) applyFallback();
        else m.on('style.load', applyFallback);
      });

    return () => {
      if (routeFetchTimer.current) {
        clearTimeout(routeFetchTimer.current);
        routeFetchTimer.current = null;
      }
    };
  }, [driverLocation, ride.status, ride.pickupLat, ride.pickupLng, ride.dropoffLat, ride.dropoffLng, ride.riderLat, ride.riderLng, ride.stops, mapboxToken]);

  // ── Dispute window countdown ──
  useEffect(() => {
    if (ride.status !== 'ended' || !ride.disputeWindowExpiresAt) return;

    const updateCountdown = () => {
      const remaining = new Date(ride.disputeWindowExpiresAt!).getTime() - Date.now();
      setDisputeWindowRemaining(Math.max(0, remaining));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [ride.status, ride.disputeWindowExpiresAt]);

  // ── Wait countdown at HERE ──
  // Pauses when driver ETA is stale — rider shouldn't be penalized for a driver who went offline
  const stalePauseRef = useRef(0); // accumulated pause time in ms
  const lastStaleCheck = useRef(false);
  useEffect(() => {
    if (ride.status !== 'here' || !ride.hereAt) { setWaitCountdown(null); stalePauseRef.current = 0; return; }
    const waitMs = (ride.waitMinutes || 5) * 60 * 1000;
    const updateCountdown = () => {
      // Track cumulative stale pause time
      if (etaStale && !lastStaleCheck.current) {
        // Just went stale — start tracking
        lastStaleCheck.current = true;
      } else if (!etaStale && lastStaleCheck.current) {
        // Came back — stop tracking
        lastStaleCheck.current = false;
      }
      if (etaStale) {
        stalePauseRef.current += 1000; // accumulate 1s per tick while stale
      }

      const elapsed = Date.now() - new Date(ride.hereAt!).getTime() - stalePauseRef.current;
      const remaining = Math.max(0, waitMs - elapsed);
      setWaitCountdown(remaining);
      if (remaining <= 0 && !etaStale) setShowPulloff(true); // Don't show pulloff while stale
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [ride.status, ride.hereAt, ride.waitMinutes, etaStale]);

  // ── Confirm countdown (rider has 2 min to confirm they're in the car) ──
  useEffect(() => {
    if (ride.status !== 'confirming' || !ride.confirmDeadline) {
      setConfirmCountdown(null);
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.max(0, new Date(ride.confirmDeadline!).getTime() - Date.now());
      setConfirmCountdown(remaining);

      // Auto-confirm when timer expires (rider side only)
      if (remaining <= 0 && !isDriver && !autoConfirmFired.current) {
        autoConfirmFired.current = true;
        // Auto-confirm with GPS if available
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              fetch(`/api/rides/${rideId}/confirm-start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, autoConfirmed: true }),
              }).then(r => r.json()).then(data => {
                if (data.status) setRide(prev => ({ ...prev, status: data.status }));
              }).catch(() => {});
            },
            () => {
              fetch(`/api/rides/${rideId}/confirm-start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ autoConfirmed: true }),
              }).then(r => r.json()).then(data => {
                if (data.status) setRide(prev => ({ ...prev, status: data.status }));
              }).catch(() => {});
            },
            { enableHighAccuracy: true, timeout: 3000 }
          );
        } else {
          fetch(`/api/rides/${rideId}/confirm-start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autoConfirmed: true }),
          }).then(r => r.json()).then(data => {
            if (data.status) setRide(prev => ({ ...prev, status: data.status }));
          }).catch(() => {});
        }
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [ride.status, ride.confirmDeadline, isDriver, rideId]);

  // ── Stale ETA detection (90s) + SMS nudge to driver ──
  useEffect(() => {
    // Only track staleness during pickup phases, from rider's perspective
    if (isDriver || !['otw', 'here', 'confirming'].includes(ride.status)) {
      setEtaStale(false);
      return;
    }

    const STALE_THRESHOLD = 90_000; // 90 seconds
    const SMS_NUDGE_THRESHOLD = 90_000; // send SMS at 90s

    const check = () => {
      const elapsed = Date.now() - lastLocationUpdate;
      const isStale = elapsed >= STALE_THRESHOLD;
      setEtaStale(isStale);

      // Send SMS nudge to driver once after threshold
      if (isStale && !smsNudgeSent.current && elapsed >= SMS_NUDGE_THRESHOLD) {
        smsNudgeSent.current = true;
        fetch(`/api/rides/${rideId}/eta-nudge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => {});
      }
    };

    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [isDriver, ride.status, lastLocationUpdate, rideId]);

  // Reset SMS nudge flag and stale timer when ride status changes
  useEffect(() => {
    smsNudgeSent.current = false;
    setLastLocationUpdate(Date.now());
    setEtaStale(false);
  }, [ride.status]);

  // ── ETA calculation — Mapbox Directions API with Haversine fallback ──
  const lastDirectionsFetch = useRef(0);
  const directionsEta = useRef<{ minutes: number; miles: number } | null>(null);
  useEffect(() => {
    if (!driverLocation || !['otw', 'here', 'confirming', 'active'].includes(ride.status)) {
      setEta(null);
      return;
    }

    let targetLat: number | null | undefined;
    let targetLng: number | null | undefined;

    if (ride.status === 'active') {
      targetLat = ride.dropoffLat;
      targetLng = ride.dropoffLng;
    } else {
      targetLat = ride.pickupLat || ride.riderLat;
      targetLng = ride.pickupLng || ride.riderLng;
    }

    if (!targetLat || !targetLng) { setEta(null); return; }

    // Immediate Haversine fallback
    const miles = haversineDistance(driverLocation.lat, driverLocation.lng, targetLat, targetLng);
    const haversineMinutes = Math.max(1, Math.round((miles / 25) * 60));

    // Use cached directions ETA if fresh, otherwise show Haversine
    if (directionsEta.current && Date.now() - lastDirectionsFetch.current < 35000) {
      setEta(directionsEta.current);
    } else {
      setEta({ minutes: haversineMinutes, miles });
    }

    // Fetch Mapbox Directions every 30s for road-based ETA
    const now = Date.now();
    if (now - lastDirectionsFetch.current < 30000) return;
    lastDirectionsFetch.current = now;

    const token = mapboxToken;
    if (!token) return;

    const coords = `${driverLocation.lng},${driverLocation.lat};${targetLng},${targetLat}`;
    fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${token}&overview=false`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const route = data?.routes?.[0];
        if (route) {
          const dirMiles = route.distance * 0.000621371; // meters to miles
          const dirMinutes = Math.max(1, Math.round(route.duration / 60));
          directionsEta.current = { minutes: dirMinutes, miles: dirMiles };
          setEta({ minutes: dirMinutes, miles: dirMiles });
        }
      })
      .catch(() => {}); // silent — Haversine remains as fallback
  }, [driverLocation, ride.status, ride.riderLat, ride.riderLng, ride.pickupLat, ride.pickupLng, ride.dropoffLat, ride.dropoffLng, mapboxToken]);

  // ── Load chat history on status change (Ably handles real-time messages) ──
  useEffect(() => {
    if (!['otw', 'here', 'confirming', 'active', 'ended'].includes(ride.status)) return;

    fetch(`/api/rides/${rideId}/messages`)
      .then(r => r.json())
      .then(data => {
        if (data.messages) {
          setChatMessages(prev => {
            const serverIds = new Set((data.messages as Array<{ id: string }>).map((m: { id: string }) => m.id));
            const optimistic = prev.filter(m => m.id.startsWith('opt_') && !serverIds.has(m.id));
            return [...data.messages, ...optimistic];
          });
        }
      })
      .catch(() => {});
  }, [ride.status, rideId]);

  // ── Load add-ons for this ride ──
  const refreshAddOns = useCallback(() => {
    if (['otw', 'here', 'confirming', 'active', 'ended', 'completed'].includes(ride.status)) {
      fetch(`/api/rides/${rideId}/add-ons`)
        .then(r => { if (r.ok) return r.json(); return null; })
        .then(data => {
          if (data && data.addOns) {
            // Use server-calculated total — it correctly handles all statuses
            setRide(prev => ({ ...prev, addOns: data.addOns, addOnTotal: Number(data.total ?? 0) }));
          }
        })
        .catch(() => {});
    }
  }, [ride.status, rideId]);

  useEffect(() => { refreshAddOns(); }, [refreshAddOns]);

  // Refresh add-ons + map when page becomes visible (catches missed Ably events + map blank)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshAddOns();
        // Trigger map resize to fix blank canvas after tab resume
        if (mapRef.current) {
          (mapRef.current as { resize(): void }).resize();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refreshAddOns]);

  // ── Sync chatOpen ref ──
  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) setChatUnread(0);
  }, [chatOpen]);

  // ── Auto-redirect on cancel ──
  useEffect(() => {
    if (ride.status !== 'cancelled') return;
    const t = setTimeout(() => {
      window.location.replace(isDriver ? '/driver/home' : '/rider/home');
    }, 2500);
    return () => clearTimeout(t);
  }, [ride.status, isDriver]);

  // ── Notification auto-dismiss ──
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(t);
  }, [notification]);

  function showNotification(msg: string, emoji?: string, color?: string, sub?: string) {
    if (msg) setNotification({ message: msg, emoji: emoji || '', color: color || COLORS.green, sub });
  }

  function showStatusNotification(status: string) {
    const notif = getStatusNotificationData(status, isDriver);
    if (notif) setNotification(notif);
    // Vibrate if supported
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  }

  // ── API actions ──
  async function callAction(endpoint: string, method = 'POST') {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rides/${rideId}/${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).error || 'Something went wrong');
      }
      const data = await res.json();
      // Update local state from response
      if (data.status) {
        setRide(prev => ({ ...prev, status: data.status }));
      }
      if (data.driver_payout_amount !== undefined) {
        setRide(prev => ({
          ...prev,
          driverPayoutAmount: Number(data.driver_payout_amount),
          platformFeeAmount: Number(data.platform_fee_amount || prev.platformFeeAmount),
        }));
      }
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRate(ratingType: RatingType) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rides/${rideId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating_type: ratingType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).error || 'Failed to submit rating');
      }
      setRated(true);
      setRide(prev => ({ ...prev, status: 'completed' }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to rate';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDispute() {
    await callAction('dispute');
  }

  // ── Derived values ──
  const statusDisplay = getStatusDisplay(ride.status, isDriver);
  const otherName = isDriver ? ride.riderName : ride.driverName;
  const disputeMinutes = disputeWindowRemaining !== null
    ? Math.ceil(disputeWindowRemaining / 60000)
    : null;

  const pickupAddress = ride.pickup
    ? ((ride.pickup as Record<string, unknown>).address as string) ||
      ((ride.pickup as Record<string, unknown>).name as string) ||
      'Pickup location'
    : null;

  const dropoffAddress = ride.dropoff
    ? ((ride.dropoff as Record<string, unknown>).address as string) ||
      ((ride.dropoff as Record<string, unknown>).name as string) ||
      'Dropoff location'
    : null;

  const stopCount = ride.stops ? ride.stops.length : 0;

  // Dynamic map height — map is secondary pre-OTW, primary during OTW/active
  const mapPercent = (() => {
    switch (ride.status) {
      case 'matched':
        return ride.cooAt ? 30 : 28;
      case 'otw':
        return 55;
      case 'here':
        return 35;
      case 'confirming':
        return 22;
      case 'active':
        return 55;
      case 'ended':
      case 'completed':
      case 'disputed':
      case 'cancelled':
        return 0;
      default:
        return 40;
    }
  })();

  // ── Render ──
  const safetyUiActive = ['otw', 'here', 'confirming', 'active'].includes(ride.status);

  return (
    <div style={{
      position: 'fixed',
      top: 56,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: COLORS.black,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: FONTS.body,
      color: COLORS.white,
    }}>
      {/* Always-available distress pill — top-left, outside status bar area.
          Non-modal until tapped. Uses fixed position so it persists as child
          components scroll. */}
      {safetyUiActive && (
        <div style={{
          position: 'absolute',
          top: 'max(16px, env(safe-area-inset-top))',
          left: 12,
          zIndex: 45,
        }}>
          <SafetyTile rideId={rideId} />
        </div>
      )}

      {/* Scheduled check-in prompt — modal. Mounts only when server-pushed. */}
      {pendingCheck && safetyUiActive && (
        <SafetyCheckOverlay
          rideId={rideId}
          checkId={pendingCheck.checkId}
          autoDismissSeconds={pendingCheck.autoDismissSeconds}
          onResolved={() => setPendingCheck(null)}
        />
      )}

      {/* Animated notification toast */}
      <style>{`
        @keyframes notifSlideIn {
          0% { transform: translateY(-100%); opacity: 0; }
          60% { transform: translateY(6px); }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes notifPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes notifShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
      {notification && (
        <div style={{
          position: 'absolute',
          top: 'max(16px, env(safe-area-inset-top))',
          left: 12,
          right: 12,
          zIndex: 50,
          animation: 'notifSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        }}>
          <div style={{
            backgroundColor: COLORS.card,
            border: `1.5px solid ${notification.color}40`,
            borderRadius: 16,
            padding: '14px 16px',
            fontFamily: FONTS.body,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: `0 8px 32px ${notification.color}20, 0 2px 8px rgba(0,0,0,0.5)`,
            background: `linear-gradient(135deg, ${COLORS.card}, ${notification.color}08)`,
          }}>
            {/* Animated emoji */}
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: `${notification.color}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              flexShrink: 0,
              animation: 'notifPulse 0.6s ease-out',
            }}>
              {notification.emoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15,
                fontWeight: 700,
                color: COLORS.white,
                lineHeight: 1.2,
              }}>
                {notification.message}
              </div>
              {notification.sub && (
                <div style={{
                  fontSize: 12,
                  color: COLORS.grayLight,
                  marginTop: 2,
                  lineHeight: 1.3,
                }}>
                  {notification.sub}
                </div>
              )}
            </div>
            {/* Accent dot */}
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: notification.color,
              boxShadow: `0 0 8px ${notification.color}`,
              flexShrink: 0,
            }} />
          </div>
        </div>
      )}

      {/* Map section — dynamic height based on ride phase */}
      {mapPercent > 0 && (
      <div style={{ flex: `0 0 ${mapPercent}%`, position: 'relative', transition: 'flex-basis 0.3s ease' }}>
        <div
          ref={mapContainerRef}
          id="ride-map"
          style={{ width: '100%', height: '100%' }}
        />

        {/* GPS error overlay — shows settings instructions for denied, retry for other errors */}
        {shouldTrackGps && geo.error && (
          <div style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            backgroundColor: 'rgba(255, 82, 82, 0.95)',
            borderRadius: 14,
            padding: '14px',
            fontFamily: FONTS.body,
            color: COLORS.white,
          }}>
            {geo.error.toLowerCase().includes('denied') ? (
              <GeoBlockedHelp onRetry={() => geo.retry()} />
            ) : (
              <button
                type="button"
                onClick={() => geo.retry()}
                style={{
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  color: COLORS.white, fontSize: 13, fontFamily: FONTS.body,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <span style={{ fontSize: 16 }}>{'\uD83D\uDCCD'}</span>
                <span>GPS: {geo.error}</span>
                <span style={{
                  background: 'rgba(255,255,255,0.2)', borderRadius: 100,
                  padding: '2px 10px', fontSize: 11, fontWeight: 700,
                }}>TAP TO RELOAD</span>
              </button>
            )}
          </div>
        )}

        {/* Connection status */}
        {!isDriver && ride.status === 'otw' && !driverLocation && (
          <div style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            backgroundColor: 'rgba(136, 136, 136, 0.9)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: FONTS.body,
            color: COLORS.white,
            textAlign: 'center',
          }}>
            Waiting for driver location...
          </div>
        )}

        {/* Compass toggle — driver only during moving phases */}
        {isDriver && ['otw', 'active'].includes(ride.status) && (
          <button
            type="button"
            onClick={() => {
              setHeadingUp(prev => {
                if (prev && mapRef.current) {
                  // Reset to north-up
                  mapRef.current.easeTo({ bearing: 0, pitch: 0, duration: 500 });
                }
                return !prev;
              });
            }}
            style={{
              position: 'absolute', top: 8, left: 8,
              width: 36, height: 36, borderRadius: '50%',
              background: headingUp ? 'rgba(0,230,118,0.15)' : 'rgba(0,0,0,0.6)',
              border: headingUp ? '1px solid rgba(0,230,118,0.4)' : '1px solid rgba(255,255,255,0.15)',
              color: headingUp ? COLORS.green : COLORS.gray,
              fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)',
              zIndex: 5,
            }}
            title={headingUp ? 'Heading up — tap for north up' : 'North up — tap for heading up'}
          >
            🧭
          </button>
        )}
      </div>
      )}

      {/* Status + Actions section — dynamic height, scrollable content with pinned buttons */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: COLORS.black,
      }}>
        {/* Scrollable inner — status header + info + actions all scroll together */}
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px 20px',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          WebkitOverflowScrolling: 'touch',
        }}>
        {/* Status header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div>
            <div style={{
              fontFamily: FONTS.display,
              fontSize: 32,
              letterSpacing: 2,
              color: statusDisplay.color,
              lineHeight: 1,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {statusDisplay.label}
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: ablyConnected ? COLORS.green : COLORS.red,
                flexShrink: 0, marginTop: 2,
              }} title={ablyConnected ? 'Live' : 'Reconnecting...'} />
            </div>
            <div
              onClick={() => {
                if (isDriver && ride.riderHandle) setViewingRiderProfile(true);
                if (!isDriver && ride.driverHandle) setViewingDriverProfile(true);
              }}
              style={{
                fontSize: 14,
                color: COLORS.grayLight,
                marginTop: 2,
                cursor: (isDriver && ride.riderHandle) || (!isDriver && ride.driverHandle) ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {isDriver && ride.riderAvatarUrl && (
                <img src={ride.riderAvatarUrl} alt="" style={{
                  width: 20, height: 20, borderRadius: '50%', objectFit: 'cover',
                }} />
              )}
              {!isDriver && ride.driverAvatarUrl && (
                <img src={ride.driverAvatarUrl} alt="" style={{
                  width: 20, height: 20, borderRadius: '50%', objectFit: 'cover',
                }} />
              )}
              {isDriver ? `Rider: ${otherName}` : `Driver: ${otherName}`}
              {((isDriver && ride.riderHandle) || (!isDriver && ride.driverHandle)) && (
                <span style={{ fontSize: 11, color: COLORS.green }}>view</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {ride.refCode && (
              <div style={{ fontSize: 10, color: COLORS.green, fontFamily: FONTS.mono, letterSpacing: 1, lineHeight: 1, marginBottom: 2 }}>
                {ride.refCode}
              </div>
            )}
            {Number(ride.addOnTotal || 0) > 0 && (
              <div style={{ fontSize: 11, color: COLORS.gray, fontFamily: FONTS.mono, lineHeight: 1 }}>
                ${Number(ride.agreedPrice || 0).toFixed(2)} + ${Number(ride.addOnTotal || 0).toFixed(2)}
              </div>
            )}
            <div style={{
              fontFamily: FONTS.mono,
              fontSize: 28,
              fontWeight: 700,
              color: COLORS.green,
              lineHeight: 1,
            }}>
              ${(Number(ride.agreedPrice || 0) + Number(ride.addOnTotal || 0)).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Itinerary — pickup → stops → dropoff + navigate button */}
        {(pickupAddress || dropoffAddress || ride.pickupAddress || ride.dropoffAddress) && (() => {
          const pAddr = pickupAddress || ride.pickupAddress;
          const dAddr = dropoffAddress || ride.dropoffAddress;
          const stops = (ride.stops || []) as { address?: string; name?: string; latitude?: number; longitude?: number; reached_at?: string }[];
          const unreachedStops = stops.filter(s => !s.reached_at);
          const canEdit = !isDriver && ride.status === 'matched' && !!ride.cooAt;

          // Pick the single "next point" the driver should be routed to, based
          // on ride status. This prevents Google Maps from routing the driver
          // through previously-reached points (e.g. back to pickup after
          // they've already picked the rider up).
          //   otw           → pickup
          //   here/confirming/active, stops remain → first unreached stop
          //   here/confirming/active, no stops     → dropoff
          //   matched / other → full-trip preview (driver hasn't started)
          function pickNextWaypoint(): { label: string; coords?: string; address?: string } | null {
            const status = ride.status as string;
            if (status === 'otw') {
              if (ride.pickupLat && ride.pickupLng) return { label: 'Pickup', coords: `${ride.pickupLat},${ride.pickupLng}` };
              if (pAddr) return { label: 'Pickup', address: pAddr };
              return null;
            }
            if (status === 'here' || status === 'confirming' || status === 'active') {
              const nextStop = unreachedStops[0];
              if (nextStop) {
                if (nextStop.latitude && nextStop.longitude) return { label: 'Next Stop', coords: `${nextStop.latitude},${nextStop.longitude}` };
                if (nextStop.address || nextStop.name) return { label: 'Next Stop', address: (nextStop.address || nextStop.name) as string };
              }
              if (ride.dropoffLat && ride.dropoffLng) return { label: 'Dropoff', coords: `${ride.dropoffLat},${ride.dropoffLng}` };
              if (dAddr) return { label: 'Dropoff', address: dAddr };
              return null;
            }
            return null;
          }

          function buildNavUrl(): string | null {
            let origin = '';
            if (geo.lat && geo.lng) origin = `${geo.lat},${geo.lng}`;

            const next = pickNextWaypoint();
            if (next) {
              const dest = next.coords || (next.address ? encodeURIComponent(next.address) : '');
              if (!dest) return null;
              const base = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
              return origin ? `${base}&origin=${origin}` : base;
            }

            // Fallback: ride hasn't started yet — show full-trip preview.
            if (!origin && ride.pickupLat && ride.pickupLng) origin = `${ride.pickupLat},${ride.pickupLng}`;
            else if (!origin && pAddr) origin = encodeURIComponent(pAddr);

            const wpParts: string[] = [];
            if (geo.lat && geo.lng) {
              if (ride.pickupLat && ride.pickupLng) wpParts.push(`${ride.pickupLat},${ride.pickupLng}`);
              else if (pAddr) wpParts.push(encodeURIComponent(pAddr));
            }
            for (const s of unreachedStops) {
              if (s.latitude && s.longitude) wpParts.push(`${s.latitude},${s.longitude}`);
              else if (s.address || s.name) wpParts.push(encodeURIComponent(s.address || s.name || ''));
            }

            let dest = '';
            if (ride.dropoffLat && ride.dropoffLng) dest = `${ride.dropoffLat},${ride.dropoffLng}`;
            else if (dAddr) dest = encodeURIComponent(dAddr);

            if (!origin || !dest) return null;

            let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
            if (wpParts.length > 0) url += `&waypoints=${wpParts.join('|')}`;
            return url;
          }

          const nextWaypoint = pickNextWaypoint();
          const navUrl = buildNavUrl();
          const navLabel = nextWaypoint ? `Navigate to ${nextWaypoint.label}` : 'Navigate Trip';

          return (
            <div style={{
              backgroundColor: COLORS.card,
              borderRadius: 12,
              padding: '10px 14px',
              marginBottom: 8,
              fontSize: 13,
              color: COLORS.grayLight,
            }}>
              {/* Pickup row */}
              {pAddr && (
                editingAddress === 'pickup' ? (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.green, marginBottom: 6 }}>UPDATE PICKUP</div>
                    <AddressAutocomplete
                      label=""
                      placeholder="Search new pickup address..."
                      onSelect={async (addr) => {
                        setAddressUpdateSent(true);
                        try {
                          await fetch(`/api/rides/${rideId}/update-address`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ addressType: 'pickup', address: addr.address || addr.name, latitude: addr.latitude, longitude: addr.longitude }),
                          });
                        } catch { setError('Failed to send address update'); setAddressUpdateSent(false); }
                      }}
                      onClear={() => setEditingAddress(null)}
                    />
                    {addressUpdateSent && (
                      <div style={{ fontSize: 11, color: COLORS.orange, marginTop: 6, textAlign: 'center' }}>Waiting for driver to confirm...</div>
                    )}
                    <button onClick={() => { setEditingAddress(null); setAddressUpdateSent(false); }}
                      style={{ marginTop: 6, width: '100%', padding: 6, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: COLORS.gray, fontSize: 12, cursor: 'pointer', fontFamily: FONTS.body }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: stops.length > 0 || dAddr ? 6 : 0 }}>
                    <span style={{ color: COLORS.green, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 2, width: 36 }}>PICKUP</span>
                    <span style={{ flex: 1, fontSize: 12, lineHeight: 1.3 }}>{pAddr}</span>
                    {canEdit && (
                      <button onClick={() => setEditingAddress('pickup')}
                        style={{ background: 'none', border: 'none', color: COLORS.orange, fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, padding: '0 2px', fontFamily: FONTS.body }}>
                        Edit
                      </button>
                    )}
                  </div>
                )
              )}

              {/* Stops — collapsible when more than 1 */}
              {stops.length > 0 && (
                stops.length === 1 ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <span style={{ color: stops[0].reached_at ? COLORS.gray : COLORS.orange, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 2, width: 36 }}>
                      {stops[0].reached_at ? '✓' : 'STOP'}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, lineHeight: 1.3, color: stops[0].reached_at ? COLORS.gray : COLORS.grayLight, textDecoration: stops[0].reached_at ? 'line-through' : 'none' }}>
                      {stops[0].address || stops[0].name || 'Stop 1'}
                    </span>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setStopsExpanded(prev => !prev)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%',
                      }}
                    >
                      <span style={{ color: COLORS.orange, fontSize: 10, fontWeight: 700, flexShrink: 0, width: 36 }}>
                        STOPS
                      </span>
                      <span style={{ fontSize: 12, color: COLORS.grayLight }}>
                        {unreachedStops.length} of {stops.length} remaining
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 9, color: COLORS.gray }}>
                        {stopsExpanded ? '▲' : '▼'}
                      </span>
                    </button>
                    {stopsExpanded && stops.map((stop, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4, paddingLeft: 4 }}>
                        <span style={{ color: stop.reached_at ? COLORS.gray : COLORS.orange, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 2, width: 32, textAlign: 'right' }}>
                          {stop.reached_at ? '✓' : `${i + 1}`}
                        </span>
                        <span style={{ fontSize: 12, lineHeight: 1.3, color: stop.reached_at ? COLORS.gray : COLORS.grayLight, textDecoration: stop.reached_at ? 'line-through' : 'none' }}>
                          {stop.address || stop.name || `Stop ${i + 1}`}
                        </span>
                      </div>
                    ))}
                  </>
                )
              )}

              {/* Dropoff row */}
              {dAddr && (
                editingAddress === 'dropoff' ? (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.red, marginBottom: 6 }}>UPDATE DROP-OFF</div>
                    <AddressAutocomplete
                      label=""
                      placeholder="Search new drop-off address..."
                      onSelect={async (addr) => {
                        setAddressUpdateSent(true);
                        try {
                          await fetch(`/api/rides/${rideId}/update-address`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ addressType: 'dropoff', address: addr.address || addr.name, latitude: addr.latitude, longitude: addr.longitude }),
                          });
                        } catch { setError('Failed to send address update'); setAddressUpdateSent(false); }
                      }}
                      onClear={() => setEditingAddress(null)}
                    />
                    {addressUpdateSent && (
                      <div style={{ fontSize: 11, color: COLORS.orange, marginTop: 6, textAlign: 'center' }}>Waiting for driver to confirm...</div>
                    )}
                    <button onClick={() => { setEditingAddress(null); setAddressUpdateSent(false); }}
                      style={{ marginTop: 6, width: '100%', padding: 6, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: COLORS.gray, fontSize: 12, cursor: 'pointer', fontFamily: FONTS.body }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: COLORS.red, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 2, width: 36 }}>DROP</span>
                    <span style={{ flex: 1, fontSize: 12, lineHeight: 1.3 }}>{dAddr}</span>
                    {canEdit && (
                      <button onClick={() => setEditingAddress('dropoff')}
                        style={{ background: 'none', border: 'none', color: COLORS.orange, fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, padding: '0 2px', fontFamily: FONTS.body }}>
                        Edit
                      </button>
                    )}
                  </div>
                )
              )}

              {/* Navigate Full Trip button — driver only, when not editing */}
              {isDriver && navUrl && !editingAddress && (
                <button
                  type="button"
                  onClick={() => window.open(navUrl, '_blank')}
                  style={{
                    width: '100%', marginTop: 8, padding: '9px 14px', borderRadius: 100,
                    border: '1px solid rgba(68,138,255,0.3)', background: 'rgba(68,138,255,0.08)',
                    color: COLORS.blue, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    fontFamily: FONTS.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <span style={{ fontSize: 14 }}>🧭</span> {navLabel}
                </button>
              )}
            </div>
          );
        })()}

        {/* Driver: pending address update from rider */}
        {isDriver && pendingAddressUpdate && (
          <div style={{
            background: 'rgba(255,145,0,0.1)', border: '1px solid rgba(255,145,0,0.25)',
            borderRadius: 14, padding: '14px 16px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.orange, marginBottom: 4 }}>
              Rider wants to update {pendingAddressUpdate.type}
            </div>
            <div style={{ fontSize: 14, color: COLORS.white, marginBottom: 10, lineHeight: 1.4 }}>
              {pendingAddressUpdate.address}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  await fetch(`/api/rides/${rideId}/update-address`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'confirm' }),
                  }).catch(() => {});
                  setPendingAddressUpdate(null);
                }}
                style={{
                  flex: 1, padding: 12, borderRadius: 100, border: 'none',
                  background: COLORS.green, color: COLORS.black,
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONTS.body,
                }}
              >
                Confirm
              </button>
              <button
                onClick={async () => {
                  await fetch(`/api/rides/${rideId}/update-address`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reject' }),
                  }).catch(() => {});
                  setPendingAddressUpdate(null);
                }}
                style={{
                  flex: 1, padding: 12, borderRadius: 100,
                  border: '1px solid rgba(255,82,82,0.3)', background: 'transparent',
                  color: COLORS.red, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FONTS.body,
                }}
              >
                Keep Original
              </button>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div style={{
            backgroundColor: 'rgba(255, 82, 82, 0.15)',
            border: '1px solid ' + COLORS.red,
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 13,
            color: COLORS.red,
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* ETA tracking banner */}
        {['otw', 'here', 'confirming', 'active'].includes(ride.status) && (
          <div style={{
            padding: '8px 14px', borderRadius: 12, marginBottom: 8,
            background: etaStale ? 'rgba(255,145,0,0.1)' : 'rgba(0,230,118,0.06)',
            border: etaStale ? '1px solid rgba(255,145,0,0.2)' : '1px solid rgba(0,230,118,0.1)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: etaStale ? COLORS.orange : COLORS.green,
              animation: etaStale ? 'none' : 'pulse 1.5s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 11, color: etaStale ? COLORS.orange : COLORS.grayLight }}>
              {isDriver
                ? ride.status === 'active'
                  ? 'Keep HMU open for live ETA to dropoff'
                  : `Keep HMU open so ${ride.riderName} can see your ETA`
                : etaStale
                  ? "Driver's ETA unavailable — we sent them a reminder"
                  : ride.status === 'active'
                    ? 'Live ETA to your destination'
                    : "Your driver's ETA is live — keep HMU open to track"
              }
            </span>
          </div>
        )}

        {/* Rider: driver is requesting your live GPS */}
        {!isDriver && locationRequestPending && (
          <div style={{
            background: 'rgba(68,138,255,0.1)', border: '1px solid rgba(68,138,255,0.3)',
            borderRadius: 14, padding: '14px 16px', marginBottom: 10,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.blue, marginBottom: 4 }}>
              Driver needs your exact location
            </div>
            <div style={{ fontSize: 12, color: COLORS.grayLight, marginBottom: 10, lineHeight: 1.4 }}>
              Share your GPS so they can find you
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  if (!navigator.geolocation) {
                    setLocationRequestPending(false);
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                      const lat = pos.coords.latitude;
                      const lng = pos.coords.longitude;
                      await fetch(`/api/rides/${rideId}/share-location`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lat, lng }),
                      }).catch(() => {});
                      setLocationRequestPending(false);
                      showNotification('Location shared with driver', '📍', COLORS.green);
                    },
                    () => {
                      showNotification('Could not get GPS — check your settings', '📍', COLORS.red);
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                  );
                }}
                style={{
                  flex: 1, padding: 12, borderRadius: 100, border: 'none',
                  background: COLORS.blue, color: COLORS.white,
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONTS.body,
                }}
              >
                Share My Location
              </button>
              <button
                onClick={() => setLocationRequestPending(false)}
                style={{
                  padding: '12px 20px', borderRadius: 100,
                  border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                  color: COLORS.gray, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FONTS.body,
                }}
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {/* Cancel request banner (driver sees this when rider requests cancel) */}
        {cancelRequest && isDriver && (
          <div style={{
            background: 'rgba(255,82,82,0.12)', border: '1px solid rgba(255,82,82,0.3)',
            borderRadius: 16, padding: '16px', marginBottom: 10,
            animation: 'actionPulse 2s ease-in-out infinite',
          }}>
            <style>{`@keyframes actionPulse { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 16px rgba(255,82,82,0.2)} }`}</style>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              Rider wants to cancel
            </div>
            <div style={{ fontSize: 13, color: '#bbb', marginBottom: 12, lineHeight: 1.4 }}>
              {cancelRequest.message}{cancelRequest.reason ? ` — "${cancelRequest.reason}"` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  await fetch(`/api/rides/${rideId}/cancel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ agreeToCancel: true }),
                  });
                  setCancelRequest(null);
                  setRide(prev => ({ ...prev, status: 'cancelled' }));
                }}
                style={{
                  flex: 1, padding: 12, borderRadius: 100, border: 'none',
                  background: '#FF5252', color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                Agree — Cancel Ride
              </button>
              <button
                onClick={() => setCancelRequest(null)}
                style={{
                  flex: 1, padding: 12, borderRadius: 100,
                  border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                  color: '#bbb', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                Keep Riding
              </button>
            </div>
          </div>
        )}

        {/* Dynamic content based on status and role */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 0 }}>
          {renderStatusContent()}
        </div>
        </div>{/* end scrollable inner */}
      </div>

      {/* Chat bubble — visible from OTW through ride end */}
      {['otw', 'here', 'confirming', 'active', 'ended'].includes(ride.status) && !chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          style={{
            position: 'absolute',
            bottom: 'max(24px, env(safe-area-inset-bottom))',
            right: 20,
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: COLORS.card,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            zIndex: 30,
          }}
        >
          {'\uD83D\uDCAC'}
          {chatUnread > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              width: 20, height: 20, borderRadius: '50%',
              backgroundColor: COLORS.green, color: COLORS.black,
              fontSize: 11, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {chatUnread > 9 ? '9+' : chatUnread}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {['otw', 'here', 'confirming', 'active', 'ended'].includes(ride.status) && (
        <RideChat
          rideId={rideId}
          userId={userId}
          isDriver={isDriver}
          messages={chatMessages}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          onSend={(content: string, realId?: string) => {
            const optId = `opt_${Date.now()}`;
            // Optimistically add sender's own message immediately
            const optimisticMsg = {
              id: realId || optId,
              senderId: userId,
              content,
              createdAt: new Date().toISOString(),
              type: 'chat' as string,
              quickKey: null as string | null,
            };
            setChatMessages(prev => [...prev, optimisticMsg]);
            // If we got a real ID, replace any lingering optimistic version
            if (realId) {
              setChatMessages(prev => prev.filter(m => !(m.id === optId)));
            }
            // Fallback: if no Ably confirmation in 3s, fetch messages from API
            setTimeout(() => {
              fetch(`/api/rides/${rideId}/messages`).then(r => r.json()).then(data => {
                if (data.messages) {
                  setChatMessages(data.messages);
                }
              }).catch(() => {});
            }, 3000);
          }}
          rideStatus={ride.status}
        />
      )}

      {/* Rider profile overlay for drivers */}
      {isDriver && ride.riderHandle && (
        <RiderProfileOverlay
          handle={ride.riderHandle}
          open={viewingRiderProfile}
          onClose={() => setViewingRiderProfile(false)}
        />
      )}

      {/* Driver profile overlay for riders */}
      {!isDriver && ride.driverHandle && (
        <DriverProfileOverlay
          handle={ride.driverHandle}
          open={viewingDriverProfile}
          onClose={() => setViewingDriverProfile(false)}
        />
      )}

      {/* Add-on menu sheet for riders */}
      {!isDriver && (
        <AddOnMenuSheet
          rideId={rideId}
          open={menuSheetOpen}
          onClose={() => setMenuSheetOpen(false)}
          agreedPrice={ride.agreedPrice}
          addOns={ride.addOns}
          onAdded={(addOn, total) => {
            setRide(prev => ({
              ...prev,
              addOns: [...prev.addOns, { ...addOn, status: 'pending_driver' }],
              addOnTotal: total,
            }));
          }}
          onRemoved={(addOnId, total) => {
            setRide(prev => ({
              ...prev,
              addOns: prev.addOns.map(a => a.id === addOnId ? { ...a, status: 'removal_pending' } : a),
              addOnTotal: total,
            }));
          }}
        />
      )}
    </div>
  );

  // ── Status-specific content renderer ──
  function renderStatusContent() {
    // ── DRIVER views ──
    if (isDriver) {
      switch (ride.status) {
        case 'matched':
          return ride.cooAt ? (
            <>
              {renderPendingAddOnAlert()}
              <StatusMessage text="Rider is ready!" />
              <PickupTimingCard
                driverLat={geo.lat}
                driverLng={geo.lng}
                pickupLat={ride.pickupLat}
                pickupLng={ride.pickupLng}
                agreementSummary={ride.agreementSummary}
                isDriver={true}
                collapsed={timingCollapsed}
                onToggle={() => setTimingCollapsed(prev => !prev)}
              />
              {/* Update price option for driver */}
              {!ride.proposedPrice && !priceEditorOpen && (
                <div style={{ marginBottom: 8 }}>
                  <button
                    onClick={() => {
                      setPriceEditorValue(String(Math.ceil(Number(ride.agreedPrice || 0))));
                      setPriceEditorOpen(true);
                    }}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 100,
                      border: '1px solid rgba(255,145,0,0.3)', background: 'transparent',
                      color: COLORS.orange, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      fontFamily: FONTS.body,
                    }}
                  >
                    Update Price
                  </button>
                </div>
              )}
              {/* Inline price editor */}
              {priceEditorOpen && (
                <div style={{
                  background: COLORS.card, border: '1px solid rgba(255,145,0,0.2)',
                  borderRadius: 14, padding: '14px 16px', marginBottom: 8,
                }}>
                  <div style={{ fontSize: 12, color: COLORS.orange, fontWeight: 600, marginBottom: 8 }}>
                    Current: ${Number(ride.agreedPrice || 0).toFixed(0)} — enter new price
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: COLORS.green, fontSize: 18, fontWeight: 700 }}>$</span>
                      <input
                        type="number"
                        value={priceEditorValue}
                        onChange={e => setPriceEditorValue(e.target.value)}
                        autoFocus
                        style={{
                          width: '100%', padding: '12px 14px 12px 30px', borderRadius: 10,
                          background: '#1a1a1a', border: '1px solid rgba(255,145,0,0.3)',
                          color: COLORS.white, fontSize: 20, fontWeight: 700, outline: 'none',
                          fontFamily: FONTS.mono,
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => setPriceEditorOpen(false)}
                      style={{ flex: 1, padding: 10, borderRadius: 100, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: COLORS.gray, fontSize: 13, cursor: 'pointer', fontFamily: FONTS.body }}>
                      Cancel
                    </button>
                    <button onClick={() => {
                      const newPrice = parseFloat(priceEditorValue);
                      if (isNaN(newPrice) || newPrice < 1) { setError('Enter a valid price'); return; }
                      if (newPrice === Number(ride.agreedPrice)) { setPriceEditorOpen(false); return; }
                      fetch(`/api/rides/${rideId}/update-price`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ newPrice, reason: 'Price adjusted' }),
                      }).then(r => r.json()).then(data => {
                        if (data.status === 'proposed') {
                          setRide(prev => ({ ...prev, proposedPrice: newPrice }));
                          showNotification('Price update sent to rider', '💰', COLORS.orange);
                        } else {
                          setError(data.error || 'Failed');
                        }
                      }).catch(() => setError('Network error'));
                      setPriceEditorOpen(false);
                    }}
                      style={{ flex: 1, padding: 10, borderRadius: 100, border: 'none', background: COLORS.orange, color: COLORS.black, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONTS.body }}>
                      Send to Rider
                    </button>
                  </div>
                </div>
              )}
              {renderDriverAddOnPanel()}
              {ride.proposedPrice && (
                <div style={{
                  padding: '10px 14px', borderRadius: 12, marginBottom: 8,
                  background: 'rgba(255,145,0,0.1)', border: '1px solid rgba(255,145,0,0.2)',
                  textAlign: 'center', fontSize: 13, color: COLORS.orange,
                }}>
                  Waiting for rider to accept ${ride.proposedPrice}...
                </div>
              )}
              <ActionButton
                label="OTW"
                color={COLORS.green}
                onPress={() => callAction('otw')}
                loading={loading}
              />
            </>
          ) : (
            <>
              <StatusMessage text={ride.isCash
                ? `Waiting for ${ride.riderHandle ? '@' + ride.riderHandle : ride.riderName || 'rider'} to confirm cash ride details...`
                : `Waiting for rider to verify $${Number(ride.agreedPrice || 0).toFixed(0)} payment...`
              } />
              <PickupTimingCard
                driverLat={geo.lat}
                driverLng={geo.lng}
                pickupLat={ride.pickupLat}
                pickupLng={ride.pickupLng}
                agreementSummary={ride.agreementSummary}
                isDriver={true}
                collapsed={timingCollapsed}
                onToggle={() => setTimingCollapsed(prev => !prev)}
              />
              {/* Update price — available even before Pull Up */}
              {!ride.proposedPrice && !priceEditorOpen && (
                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={() => {
                      setPriceEditorValue(String(Math.ceil(Number(ride.agreedPrice || 0))));
                      setPriceEditorOpen(true);
                    }}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 100,
                      border: '1px solid rgba(255,145,0,0.3)', background: 'transparent',
                      color: COLORS.orange, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      fontFamily: FONTS.body,
                    }}
                  >
                    Update Price
                  </button>
                </div>
              )}
              {/* Inline price editor (pre-COO) */}
              {priceEditorOpen && (
                <div style={{
                  background: COLORS.card, border: '1px solid rgba(255,145,0,0.2)',
                  borderRadius: 14, padding: '14px 16px', marginTop: 8,
                }}>
                  <div style={{ fontSize: 12, color: COLORS.orange, fontWeight: 600, marginBottom: 8 }}>
                    Current: ${Number(ride.agreedPrice || 0).toFixed(0)} — enter new price
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: COLORS.green, fontSize: 18, fontWeight: 700 }}>$</span>
                    <input type="number" value={priceEditorValue} onChange={e => setPriceEditorValue(e.target.value)} autoFocus
                      style={{ width: '100%', padding: '12px 14px 12px 30px', borderRadius: 10, background: '#1a1a1a', border: '1px solid rgba(255,145,0,0.3)', color: COLORS.white, fontSize: 20, fontWeight: 700, outline: 'none', fontFamily: FONTS.mono }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => setPriceEditorOpen(false)}
                      style={{ flex: 1, padding: 10, borderRadius: 100, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: COLORS.gray, fontSize: 13, cursor: 'pointer', fontFamily: FONTS.body }}>Cancel</button>
                    <button onClick={() => {
                      const newPrice = parseFloat(priceEditorValue);
                      if (isNaN(newPrice) || newPrice < 1) { setError('Enter a valid price'); return; }
                      if (newPrice === Number(ride.agreedPrice)) { setPriceEditorOpen(false); return; }
                      fetch(`/api/rides/${rideId}/update-price`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPrice, reason: 'Price adjusted' }) })
                        .then(r => r.json()).then(data => {
                          if (data.status === 'proposed') { setRide(prev => ({ ...prev, proposedPrice: newPrice })); showNotification('Price update sent', '💰', COLORS.orange); }
                          else setError(data.error || 'Failed');
                        }).catch(() => setError('Network error'));
                      setPriceEditorOpen(false);
                    }}
                      style={{ flex: 1, padding: 10, borderRadius: 100, border: 'none', background: COLORS.orange, color: COLORS.black, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONTS.body }}>Send to Rider</button>
                  </div>
                </div>
              )}
              {renderDriverAddOnPanel()}
              {ride.proposedPrice && (
                <div style={{
                  padding: '10px 14px', borderRadius: 12, marginTop: 8,
                  background: 'rgba(255,145,0,0.1)', border: '1px solid rgba(255,145,0,0.2)',
                  textAlign: 'center', fontSize: 13, color: COLORS.orange,
                }}>
                  Waiting for rider to accept ${ride.proposedPrice}...
                </div>
              )}
            </>
          );

        case 'otw':
          return (
            <>
              {renderPendingAddOnAlert()}
              {eta && (
                <div style={{
                  textAlign: 'center', padding: '8px 0', fontSize: 13,
                  color: COLORS.orange, fontFamily: FONTS.mono,
                }}>
                  {eta.minutes} min to pickup ({eta.miles.toFixed(1)} mi)
                </div>
              )}
              <StatusMessage text="Heading to rider..." />
              {renderDriverAddOnPanel()}
              {/* Request rider's live GPS */}
              {!locationRequested ? (
                <button
                  type="button"
                  onClick={async () => {
                    setLocationRequested(true);
                    await fetch(`/api/rides/${rideId}/request-location`, { method: 'POST' }).catch(() => {});
                  }}
                  style={{
                    width: '100%', padding: 9, borderRadius: 100, marginBottom: 6,
                    border: '1px solid rgba(68,138,255,0.3)', background: 'rgba(68,138,255,0.08)',
                    color: COLORS.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: FONTS.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <span>📍</span> Request Rider Location
                </button>
              ) : (
                <div style={{
                  textAlign: 'center', padding: '6px 0', marginBottom: 6,
                  fontSize: 11, color: COLORS.gray,
                }}>
                  Waiting for rider to share location...
                </div>
              )}
              <ActionButton
                label="I'M HERE"
                color={COLORS.green}
                onPress={async () => {
                  setLoading(true);
                  setError(null);
                  try {
                    const res = await fetch(`/api/rides/${rideId}/here`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ driverLat: geo.lat, driverLng: geo.lng }),
                    });
                    if (!res.ok) {
                      const body = await res.json().catch(() => ({}));
                      throw new Error((body as Record<string, string>).error || 'Something went wrong');
                    }
                    const data = await res.json();
                    if (data.status) setRide(prev => ({ ...prev, status: data.status }));
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : 'Request failed');
                  } finally {
                    setLoading(false);
                  }
                }}
                loading={loading}
              />
            </>
          );

        case 'here': {
          const waitSecs = waitCountdown !== null ? Math.ceil(waitCountdown / 1000) : null;
          const waitMins = waitSecs !== null ? Math.floor(waitSecs / 60) : null;
          const waitSecsRem = waitSecs !== null ? waitSecs % 60 : null;
          const dUrgent = waitSecs !== null && waitSecs < 60;
          // Emergency = rider no-show if extensions were granted, otherwise clean cancel
          const emergencyIsNoShow = extensionsGranted > 0;
          return (
            <>
              {renderPendingAddOnAlert()}
              {/* ETA to dropoff preview */}
              {eta && ride.dropoffLat && ride.dropoffLng && (
                <div style={{
                  textAlign: 'center', padding: '6px 0', fontSize: 12,
                  color: COLORS.grayLight, fontFamily: FONTS.mono, marginBottom: 4,
                }}>
                  {haversineDistance(driverLocation?.lat || 0, driverLocation?.lng || 0, ride.dropoffLat, ride.dropoffLng).toFixed(1)} mi to dropoff
                </div>
              )}
              {/* 1. Timer */}
              {waitSecs !== null && waitSecs > 0 && (
                <div style={{
                  textAlign: 'center', padding: '12px 16px', marginBottom: 8,
                  backgroundColor: dUrgent ? 'rgba(255,82,82,0.12)' : 'rgba(255,255,255,0.04)',
                  borderRadius: 14, border: dUrgent ? '1px solid rgba(255,82,82,0.2)' : '1px solid rgba(255,255,255,0.06)',
                  position: 'relative',
                }}>
                  {/* Emergency pulloff — driver safety */}
                  <button
                    onClick={() => {
                      const msg = emergencyIsNoShow
                        ? `Leave now? Rider extended ${extensionsGranted}x — this triggers a no-show fee (25%).`
                        : 'Leave immediately? No charge to rider since no extensions were used.';
                      if (confirm(msg)) {
                        fetch(`/api/rides/${rideId}/pulloff`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            chargePercent: emergencyIsNoShow ? 25 : 0,
                            driverLat: geo.lat,
                            driverLng: geo.lng,
                          }),
                        }).then(r => r.json()).then(data => {
                          if (data.status) setRide(prev => ({ ...prev, status: data.status, endedAt: new Date().toISOString() }));
                        }).catch(() => {});
                      }
                    }}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      background: 'rgba(255,82,82,0.15)', border: '1px solid rgba(255,82,82,0.2)',
                      borderRadius: 8, padding: '4px 8px',
                      color: COLORS.red, fontSize: 16, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                      lineHeight: 1,
                    }}
                    title="Emergency — leave immediately"
                  >
                    <span>🚨</span>
                  </button>
                  <div style={{
                    fontFamily: FONTS.mono, fontSize: 28, fontWeight: 700,
                    color: dUrgent ? COLORS.red : COLORS.white,
                    lineHeight: 1,
                  }}>
                    {waitMins}:{String(waitSecsRem).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: 12, color: dUrgent ? COLORS.red : COLORS.gray, marginTop: 4 }}>
                    {dUrgent ? 'You can pull off soon' : 'until you can pull off'}
                  </div>
                  {extensionsGranted > 0 && (
                    <div style={{ fontSize: 10, color: COLORS.orange, marginTop: 4 }}>
                      {extensionsGranted} extension{extensionsGranted > 1 ? 's' : ''} granted
                    </div>
                  )}
                </div>
              )}

              {/* Request rider's live GPS */}
              {!locationRequested ? (
                <button
                  type="button"
                  onClick={async () => {
                    setLocationRequested(true);
                    await fetch(`/api/rides/${rideId}/request-location`, { method: 'POST' }).catch(() => {});
                  }}
                  style={{
                    width: '100%', padding: 9, borderRadius: 100, marginBottom: 6,
                    border: '1px solid rgba(68,138,255,0.3)', background: 'rgba(68,138,255,0.08)',
                    color: COLORS.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: FONTS.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <span>📍</span> Request Rider Location
                </button>
              ) : (
                <div style={{
                  textAlign: 'center', padding: '6px 0', marginBottom: 6,
                  fontSize: 11, color: COLORS.gray,
                }}>
                  Waiting for rider to share location...
                </div>
              )}

              {/* 2. START RIDE button */}
              <ActionButton
                label="START RIDE"
                subtitle="rider in the car"
                color={COLORS.green}
                onPress={async () => {
                  setLoading(true);
                  try {
                    const res = await fetch(`/api/rides/${rideId}/start`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ driverLat: geo.lat, driverLng: geo.lng }),
                    });
                    const data = await res.json();
                    if (data.status) {
                      setRide(prev => ({
                        ...prev,
                        status: data.status,
                        confirmDeadline: data.confirmDeadline || null,
                      }));
                    }
                    if (!res.ok) setError(data.error || 'Failed to start ride');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed');
                  }
                  setLoading(false);
                }}
                loading={loading}
              />

              {/* 3. Extension request from rider */}
              {extensionPending && (
                <div style={{
                  padding: '12px 16px', marginTop: 8, borderRadius: 14,
                  backgroundColor: 'rgba(255,145,0,0.1)', border: '1px solid rgba(255,145,0,0.2)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 13, color: COLORS.orange, fontWeight: 600, marginBottom: 8 }}>
                    Rider needs more time
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button
                      onClick={async () => {
                        setExtensionPending(false);
                        await fetch(`/api/rides/${rideId}/extend-wait`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ approve: true, extraMinutes: 3 }),
                        }).catch(() => {});
                      }}
                      style={{
                        padding: '8px 20px', borderRadius: 100, border: 'none',
                        background: COLORS.green, color: COLORS.black,
                        fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONTS.body,
                      }}
                    >
                      +3 min
                    </button>
                    <button
                      onClick={async () => {
                        setExtensionPending(false);
                        await fetch(`/api/rides/${rideId}/extend-wait`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ approve: false }),
                        }).catch(() => {});
                      }}
                      style={{
                        padding: '8px 20px', borderRadius: 100,
                        border: '1px solid rgba(255,82,82,0.3)', background: 'rgba(255,82,82,0.1)',
                        color: COLORS.red, fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', fontFamily: FONTS.body,
                      }}
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              {/* 4. Add-ons — driver approval panel */}
              {renderDriverAddOnPanel()}
              {showPulloff && (
                <PulloffButtons
                  rideId={rideId}
                  agreedPrice={ride.agreedPrice}
                  driverLat={geo.lat}
                  driverLng={geo.lng}
                  riderLat={ride.riderLat}
                  riderLng={ride.riderLng}
                  onPulloff={(data) => {
                    setRide(prev => ({ ...prev, status: 'ended', endedAt: new Date().toISOString() }));
                  }}
                  loading={loading}
                />
              )}
            </>
          );
        }

        case 'confirming': {
          const cSecs = confirmCountdown !== null ? Math.ceil(confirmCountdown / 1000) : null;
          const cMins = cSecs !== null ? Math.floor(cSecs / 60) : null;
          const cSecsRem = cSecs !== null ? cSecs % 60 : null;
          const dConfirmAddOns = ride.addOns.filter(a => a.status === 'confirmed' || a.status === 'adjusted');
          const dConfirmExtras = dConfirmAddOns.reduce((s, a) => s + Number(a.subtotal || 0), 0);
          const dConfirmTotal = Number(ride.agreedPrice || 0) + dConfirmExtras;
          return (
            <>
              <StatusMessage text="Waiting for rider to confirm..." />

              {/* Breakdown matching rider's view */}
              <div style={{
                backgroundColor: COLORS.card, borderRadius: 14, padding: '14px 16px', marginBottom: 12,
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ fontSize: 13, color: COLORS.grayLight, display: 'flex', alignItems: 'center', gap: 6 }}>
                    Ride
                    {ride.isCash && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#FFC107', background: 'rgba(255,193,7,0.15)', padding: '1px 7px', borderRadius: 100 }}>CASH</span>
                    )}
                  </span>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.white }}>${Number(ride.agreedPrice || 0).toFixed(2)}</span>
                </div>
                {dConfirmAddOns.length > 0 && dConfirmAddOns.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ fontSize: 12, color: COLORS.grayLight }}>{a.name}{Number(a.quantity) > 1 ? ` ×${a.quantity}` : ''}</span>
                    <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.green }}>${Number(a.subtotal || 0).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.white }}>
                    {ride.isCash ? 'Collect from rider' : 'Total charged'}
                  </span>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 20, fontWeight: 700, color: COLORS.green }}>${dConfirmTotal.toFixed(2)}</span>
                </div>
              </div>

              {cSecs !== null && cSecs > 0 && (
                <div style={{
                  textAlign: 'center', padding: '8px 0', fontSize: 13,
                  color: cSecs < 30 ? COLORS.red : COLORS.orange,
                  fontFamily: FONTS.mono,
                }}>
                  {cMins}:{String(cSecsRem).padStart(2, '0')} for rider to confirm
                </div>
              )}
              {cSecs !== null && cSecs <= 0 && (
                <div style={{
                  textAlign: 'center', padding: '12px 16px', fontSize: 14,
                  color: COLORS.red, fontWeight: 700,
                  backgroundColor: 'rgba(255,82,82,0.15)', borderRadius: 12,
                }}>
                  ⚠️ DO NOT DRIVE — rider hasn't confirmed
                </div>
              )}
            </>
          );
        }

        case 'active':
          return (
            <>
            {renderPendingAddOnAlert()}
            {/* ETA to dropoff */}
            {eta && (
              <div style={{
                textAlign: 'center', padding: '8px 0', fontSize: 13,
                color: COLORS.green, fontFamily: FONTS.mono,
              }}>
                {eta.minutes} min to dropoff ({eta.miles.toFixed(1)} mi)
              </div>
            )}
            {/* Pending stop request from rider */}
            {pendingStop && (
              <div style={{
                background: 'rgba(255,145,0,0.1)', border: '1px solid rgba(255,145,0,0.25)',
                borderRadius: 14, padding: '14px 16px', marginBottom: 8,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.orange, marginBottom: 4 }}>
                  📍 Rider wants to add a stop
                </div>
                <div style={{ fontSize: 14, color: COLORS.white, marginBottom: 10 }}>{pendingStop.address}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      fetch(`/api/rides/${rideId}/add-stop`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'accept', ...pendingStop }),
                      }).catch(() => {});
                      setPendingStop(null);
                    }}
                    style={{ flex: 1, padding: 10, borderRadius: 100, border: 'none', background: COLORS.green, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONTS.body }}
                  >
                    Accept Stop
                  </button>
                  <button
                    onClick={() => {
                      fetch(`/api/rides/${rideId}/add-stop`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'decline', address: pendingStop.address }),
                      }).catch(() => {});
                      setPendingStop(null);
                    }}
                    style={{ flex: 1, padding: 10, borderRadius: 100, border: '1px solid rgba(255,82,82,0.3)', background: 'transparent', color: COLORS.red, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONTS.body }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}
            {renderDriverAddOnPanel()}

            {/* End ride reason picker (shown when far from dropoff) */}
            {endRideConfirm.show && (
              <div style={{
                background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.2)',
                borderRadius: 14, padding: '14px 16px', marginBottom: 8,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.red, marginBottom: 8 }}>
                  You're not near the drop-off — what happened?
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {['Rider asked to stop here', 'Rider no-show / left early', 'Route change agreed', 'Safety concern', 'Other'].map(r => (
                    <button
                      key={r}
                      onClick={() => setEndRideConfirm(prev => ({ ...prev, reason: r }))}
                      style={{
                        padding: '8px 12px', borderRadius: 10, fontSize: 13, textAlign: 'left',
                        border: endRideConfirm.reason === r ? '1px solid rgba(255,82,82,0.5)' : '1px solid rgba(255,255,255,0.1)',
                        background: endRideConfirm.reason === r ? 'rgba(255,82,82,0.15)' : 'transparent',
                        color: endRideConfirm.reason === r ? COLORS.red : COLORS.grayLight,
                        cursor: 'pointer', fontFamily: FONTS.body,
                      }}
                    >{r}</button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Add details (optional)"
                  value={endRideConfirm.notes}
                  onChange={(e) => setEndRideConfirm(prev => ({ ...prev, notes: e.target.value }))}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 10, marginBottom: 10,
                    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
                    color: COLORS.white, fontSize: 13, fontFamily: FONTS.body, outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setEndRideConfirm({ show: false, reason: '', notes: '' })}
                    style={{ flex: 1, padding: 10, borderRadius: 100, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: COLORS.gray, fontSize: 13, cursor: 'pointer', fontFamily: FONTS.body }}
                  >Back</button>
                  <ActionButton
                    label="Confirm End"
                    color={COLORS.red}
                    onPress={async () => {
                      if (!endRideConfirm.reason) { setError('Select a reason'); return; }
                      setLoading(true);
                      setError('');
                      try {
                        const res = await fetch(`/api/rides/${rideId}/end`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            driverLat: geo.lat, driverLng: geo.lng,
                            earlyEndReason: endRideConfirm.reason,
                            earlyEndNotes: endRideConfirm.notes || null,
                          }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          setError(data.error || `Couldn't end ride (${res.status})`);
                          setLoading(false);
                          return;
                        }
                        if (data.status) setRide(prev => ({ ...prev, status: data.status }));
                        if (data.driver_payout_amount !== undefined) {
                          setRide(prev => ({ ...prev, driverPayoutAmount: Number(data.driverReceives || data.driver_payout_amount), platformFeeAmount: Number(data.platformFee || prev.platformFeeAmount) }));
                        }
                        setEndRideConfirm({ show: false, reason: '', notes: '' });
                      } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
                      setLoading(false);
                    }}
                    loading={loading}
                  />
                </div>
              </div>
            )}

            {!endRideConfirm.show && (
            <ActionButton
              label="END RIDE"
              color={COLORS.red}
              onPress={async () => {
                // Check proximity to dropoff before ending
                const dLat = geo.lat;
                const dLng = geo.lng;
                if (dLat && dLng && ride.dropoffLat && ride.dropoffLng) {
                  const miles = haversineDistance(dLat, dLng, ride.dropoffLat, ride.dropoffLng);
                  const feet = miles * 5280;
                  if (feet > 1000) {
                    // Far from dropoff — ask for reason
                    setEndRideConfirm({ show: true, reason: '', notes: '' });
                    return;
                  }
                }
                // Close to dropoff or no dropoff GPS — end normally
                setLoading(true);
                setError('');
                try {
                  const res = await fetch(`/api/rides/${rideId}/end`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ driverLat: dLat, driverLng: dLng }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setError(data.error || `Couldn't end ride (${res.status})`);
                    setLoading(false);
                    return;
                  }
                  if (data.status) setRide(prev => ({ ...prev, status: data.status }));
                  if (data.driver_payout_amount !== undefined) {
                    setRide(prev => ({
                      ...prev,
                      driverPayoutAmount: Number(data.driverReceives || data.driver_payout_amount),
                      platformFeeAmount: Number(data.platformFee || prev.platformFeeAmount),
                    }));
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed');
                }
                setLoading(false);
              }}
              loading={loading}
            />
            )}
            </>
          );

        case 'ended':
        case 'completed':
          return renderDriverPayout();

        case 'disputed':
          return (
            <StatusMessage text="This ride is under review. We'll notify you when it's resolved." />
          );

        case 'cancelled':
          return renderBackHome('Ride was cancelled');

        default:
          return <StatusMessage text={`Status: ${ride.status}`} />;
      }
    }

    // ── RIDER views ──
    switch (ride.status) {
      case 'matched':
        return ride.cooAt ? (
          <>
            <PickupTimingCard
              driverLat={driverLocation?.lat ?? null}
              driverLng={driverLocation?.lng ?? null}
              pickupLat={ride.pickupLat}
              pickupLng={ride.pickupLng}
              agreementSummary={ride.agreementSummary}
              isDriver={false}
              collapsed={timingCollapsed}
              onToggle={() => setTimingCollapsed(prev => !prev)}
            />
            {ride.proposedPrice ? (
              <div style={{
                background: 'rgba(255,145,0,0.1)', border: '1px solid rgba(255,145,0,0.25)',
                borderRadius: 16, padding: '16px', marginBottom: 8, textAlign: 'center',
              }}>
                <div style={{ fontSize: 13, color: COLORS.orange, marginBottom: 4 }}>
                  Driver updated the price
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 16, color: COLORS.gray, textDecoration: 'line-through', fontFamily: FONTS.mono }}>${Number(ride.agreedPrice || 0).toFixed(0)}</span>
                  <span style={{ fontSize: 11, color: COLORS.gray }}>→</span>
                  <span style={{ fontSize: 28, fontWeight: 700, color: COLORS.green, fontFamily: FONTS.mono }}>${ride.proposedPrice}</span>
                </div>
                {ride.proposedPriceReason && (
                  <div style={{ fontSize: 12, color: COLORS.grayLight, marginBottom: 10 }}>{ride.proposedPriceReason}</div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={async () => {
                      const res = await fetch(`/api/rides/${rideId}/update-price`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'accept' }),
                      });
                      const data = await res.json();
                      if (data.status === 'accepted') {
                        setRide(prev => ({ ...prev, agreedPrice: data.newPrice, proposedPrice: null, proposedPriceReason: null }));
                        showNotification('Price accepted', '✅', COLORS.green);
                      }
                    }}
                    style={{
                      flex: 1, padding: 12, borderRadius: 100, border: 'none',
                      background: COLORS.green, color: '#000', fontSize: 14, fontWeight: 700,
                      cursor: 'pointer', fontFamily: FONTS.body,
                    }}
                  >
                    Accept ${ride.proposedPrice}
                  </button>
                  <button
                    onClick={async () => {
                      const res = await fetch(`/api/rides/${rideId}/update-price`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'decline' }),
                      });
                      const data = await res.json();
                      if (data.status === 'declined') {
                        setRide(prev => ({ ...prev, proposedPrice: null, proposedPriceReason: null }));
                        showNotification('Keeping original price', '💰', COLORS.orange);
                      }
                    }}
                    style={{
                      flex: 1, padding: 12, borderRadius: 100,
                      border: '1px solid rgba(255,82,82,0.3)', background: 'transparent',
                      color: COLORS.red, fontSize: 14, fontWeight: 600,
                      cursor: 'pointer', fontFamily: FONTS.body,
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ) : (
              <StatusMessage text="Pull Up sent — waiting for driver to go OTW..." />
            )}
            {ride.addOns && ride.addOns.length > 0 && renderAddOnSummary()}
            {renderAddServicesButton()}
            <CancelButton rideId={rideId} label="Cancel Ride" onCancelled={() => setRide(prev => ({ ...prev, status: 'cancelled' }))} />
          </>
        ) : (
          <>
            {/* Ride details accuracy notice */}
            <div style={{
              background: 'rgba(255,179,0,0.08)', border: '1px solid rgba(255,179,0,0.2)',
              borderRadius: 14, padding: '12px 16px', marginBottom: 10,
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>&#9888;&#65039;</span>
              <div style={{ fontSize: 13, color: COLORS.grayLight, lineHeight: 1.5 }}>
                <strong style={{ color: COLORS.white }}>Make sure your ride details are accurate.</strong>{' '}
                Your driver is heading to these addresses — wrong info means a missed pickup. Double-check before tapping Pull Up.
              </div>
            </div>
            <CooButton
              rideId={rideId}
              isCash={ride.isCash}
              initialPickup={
                (ride.agreementSummary?.pickup as string) ||
                (ride.agreementSummary?.destination as string)?.split(/\s*(?:>|→|to)\s*/i)[0] || null
              }
              initialDropoff={
                (ride.agreementSummary?.dropoff as string) ||
                (ride.agreementSummary?.destination as string)?.split(/\s*(?:>|→|to)\s*/i)[1] || null
              }
              onCooSent={(lat, lng, text, pickup, dropoff, stops) => {
              setRide(prev => ({
                ...prev,
                cooAt: new Date().toISOString(),
                riderLat: lat,
                riderLng: lng,
                riderLocationText: text,
                pickupAddress: pickup?.address || text || null,
                pickupLat: pickup?.latitude || null,
                pickupLng: pickup?.longitude || null,
                dropoffAddress: dropoff?.address || null,
                dropoffLat: dropoff?.latitude || null,
                dropoffLng: dropoff?.longitude || null,
                stops: stops || prev.stops,
              }));
            }} />
            {ride.addOns && ride.addOns.length > 0 && renderAddOnSummary()}
            {renderAddServicesButton()}
            <CancelButton rideId={rideId} label="Cancel" onCancelled={() => setRide(prev => ({ ...prev, status: 'cancelled' }))} />
          </>
        );

      case 'otw':
        return (
          <>
            {eta && (
              <div style={{
                textAlign: 'center', padding: '8px 0', fontSize: 14,
                color: COLORS.orange, fontWeight: 600,
              }}>
                <span style={{ fontFamily: FONTS.display, fontSize: 28, letterSpacing: 1 }}>
                  {eta.minutes}
                </span>
                <span style={{ fontSize: 12, color: COLORS.grayLight, marginLeft: 4 }}>
                  min away ({eta.miles.toFixed(1)} mi)
                </span>
              </div>
            )}
            <StatusMessage text="Driver is on the way" />
            {ride.addOns.length > 0 && renderAddOnSummary()}
            {renderAddServicesButton()}
            <CancelButton rideId={rideId} label="Request Cancel" needsApproval onCancelled={() => setRide(prev => ({ ...prev, status: 'cancelled' }))} />
          </>
        );

      case 'here': {
        const rWaitSecs = waitCountdown !== null ? Math.ceil(waitCountdown / 1000) : null;
        const rWaitMins = rWaitSecs !== null ? Math.floor(rWaitSecs / 60) : null;
        const rWaitSecsRem = rWaitSecs !== null ? rWaitSecs % 60 : null;
        const rUrgent = rWaitSecs !== null && rWaitSecs < 60;
        return (
          <>
            <StatusMessage text="Your driver is here!" />
            {rWaitSecs !== null && rWaitSecs > 0 && (
              <div style={{
                textAlign: 'center', padding: '12px 16px', marginBottom: 8,
                backgroundColor: rUrgent ? 'rgba(255,82,82,0.12)' : 'rgba(255,145,0,0.08)',
                borderRadius: 14, border: rUrgent ? '1px solid rgba(255,82,82,0.2)' : '1px solid rgba(255,145,0,0.15)',
              }}>
                <div style={{
                  fontFamily: FONTS.mono, fontSize: 28, fontWeight: 700,
                  color: rUrgent ? COLORS.red : COLORS.orange,
                  lineHeight: 1,
                }}>
                  {rWaitMins}:{String(rWaitSecsRem).padStart(2, '0')}
                </div>
                <div style={{ fontSize: 12, color: rUrgent ? COLORS.red : COLORS.grayLight, marginTop: 4 }}>
                  {rUrgent ? 'Hurry — driver can leave soon' : 'Get to the car before driver can leave'}
                </div>
                {!extensionRequested && rWaitSecs < 120 && (
                  <button
                    onClick={async () => {
                      setExtensionRequested(true);
                      await fetch(`/api/rides/${rideId}/extend-wait`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                      }).catch(() => {});
                    }}
                    style={{
                      marginTop: 8, padding: '8px 20px', borderRadius: 100,
                      border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)',
                      color: COLORS.white, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', fontFamily: FONTS.body,
                    }}
                  >
                    Need more time?
                  </button>
                )}
                {extensionRequested && (
                  <div style={{ fontSize: 11, color: COLORS.gray, marginTop: 6 }}>
                    Waiting for driver to approve...
                  </div>
                )}
              </div>
            )}
            {ride.driverPlate && (
              <div style={{
                textAlign: 'center', marginBottom: 12, padding: '10px 0',
              }}>
                <div style={{ fontSize: 11, color: COLORS.gray, marginBottom: 6 }}>Look for plate</div>
                <div style={{
                  display: 'inline-block', background: '#fff', color: '#000',
                  borderRadius: 8, padding: '8px 18px', border: '3px solid #1a3c8f',
                }}>
                  {ride.driverPlateState && (
                    <div style={{ fontSize: 9, color: '#1a3c8f', fontWeight: 700, textAlign: 'center', marginBottom: 1 }}>
                      {ride.driverPlateState}
                    </div>
                  )}
                  <div style={{
                    fontFamily: FONTS.mono, fontSize: 22, fontWeight: 700,
                    letterSpacing: 3, lineHeight: 1,
                  }}>
                    {ride.driverPlate}
                  </div>
                </div>
              </div>
            )}
            <StatusMessage text="Get in — driver will start the ride" />
          </>
        );
      }

      case 'confirming': {
        const cSecs = confirmCountdown !== null ? Math.ceil(confirmCountdown / 1000) : null;
        const cMins = cSecs !== null ? Math.floor(cSecs / 60) : null;
        const cSecsRem = cSecs !== null ? cSecs % 60 : null;
        const confirmAddOns = ride.addOns.filter(a => a.status === 'confirmed' || a.status === 'adjusted');
        const confirmExtras = confirmAddOns.reduce((s, a) => s + Number(a.subtotal || 0), 0);
        const confirmTotal = Number(ride.agreedPrice || 0) + confirmExtras;
        const confirmGrouped = confirmAddOns.reduce<{ name: string; qty: number; total: number; lastId: string }[]>((g, a) => {
          const sub = Number(a.subtotal || 0);
          const qty = Number(a.quantity) || 1;
          const ex = g.find(x => x.name === a.name);
          if (ex) { ex.qty += qty; ex.total += sub; ex.lastId = a.id; }
          else { g.push({ name: a.name, qty, total: sub, lastId: a.id }); }
          return g;
        }, []);
        return (
          <>
            {/* Header */}
            <div style={{
              textAlign: 'center', padding: '12px 16px',
              backgroundColor: 'rgba(255,145,0,0.12)', borderRadius: 16,
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.orange, marginBottom: 2 }}>
                Confirm &amp; Pay
              </div>
              <div style={{ fontSize: 11, color: COLORS.grayLight }}>
                Review your total before payment is captured
              </div>
              {cSecs !== null && cSecs > 0 && (
                <div style={{
                  fontSize: 11, color: COLORS.gray, fontFamily: FONTS.mono, marginTop: 4,
                }}>
                  Auto-confirms in {cMins}:{String(cSecsRem).padStart(2, '0')}
                </div>
              )}
            </div>

            {/* Receipt breakdown — always shown */}
            <div style={{
              backgroundColor: COLORS.card, borderRadius: 14, padding: '14px 16px',
              marginBottom: 12, border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {/* Base ride */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ fontSize: 13, color: COLORS.grayLight, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Ride
                  {ride.isCash && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#FFC107', background: 'rgba(255,193,7,0.15)', padding: '1px 7px', borderRadius: 100 }}>
                      CASH
                    </span>
                  )}
                </span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.white }}>${Number(ride.agreedPrice || 0).toFixed(2)}</span>
              </div>

              {/* Extras with remove buttons */}
              {confirmGrouped.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: COLORS.orange, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: FONTS.mono, marginTop: 8, marginBottom: 4 }}>
                    Extras — tap to remove
                  </div>
                  {confirmGrouped.map(g => (
                    <div key={g.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', gap: 8 }}>
                      <span style={{ fontSize: 13, color: COLORS.white, flex: 1 }}>
                        {g.name}{g.qty > 1 ? ` \u00D7${g.qty}` : ''}
                      </span>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.green, flexShrink: 0 }}>${g.total.toFixed(2)}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Total line */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                paddingTop: 10, marginTop: 10,
                borderTop: '1px solid rgba(255,255,255,0.1)',
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.white }}>
                  Total charged
                </span>
                <span style={{
                  fontFamily: FONTS.mono, fontSize: 22, fontWeight: 700, color: COLORS.green,
                }}>
                  ${confirmTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Confirm button — shows amount */}
            <ActionButton
              label={`BET — Pay $${confirmTotal.toFixed(2)}`}
              color={COLORS.green}
              onPress={async () => {
                setLoading(true);
                try {
                  let lat: number | null = null;
                  let lng: number | null = null;
                  if (navigator.geolocation) {
                    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 3000 })
                    ).catch(() => null);
                    if (pos) { lat = pos.coords.latitude; lng = pos.coords.longitude; }
                  }
                  const res = await fetch(`/api/rides/${rideId}/confirm-start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat, lng, autoConfirmed: false }),
                  });
                  const data = await res.json();
                  if (data.status) setRide(prev => ({ ...prev, status: data.status }));
                  if (!res.ok) setError(data.error || 'Failed');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed');
                }
                setLoading(false);
              }}
              loading={loading}
            />
          </>
        );
      }

      case 'active':
        return (
          <>
            {/* ETA to dropoff */}
            {eta && (
              <div style={{
                textAlign: 'center', padding: '8px 0', fontSize: 14,
                color: COLORS.green, fontWeight: 600,
              }}>
                <span style={{ fontFamily: FONTS.display, fontSize: 28, letterSpacing: 1 }}>
                  {eta.minutes}
                </span>
                <span style={{ fontSize: 12, color: COLORS.grayLight, marginLeft: 4 }}>
                  min to dropoff ({eta.miles.toFixed(1)} mi)
                </span>
              </div>
            )}
            <StatusMessage text="Ride in progress" />
            {ride.addOns.length > 0 && renderAddOnSummary()}
            {renderAddServicesButton()}
            {/* Add a stop — inline Mapbox search */}
            {!addingMidRideStop ? (
            <button
              onClick={() => setAddingMidRideStop(true)}
              style={{
                width: '100%', padding: 10, borderRadius: 100, marginTop: 6,
                border: '1px solid rgba(255,145,0,0.3)', background: 'transparent',
                color: COLORS.orange, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: FONTS.body,
              }}
            >
              + Add a Stop
            </button>
            ) : (
              <div style={{ marginTop: 6, background: COLORS.card, borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,145,0,0.2)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.orange, marginBottom: 8 }}>Where do you need to stop?</div>
                <AddressAutocomplete
                  label="Stop address"
                  placeholder="Search address..."
                  onSelect={(addr) => {
                    fetch(`/api/rides/${rideId}/add-stop`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ address: addr.address || addr.name, latitude: addr.latitude, longitude: addr.longitude }),
                    }).then(r => r.json()).then(data => {
                      if (data.status === 'requested') {
                        showNotification('Stop request sent to driver', '📍', COLORS.orange);
                      } else {
                        setError(data.error || 'Could not add stop');
                      }
                    }).catch(() => setError('Network error'));
                    setAddingMidRideStop(false);
                  }}
                  onClear={() => {}}
                  proximity={driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng } : undefined}
                />
                <button
                  onClick={() => setAddingMidRideStop(false)}
                  style={{ marginTop: 8, width: '100%', padding: 8, borderRadius: 100, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: COLORS.gray, fontSize: 12, cursor: 'pointer', fontFamily: FONTS.body }}
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        );

      case 'ended':
        return renderRiderPostRide();

      case 'completed':
        return renderBackHome('Ride complete');

      case 'disputed':
        return (
          <StatusMessage text="Your dispute is being reviewed. We'll be in touch." />
        );

      case 'cancelled':
        return renderBackHome('Ride was cancelled');

      default:
        return <StatusMessage text={`Status: ${ride.status}`} />;
    }
  }

  // ── Driver payout summary ──
  function renderDriverPayout() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ride.isCash && isDriver ? (
          /* Cash ride — show collect banner, no Stripe payout info */
          <div style={{
            background: 'rgba(255,193,7,0.12)', border: '1px solid rgba(255,193,7,0.3)',
            borderRadius: 16, padding: '20px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: '#FFC107', opacity: 0.7, marginBottom: 4 }}>Cash ride complete</div>
            <div style={{
              fontFamily: FONTS.mono, fontSize: 42, fontWeight: 700,
              color: '#FFC107', lineHeight: 1.1,
            }}>
              ${(Number(ride.agreedPrice || 0) + Number(ride.addOnTotal || 0)).toFixed(2)}
            </div>
            <div style={{ fontSize: 13, color: '#FFC107', opacity: 0.7, marginTop: 8 }}>
              💵 Collect this from rider — not added to your balance
            </div>
          </div>
        ) : (
          /* Digital ride — show Stripe payout info */
          <div style={{
            backgroundColor: COLORS.card,
            borderRadius: 16,
            padding: '20px 16px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: COLORS.grayLight, marginBottom: 4 }}>
              You earned
            </div>
            <div style={{
              fontFamily: FONTS.mono,
              fontSize: 42,
              fontWeight: 700,
              color: COLORS.green,
              lineHeight: 1.1,
            }}>
              ${Number(ride.driverPayoutAmount || 0).toFixed(2)}
            </div>
            <div style={{
              fontSize: 13,
              color: COLORS.gray,
              marginTop: 8,
              fontFamily: FONTS.mono,
            }}>
              HMU took: ${Number(ride.platformFeeAmount || 0).toFixed(2)}
            </div>
            {ride.platformFeeAmount === 0 && ride.driverPayoutAmount > 0 && (
              <div style={{
                marginTop: 8,
                fontSize: 14,
                color: COLORS.green,
                fontWeight: 600,
              }}>
                Daily cap hit — rest of today is ALL yours
              </div>
            )}
          </div>
        )}

        {/* Ride analytics summary */}
        <RideAnalyticsSummary rideId={rideId} payout={ride.driverPayoutAmount} />

        <div style={{
          fontSize: 13,
          color: COLORS.gray,
          textAlign: 'center',
        }}>
          {ride.isCash ? 'Cash ride — no cashout needed' : 'Cash out from your home screen'}
        </div>

        {!rated && renderRatingCards()}

        {rated && renderBackHome('Thanks! Ride complete.')}
      </div>
    );
  }

  // ── Add-on summary (shown during active ride) ──
  function renderAddOnSummary() {
    const visible = ride.addOns.filter(a => !['removed', 'rejected'].includes(a.status));
    if (visible.length === 0) return null;

    // Only confirmed/adjusted items count toward charged total
    const confirmedTotal = visible
      .filter(a => a.status === 'confirmed' || a.status === 'adjusted')
      .reduce((s, a) => s + Number(a.subtotal || 0), 0);

    const statusLabel = (s: string) => {
      if (s === 'pending_driver') return { text: 'Pending', color: COLORS.orange };
      if (s === 'removal_pending') return { text: 'Removal pending', color: COLORS.orange };
      if (s === 'disputed') return { text: 'Disputed', color: COLORS.red };
      if (s === 'confirmed') return null;
      return null;
    };

    return (
      <div style={{ backgroundColor: COLORS.card, borderRadius: 14, padding: '14px 16px', marginTop: 8 }}>
        <div style={{ fontSize: 11, color: COLORS.gray, textTransform: 'uppercase', letterSpacing: 1, fontFamily: FONTS.mono, marginBottom: 8 }}>
          {isDriver ? 'Rider Add-Ons' : 'Add-Ons'}
        </div>
        {(() => {
          const groups: { name: string; status: string; totalQty: number; totalSub: number }[] = [];
          for (const a of visible) {
            const existing = groups.find(g => g.name === a.name && g.status === a.status);
            if (existing) {
              existing.totalQty += (a.quantity || 1);
              existing.totalSub += Number(a.subtotal || 0);
            } else {
              groups.push({ name: a.name, status: a.status, totalQty: a.quantity || 1, totalSub: Number(a.subtotal || 0) });
            }
          }
          return groups.map((g, i) => {
            const badge = statusLabel(g.status);
            return (
              <div key={`${g.name}-${g.status}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 14, color: COLORS.grayLight, opacity: badge ? 0.7 : 1 }}>
                <span>
                  {g.name}{g.totalQty > 1 ? ` \u00D7${g.totalQty}` : ''}
                  {badge && <span style={{ fontSize: 10, color: badge.color, marginLeft: 6 }}>({badge.text})</span>}
                </span>
                <span style={{ fontFamily: FONTS.mono, color: (g.status === 'confirmed' || g.status === 'adjusted') ? COLORS.green : COLORS.gray }}>
                  ${g.totalSub.toFixed(2)}
                </span>
              </div>
            );
          });
        })()}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ fontSize: 12, color: COLORS.gray }}>Base ride</span>
          <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.white }}>${Number(ride.agreedPrice || 0).toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
          <span style={{ fontSize: 12, color: COLORS.gray }}>Confirmed extras</span>
          <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.green }}>+${confirmedTotal.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.08)', fontWeight: 700 }}>
          <span style={{ fontSize: 13, color: COLORS.white }}>Ride total</span>
          <span style={{ fontFamily: FONTS.mono, fontSize: 16, color: COLORS.green }}>${(Number(ride.agreedPrice || 0) + confirmedTotal).toFixed(2)}</span>
        </div>
      </div>
    );
  }

  // ── Add Services button (rider only, during active ride states) ──
  function renderDriverAddOnPanel() {
    if (!isDriver) return null;
    if (ride.addOns.length === 0) return null;
    return (
      <div ref={addOnPanelRef}>
        <DriverAddOnApproval
          rideId={rideId}
          addOns={ride.addOns}
          agreedPrice={Number(ride.agreedPrice || 0)}
          onUpdated={(addOns, total) => setRide(prev => ({ ...prev, addOns, addOnTotal: total }))}
        />
      </div>
    );
  }

  /** Persistent alert shown at top of driver view when items need approval */
  function renderPendingAddOnAlert() {
    if (!isDriver) return null;
    const pending = ride.addOns.filter(a => a.status === 'pending_driver');
    const removalPending = ride.addOns.filter(a => a.status === 'removal_pending');
    const count = pending.length + removalPending.length;
    if (count === 0) return null;

    return (
      <button
        onClick={() => addOnPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 12, marginBottom: 8,
          background: 'rgba(255,145,0,0.12)', border: '1px solid rgba(255,145,0,0.3)',
          color: COLORS.orange, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: FONTS.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          animation: 'pulse 2s ease-in-out infinite',
        }}
      >
        <span style={{ fontSize: 16 }}>🛒</span>
        {count} extra{count > 1 ? 's' : ''} need{count === 1 ? 's' : ''} your approval
        <span style={{ fontSize: 11, color: COLORS.grayLight }}>↓</span>
      </button>
    );
  }

  function renderAddServicesButton() {
    if (isDriver) return null;
    return (
      <button
        onClick={() => setMenuSheetOpen(true)}
        style={{
          width: '100%', marginTop: 8,
          padding: '14px 16px', borderRadius: 14,
          background: 'rgba(0,230,118,0.08)',
          border: '1px solid rgba(0,230,118,0.2)',
          color: COLORS.green, fontSize: 14, fontWeight: 600,
          cursor: 'pointer', fontFamily: FONTS.body,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <span style={{ fontSize: 18 }}>+</span>
        Add Services from Driver Menu
      </button>
    );
  }

  // ── Add-on review (shown post-ride before rating) ──
  function renderAddOnReview() {
    const hasDisputes = Array.from(addOnReview.values()).some(v => v === 'dispute');

    const handleReviewSubmit = async () => {
      setReviewSubmitting(true);
      try {
        // Disputed add-ons go to driver for approval — rider can't unilaterally remove
        for (const [addOnId, action] of addOnReview.entries()) {
          if (action === 'dispute') {
            await fetch(`/api/rides/${rideId}/add-ons`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ add_on_id: addOnId, action: 'disputed', dispute_reason: 'Rider disputes this add-on' }),
            });
          }
        }
        // Confirm all non-disputed add-ons
        await fetch(`/api/rides/${rideId}/add-ons`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'confirm_all' }),
        });
        setReviewSubmitted(true);
      } catch (err) {
        console.error('Review submit error:', err);
      } finally {
        setReviewSubmitting(false);
      }
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Base ride - locked */}
        <div style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: '16px' }}>
          <div style={{ fontSize: 11, color: COLORS.gray, textTransform: 'uppercase', letterSpacing: 1, fontFamily: FONTS.mono, marginBottom: 8 }}>
            REVIEW YOUR RIDE
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 15, color: COLORS.white }}>Base Ride</span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 15, color: COLORS.white, fontWeight: 700 }}>
              ${Number(ride.agreedPrice || 0).toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: COLORS.gray, marginTop: 4 }}>Locked — non-editable</div>
        </div>

        {/* Add-ons review */}
        <div style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: '16px' }}>
          <div style={{ fontSize: 11, color: COLORS.gray, textTransform: 'uppercase', letterSpacing: 1, fontFamily: FONTS.mono, marginBottom: 4 }}>
            ADD-ONS
          </div>
          <div style={{ fontSize: 11, color: COLORS.gray, marginBottom: 12, lineHeight: 1.4 }}>
            Dispute an add-on if you didn&apos;t receive it. Driver must approve removal.
          </div>
          {ride.addOns.filter(a => a.status === 'confirmed' || a.status === 'adjusted').map(addOn => {
            const decision = addOnReview.get(addOn.id) || 'keep';
            return (
              <div key={addOn.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div>
                  <div style={{ fontSize: 14, color: decision === 'dispute' ? COLORS.red : COLORS.white, textDecoration: decision === 'dispute' ? 'line-through' : 'none' }}>
                    {addOn.name}{addOn.quantity > 1 ? ` \u00D7${addOn.quantity}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.gray }}>
                    {decision === 'dispute' ? 'Disputed — driver will review' : addOn.addedBy === 'system' ? 'Auto-tracked' : 'You added this'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 14, color: decision === 'dispute' ? COLORS.gray : COLORS.green }}>
                    ${Number(addOn.subtotal || 0).toFixed(2)}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => setAddOnReview(prev => { const n = new Map(prev); n.set(addOn.id, 'keep'); return n; })}
                      style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${decision === 'keep' ? COLORS.green : 'rgba(255,255,255,0.1)'}`, background: decision === 'keep' ? 'rgba(0,230,118,0.1)' : 'transparent', color: decision === 'keep' ? COLORS.green : COLORS.gray, fontSize: 12, cursor: 'pointer', fontFamily: FONTS.body }}
                    >pay</button>
                    <button
                      onClick={() => setAddOnReview(prev => { const n = new Map(prev); n.set(addOn.id, 'dispute'); return n; })}
                      style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${decision === 'dispute' ? COLORS.red : 'rgba(255,255,255,0.1)'}`, background: decision === 'dispute' ? 'rgba(255,82,82,0.1)' : 'transparent', color: decision === 'dispute' ? COLORS.red : COLORS.gray, fontSize: 12, cursor: 'pointer', fontFamily: FONTS.body }}
                    >dispute</button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, marginTop: 8, fontWeight: 700 }}>
            <span style={{ fontSize: 15, color: COLORS.white }}>Total</span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 18, color: COLORS.green }}>
              ${(Number(ride.agreedPrice || 0) + ride.addOns.filter(a => (a.status === 'confirmed' || a.status === 'adjusted') && (addOnReview.get(a.id) || 'keep') !== 'dispute').reduce((s, a) => s + Number(a.subtotal || 0), 0)).toFixed(2)}
            </span>
          </div>

          {hasDisputes && (
            <div style={{ fontSize: 11, color: COLORS.yellow, marginTop: 8, lineHeight: 1.4 }}>
              Disputed items will be held until the driver approves the removal. If the driver doesn&apos;t respond, the charge stands.
            </div>
          )}
        </div>

        {/* Confirm button */}
        <button
          onClick={handleReviewSubmit}
          disabled={reviewSubmitting}
          style={{
            width: '100%', padding: 16, borderRadius: 100,
            background: COLORS.green, color: COLORS.black,
            fontFamily: FONTS.body, fontSize: 16, fontWeight: 700,
            border: 'none', cursor: reviewSubmitting ? 'not-allowed' : 'pointer',
            opacity: reviewSubmitting ? 0.5 : 1,
          }}
        >
          {reviewSubmitting ? 'Confirming...' : hasDisputes ? 'CONFIRM & SUBMIT DISPUTES' : 'CONFIRM & PAY'}
        </button>

        {/* Dispute entire ride link */}
        {disputeWindowRemaining !== null && disputeWindowRemaining > 0 && (
          <button
            onClick={handleDispute}
            disabled={loading}
            style={{
              width: '100%', padding: 12, borderRadius: 12,
              border: `1px solid ${COLORS.red}`, backgroundColor: 'transparent',
              color: COLORS.red, fontFamily: FONTS.body, fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1,
            }}
          >
            Nah fam, that&apos;s not right
          </button>
        )}
      </div>
    );
  }

  // ── Rider post-ride: rating + dispute ──
  function renderRiderPostRide() {
    if (rated) {
      return renderBackHome('Thanks! Ride complete.');
    }

    // Show add-on review if there are add-ons and not yet reviewed
    if (ride.addOns.length > 0 && !reviewSubmitted) {
      return renderAddOnReview();
    }

    // Soft confirmation: when the driver ended the ride before reaching the
    // dropoff (early_end_reason set), the rider must acknowledge or dispute
    // that reason before rating. Provides chargeback evidence per
    // memory `money_movement_canonical.md`.
    const needsEarlyEndAck =
      !!ride.earlyEndReason && ride.riderAcknowledgedEarlyEnd === null;

    if (needsEarlyEndAck) {
      return renderEarlyEndAck();
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Dispute countdown */}
        {disputeMinutes !== null && disputeMinutes > 0 && (
          <div style={{
            fontSize: 12,
            color: COLORS.grayLight,
            textAlign: 'center',
            fontFamily: FONTS.mono,
          }}>
            {disputeMinutes} min left to dispute
          </div>
        )}

        {renderRatingCards()}

        {/* Dispute button */}
        {disputeWindowRemaining !== null && disputeWindowRemaining > 0 && (
          <button
            onClick={handleDispute}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid ' + COLORS.red,
              backgroundColor: 'transparent',
              color: COLORS.red,
              fontFamily: FONTS.body,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            Nah fam, that&apos;s not right
          </button>
        )}
      </div>
    );
  }

  // ── Early-end acknowledgement (rider confirms or disputes driver's reason) ──
  function renderEarlyEndAck() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          background: 'rgba(255,82,82,0.08)',
          border: '1px solid rgba(255,82,82,0.2)',
          borderRadius: 14,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.red, marginBottom: 8 }}>
            Your ride ended early — please confirm
          </div>
          <div style={{ fontSize: 14, color: COLORS.white, marginBottom: 6, lineHeight: 1.4 }}>
            Driver said: <strong>{ride.earlyEndReason}</strong>
          </div>
          {ride.earlyEndNotes && (
            <div style={{ fontSize: 13, color: COLORS.grayLight, marginBottom: 10, fontStyle: 'italic' }}>
              &ldquo;{ride.earlyEndNotes}&rdquo;
            </div>
          )}
          <div style={{ fontSize: 12, color: COLORS.grayLight, marginBottom: 12 }}>
            Tap &ldquo;That&rsquo;s right&rdquo; if this matches what happened. Tap &ldquo;Nah, that&rsquo;s not right&rdquo; to dispute — admin will review.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={async () => {
                setLoading(true);
                setError('');
                try {
                  const res = await fetch(`/api/rides/${rideId}/acknowledge-early-end`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ acknowledged: false }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setError(data.error || `Couldn't submit (${res.status})`);
                    setLoading(false);
                    return;
                  }
                  setRide(prev => ({ ...prev, riderAcknowledgedEarlyEnd: false, status: 'disputed' }));
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed');
                }
                setLoading(false);
              }}
              disabled={loading}
              style={{
                flex: 1, padding: 12, borderRadius: 12,
                border: '1px solid ' + COLORS.red,
                background: 'transparent', color: COLORS.red,
                fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              Nah, that&rsquo;s not right
            </button>
            <button
              onClick={async () => {
                setLoading(true);
                setError('');
                try {
                  const res = await fetch(`/api/rides/${rideId}/acknowledge-early-end`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ acknowledged: true }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setError(data.error || `Couldn't submit (${res.status})`);
                    setLoading(false);
                    return;
                  }
                  setRide(prev => ({ ...prev, riderAcknowledgedEarlyEnd: true }));
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed');
                }
                setLoading(false);
              }}
              disabled={loading}
              style={{
                flex: 1, padding: 12, borderRadius: 12,
                border: 'none',
                background: COLORS.green ?? '#27c281', color: '#080808',
                fontFamily: FONTS.body, fontSize: 13, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              That&rsquo;s right
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Rating cards ──
  function renderRatingCards() {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
      }}>
        {RATING_OPTIONS.map(opt => (
          <button
            key={opt.type}
            onClick={() => handleRate(opt.type)}
            disabled={loading}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '14px 8px',
              borderRadius: 14,
              border: '1px solid ' + opt.color + '44',
              backgroundColor: COLORS.card,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              gap: 4,
            }}
          >
            <span style={{ fontSize: 24 }}>{opt.emoji}</span>
            <span style={{
              fontFamily: FONTS.display,
              fontSize: 16,
              letterSpacing: 1,
              color: opt.color,
            }}>
              {opt.label}
            </span>
            <span style={{
              fontSize: 11,
              color: COLORS.gray,
            }}>
              {opt.description}
            </span>
          </button>
        ))}
      </div>
    );
  }

  // ── Back home link ──
  function renderBackHome(message: string) {
    const homeHref = isDriver ? '/driver/home' : '/rider/home';
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 15,
          color: COLORS.green,
          marginBottom: 12,
          fontWeight: 600,
        }}>
          {message}
        </div>
        <Link
          href={homeHref}
          style={{
            display: 'inline-block',
            padding: '10px 32px',
            borderRadius: 10,
            backgroundColor: COLORS.card,
            color: COLORS.white,
            fontFamily: FONTS.body,
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
            border: '1px solid #333',
          }}
        >
          Back to Home
        </Link>
      </div>
    );
  }
}

// ── Sub-components ──

function ActionButton({
  label,
  subtitle,
  color,
  onPress,
  loading,
}: {
  label: string;
  subtitle?: string;
  color: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={onPress}
      disabled={loading}
      style={{
        width: '100%',
        padding: subtitle ? '14px 16px' : '16px',
        borderRadius: 14,
        border: 'none',
        backgroundColor: color,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
        transition: 'opacity 0.15s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <span style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 28,
        letterSpacing: 3,
        color: '#080808',
        lineHeight: 1,
      }}>
        {loading ? '...' : label}
      </span>
      {subtitle && (
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          color: 'rgba(8, 8, 8, 0.7)',
        }}>
          {subtitle}
        </span>
      )}
    </button>
  );
}

function StatusMessage({ text }: { text: string }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '12px 0',
      fontSize: 15,
      color: COLORS.grayLight,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {text}
    </div>
  );
}

// ── Helpers ──

function PulloffButtons({
  rideId, agreedPrice, driverLat, driverLng, riderLat, riderLng, onPulloff, loading,
}: {
  rideId: string; agreedPrice: number;
  driverLat: number | null; driverLng: number | null;
  riderLat: number | null; riderLng: number | null;
  onPulloff: (data: Record<string, unknown>) => void;
  loading: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handlePulloff(percent: number) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rides/${rideId}/pulloff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chargePercent: percent,
          driverLat, driverLng, riderLat, riderLng,
        }),
      });
      const data = await res.json();
      if (res.ok) onPulloff(data);
    } catch { /* silent */ }
    setSubmitting(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <div style={{ fontSize: 12, color: COLORS.gray, textAlign: 'center', marginBottom: 4 }}>
        Wait time expired — charge no-show fee:
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[25, 50, 100].map(pct => (
          <button
            key={pct}
            onClick={() => handlePulloff(pct)}
            disabled={submitting || loading}
            style={{
              flex: 1, padding: '12px 4px', borderRadius: 12,
              border: `1px solid ${pct === 100 ? COLORS.red + '44' : 'rgba(255,255,255,0.1)'}`,
              backgroundColor: COLORS.card,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
              textAlign: 'center',
            }}
          >
            <div style={{ fontFamily: FONTS.display, fontSize: 18, color: pct === 100 ? COLORS.red : COLORS.white }}>
              {pct}%
            </div>
            <div style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.green }}>
              ${(agreedPrice * pct / 100).toFixed(2)}
            </div>
          </button>
        ))}
      </div>
      <button
        onClick={() => handlePulloff(0)}
        disabled={submitting || loading}
        style={{
          width: '100%', padding: 10, borderRadius: 100,
          border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
          color: COLORS.gray, fontSize: 13, cursor: 'pointer',
          fontFamily: FONTS.body,
        }}
      >
        Leave without charging
      </button>
    </div>
  );
}

// ── Pickup timing card — shows drive time, rider's requested time, and leave-by ──
function PickupTimingCard({
  driverLat,
  driverLng,
  pickupLat,
  pickupLng,
  agreementSummary,
  isDriver,
  collapsed,
  onToggle,
}: {
  driverLat: number | null;
  driverLng: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  agreementSummary: Record<string, unknown> | null;
  isDriver: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  // Drive time calc
  const hasDriveData = driverLat && driverLng && pickupLat && pickupLng;
  const miles = hasDriveData ? haversineDistance(driverLat, driverLng, pickupLat, pickupLng) : null;
  // ~25 mph avg in Atlanta metro with traffic
  const driveMinutes = miles !== null ? Math.max(Math.round((miles / 25) * 60), 1) : null;

  // Rider's requested time
  const timeDisplay = (agreementSummary?.timeDisplay as string) || null;
  const resolvedTime = (agreementSummary?.resolvedTime as string) || null;
  const timeRaw = (agreementSummary?.time as string) || null;
  const isAsap = !resolvedTime || (timeRaw && /^(now|asap|right now)$/i.test(timeRaw.trim()));

  // Leave-by calculation for scheduled rides
  let leaveByLabel: string | null = null;
  if (!isAsap && resolvedTime && driveMinutes !== null) {
    const pickupTime = new Date(resolvedTime);
    if (!isNaN(pickupTime.getTime())) {
      const leaveBy = new Date(pickupTime.getTime() - (driveMinutes + 10) * 60000);
      const now = new Date();
      if (leaveBy > now) {
        leaveByLabel = leaveBy.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      }
    }
  }

  // Nothing to show
  if (!hasDriveData && !timeDisplay && isAsap) return null;

  // Collapsed = compact single-line summary
  if (collapsed) {
    const parts: string[] = [];
    if (driveMinutes !== null && miles !== null) parts.push(`${driveMinutes} min (${miles.toFixed(1)} mi)`);
    if (timeDisplay && !isAsap) parts.push(timeDisplay);
    if (isAsap && hasDriveData) parts.push('ASAP');
    if (!parts.length) return null;

    return (
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          marginBottom: 8, cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 12, color: COLORS.grayLight, fontFamily: FONTS.mono }}>
          {isDriver ? '🚗' : '📍'} {parts.join(' · ')}
        </span>
        <span style={{ fontSize: 10, color: COLORS.gray }}>▼</span>
      </button>
    );
  }

  return (
    <div style={{
      backgroundColor: COLORS.card, borderRadius: 12,
      padding: '12px 14px', marginBottom: 8,
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Header with collapse toggle */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 11, color: COLORS.gray, textTransform: 'uppercase', letterSpacing: 1, fontFamily: FONTS.mono }}>
          {isDriver ? 'Drive to Pickup' : 'Pickup Info'}
        </span>
        <span style={{ fontSize: 10, color: COLORS.gray }}>▲</span>
      </button>

      {/* Drive time + distance */}
      {driveMinutes !== null && miles !== null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: FONTS.display, fontSize: 26, color: COLORS.white, lineHeight: 1 }}>
            {driveMinutes}
          </span>
          <span style={{ fontSize: 12, color: COLORS.grayLight }}>
            min · {miles.toFixed(1)} mi to pickup
          </span>
        </div>
      )}

      {/* Rider's requested time */}
      {timeDisplay && !isAsap && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 0',
          borderTop: driveMinutes !== null ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}>
          <span style={{ fontSize: 12, color: COLORS.gray, flexShrink: 0 }}>
            {isDriver ? 'Rider needs you' : 'Your pickup'}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.orange, fontFamily: FONTS.mono }}>
            {timeDisplay}
          </span>
        </div>
      )}

      {/* Leave-by suggestion (driver only, scheduled rides) */}
      {isDriver && leaveByLabel && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 0',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 12, color: COLORS.gray, flexShrink: 0 }}>Leave by</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.green, fontFamily: FONTS.mono }}>
            {leaveByLabel}
          </span>
          <span style={{ fontSize: 10, color: COLORS.gray }}>(+10 min buffer)</span>
        </div>
      )}

      {/* ASAP nudge */}
      {isAsap && hasDriveData && (
        <div style={{
          padding: '6px 0',
          borderTop: driveMinutes !== null ? '1px solid rgba(255,255,255,0.06)' : 'none',
          fontSize: 12, color: COLORS.orange,
        }}>
          {isDriver ? 'Rider is waiting — head out when ready' : 'Your driver will head out soon'}
        </div>
      )}
    </div>
  );
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getStatusNotificationData(
  status: string,
  isDriver: boolean
): { message: string; emoji: string; color: string; sub?: string } | null {
  switch (status) {
    case 'matched':
      return isDriver
        ? { message: 'You got a match!', emoji: '\uD83E\uDD1D', color: '#00E676', sub: 'Waiting for rider to confirm ride details' }
        : { message: 'Matched with a driver!', emoji: '\uD83E\uDD1D', color: '#00E676', sub: 'Tap Pull Up to confirm your ride' };
    case 'otw':
      return isDriver
        ? { message: 'You\u2019re OTW', emoji: '\uD83D\uDE97', color: '#FF9100', sub: 'GPS tracking is active' }
        : { message: 'Driver is OTW!', emoji: '\uD83D\uDE97', color: '#FF9100', sub: 'They\u2019re heading to your location now' };
    case 'here':
      return isDriver
        ? { message: 'You\u2019re HERE', emoji: '\uD83D\uDCCD', color: '#FFD740', sub: 'Waiting for rider to come out' }
        : { message: 'Your driver is HERE!', emoji: '\uD83D\uDCCD', color: '#FFD740', sub: 'Head to the car and tap BET' };
    case 'active':
      return { message: 'Ride Active', emoji: '\u26A1', color: '#00E676', sub: 'Have a safe trip!' };
    case 'ended':
      return isDriver
        ? { message: 'Ride Ended', emoji: '\uD83C\uDFC1', color: '#AAAAAA', sub: 'Rate your rider' }
        : { message: 'Ride Ended', emoji: '\uD83C\uDFC1', color: '#AAAAAA', sub: 'Rate your driver \u2014 dispute window open' };
    case 'completed':
      return { message: 'Ride Complete', emoji: '\u2705', color: '#00E676', sub: 'Thanks for riding with HMU!' };
    case 'cancelled':
      return { message: 'Ride Cancelled', emoji: '\u274C', color: '#FF5252' };
    default:
      return null;
  }
}

// ── COO Button component ──
//
// Some payment methods (Cash App Pay, 3DS challenges) trigger a full-page
// redirect through Stripe and back to /payments/return → /ride/[id]. That
// remounts this component and wipes any pickup/dropoff/stops the rider had
// just typed. We stash the draft in sessionStorage keyed by ride id and
// rehydrate on mount; cleared on successful Pull Up.
type CooDraftState = {
  locationText?: string;
  pickupAddr?: ValidatedAddress | null;
  dropoffAddr?: ValidatedAddress | null;
  stopAddrs?: (ValidatedAddress & { _key?: string })[];
};

const COO_DRAFT_KEY_PREFIX = 'hmu_ride_draft_';

function readCooDraft(rideId: string): CooDraftState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(COO_DRAFT_KEY_PREFIX + rideId);
    return raw ? (JSON.parse(raw) as CooDraftState) : {};
  } catch { return {}; }
}

function writeCooDraft(rideId: string, draft: CooDraftState) {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(COO_DRAFT_KEY_PREFIX + rideId, JSON.stringify(draft)); }
  catch { /* sessionStorage may be disabled */ }
}

function clearCooDraft(rideId: string) {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(COO_DRAFT_KEY_PREFIX + rideId); }
  catch { /* */ }
}

function CooButton({ rideId, isCash, onCooSent, initialPickup, initialDropoff }: {
  rideId: string;
  isCash: boolean;
  onCooSent: (lat: number | null, lng: number | null, text: string | null, pickup?: ValidatedAddress, dropoff?: ValidatedAddress, stops?: ValidatedStop[]) => void;
  initialPickup?: string | null;
  initialDropoff?: string | null;
}) {
  // Lazy initializers — synchronous read on first render, before any prefill
  // effect runs. Empty draft falls through to the normal empty defaults.
  const initialDraft = readCooDraft(rideId);

  const [locationText, setLocationText] = useState(initialDraft.locationText ?? '');
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [geoLat, setGeoLat] = useState<number | null>(null);
  const [geoLng, setGeoLng] = useState<number | null>(null);

  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoPermanentlyDenied, setGeoPermanentlyDenied] = useState(false);
  const [needsPayment, setNeedsPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validated address state — rehydrated from sessionStorage on remount so
  // a Stripe redirect (Cash App Pay / 3DS) doesn't lose the rider's input.
  const [pickupAddr, setPickupAddr] = useState<ValidatedAddress | null>(initialDraft.pickupAddr ?? null);
  const [dropoffAddr, setDropoffAddr] = useState<ValidatedAddress | null>(initialDraft.dropoffAddr ?? null);
  const [stopAddrs, setStopAddrs] = useState<(ValidatedAddress & { _key?: string })[]>(initialDraft.stopAddrs ?? []);
  const [showStops, setShowStops] = useState((initialDraft.stopAddrs ?? []).length > 0);
  const stopKeyCounter = useRef((initialDraft.stopAddrs ?? []).length);
  // If the draft already filled pickup/dropoff, skip the geocode-from-prefill
  // dance — sessionStorage data is the rider's most recent intent.
  const prefillAttempted = useRef(Boolean(initialDraft.pickupAddr || initialDraft.dropoffAddr));

  // Persist the in-flight draft on every change. Cheap, scoped to this ride.
  useEffect(() => {
    writeCooDraft(rideId, { locationText, pickupAddr, dropoffAddr, stopAddrs });
  }, [rideId, locationText, pickupAddr, dropoffAddr, stopAddrs]);

  // Payment preview — drives the deposit/cash split shown to the rider before
  // tap. modeKey === 'deposit_only' triggers the cash-on-hand hard gate.
  type PaymentPreview = {
    modeKey: string;
    agreedPrice: number;
    visibleDeposit: number;
    cashRemainder: number;
    requiresCashOnHandConfirm: boolean;
  };
  const [preview, setPreview] = useState<PaymentPreview | null>(null);
  const [cashOnHandConfirmed, setCashOnHandConfirmed] = useState(false);

  useEffect(() => {
    if (isCash) return;
    let cancelled = false;
    fetch(`/api/rides/${rideId}/payment-preview`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled && data) setPreview(data as PaymentPreview); })
      .catch(() => { /* silent — falls back to legacy UI */ });
    return () => { cancelled = true; };
  }, [rideId, isCash]);

  // Prefill addresses from booking data via Mapbox geocoding
  useEffect(() => {
    if (prefillAttempted.current) return;
    prefillAttempted.current = true;

    async function geocodeAddress(query: string): Promise<ValidatedAddress | null> {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token || !query.trim()) return null;
      const searchQuery = query.toLowerCase().includes('atlanta') || query.toLowerCase().includes(', ga')
        ? query : `${query}, Atlanta, GA`;
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${token}&country=us&bbox=-84.8,33.5,-84.1,34.1&limit=1&types=address,poi,place,neighborhood,locality`
        );
        if (!res.ok) return null;
        const data = await res.json();
        const feature = data.features?.[0];
        if (!feature?.geometry?.coordinates) return null;
        const [lng, lat] = feature.geometry.coordinates;
        return {
          address: feature.place_name || feature.text || query,
          name: feature.text || feature.place_name || query,
          latitude: lat,
          longitude: lng,
          mapbox_id: feature.id || '',
        };
      } catch { return null; }
    }

    // Geocode both addresses in parallel
    const tasks: Promise<void>[] = [];
    if (initialPickup && initialPickup.trim()) {
      tasks.push(geocodeAddress(initialPickup).then(addr => { if (addr) setPickupAddr(addr); }));
    }
    if (initialDropoff && initialDropoff.trim()) {
      tasks.push(geocodeAddress(initialDropoff).then(addr => { if (addr) setDropoffAddr(addr); }));
    }
    Promise.all(tasks).catch(() => {});
  }, [initialPickup, initialDropoff]);

  function getMyLocation() {
    if (!navigator.geolocation) {
      setGeoError('GPS not available on this device');
      return;
    }
    setGettingLocation(true);
    setGeoError(null);
    setGeoPermanentlyDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLat(pos.coords.latitude);
        setGeoLng(pos.coords.longitude);
        setGettingLocation(false);
        setGeoError(null);
        setGeoPermanentlyDenied(false);
      },
      (err) => {
        setGettingLocation(false);
        if (err.code === 1) {
          setGeoError('Location access denied');
          if ('permissions' in navigator) {
            navigator.permissions.query({ name: 'geolocation' }).then((result) => {
              setGeoPermanentlyDenied(result.state === 'denied');
            }).catch(() => {});
          }
        } else if (err.code === 2) {
          setGeoError('Location unavailable — try again');
        } else {
          setGeoError('Location timed out — try again');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function handleCoo() {
    fbCustomEvent('COO_Tapped', { ride_id: rideId });

    // Require dropoff address
    if (!dropoffAddr) {
      setError('Enter your drop-off address so your driver knows where to go');
      return;
    }

    // Check payment method — skip for cash rides
    setLoading(true);
    if (!isCash) {
      try {
        const pmRes = await fetch('/api/rider/payment-methods');
        const pmData = await pmRes.json();
        if (!pmData.methods || pmData.methods.length === 0) {
          setNeedsPayment(true);
          setLoading(false);
          return;
        }
      } catch { /* proceed */ }
    }

    // Build validated stops with order
    const validatedStops: ValidatedStop[] = stopAddrs.map((s, i) => ({
      ...s,
      order: i + 1,
      reached_at: null,
      verified: false,
    }));

    try {
      const res = await fetch(`/api/rides/${rideId}/coo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: geoLat,
          lng: geoLng,
          locationText: pickupAddr?.address || locationText.trim() || null,
          validatedPickup: pickupAddr,
          validatedDropoff: dropoffAddr,
          validatedStops: validatedStops.length > 0 ? validatedStops : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        fbEvent('InitiateCheckout', { content_name: 'ride_coo', content_category: 'rides' });
        // Pull Up succeeded — DB now owns the addresses; drop the local draft.
        clearCooDraft(rideId);
        onCooSent(geoLat, geoLng, pickupAddr?.address || locationText.trim() || null, pickupAddr || undefined, dropoffAddr, validatedStops.length > 0 ? validatedStops : undefined);
      } else {
        if (data.code === 'no_payment_method') {
          setNeedsPayment(true);
        } else {
          setError(data.error || 'Pull Up failed — try again');
        }
      }
    } catch {
      setError('Network error — check your connection');
    }
    setLoading(false);
  }

  async function handleAddPayment() {
    fbCustomEvent('AddPaymentFromRide', { ride_id: rideId });
    try {
      const res = await fetch('/api/rider/payment-methods/checkout', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        localStorage.setItem('hmu_pending_ride', rideId);
        window.location.href = data.url;
      }
    } catch { /* silent */ }
  }

  // Payment method needed — show inline form instead of redirect
  if (needsPayment) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '15px', color: COLORS.white, fontWeight: 600 }}>
            Link a payment method to continue
          </div>
          <div style={{ fontSize: '13px', color: COLORS.grayLight, marginTop: 4 }}>
            Your driver knows payment is secured once you tap Pull Up
          </div>
        </div>
        <div style={{
          background: '#141414', border: `1px solid rgba(0,230,118,0.2)`,
          borderRadius: 14, padding: 16,
        }}>
          <InlinePaymentForm onSuccess={() => {
            setNeedsPayment(false);
            // Auto-send Pull Up after payment method is linked
            setTimeout(() => handleCoo(), 500);
          }} />
        </div>
        <button
          type="button"
          onClick={() => setNeedsPayment(false)}
          style={{
            background: 'transparent', border: 'none', color: COLORS.gray,
            fontSize: '13px', cursor: 'pointer', padding: '8px',
          }}
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ marginBottom: '6px' }}>
        <div style={{ fontSize: '14px', color: COLORS.grayLight }}>
          {pickupAddr || dropoffAddr
            ? 'Confirm your addresses — tap to edit if needed'
            : 'Where are you and where are you going?'}
        </div>
        <div style={{ fontSize: '11px', color: COLORS.gray, marginTop: '3px' }}>
          Try an address, apartment name, building, or nearby landmark. Scroll the list for more results.
        </div>
      </div>

      {/* Pickup address autocomplete */}
      <AddressAutocomplete
        label="Pickup"
        placeholder="Address, apartment, or landmark..."
        onSelect={(addr) => setPickupAddr(addr)}
        onClear={() => setPickupAddr(null)}
        proximity={geoLat && geoLng ? { lat: geoLat, lng: geoLng } : undefined}
        value={pickupAddr}
      />

      {/* Dropoff address autocomplete */}
      <AddressAutocomplete
        label="Drop-off"
        placeholder="Address, building, or landmark..."
        onSelect={(addr) => setDropoffAddr(addr)}
        onClear={() => setDropoffAddr(null)}
        proximity={geoLat && geoLng ? { lat: geoLat, lng: geoLng } : undefined}
        required
        value={dropoffAddr}
      />

      {/* Optional stops */}
      {showStops && stopAddrs.map((stopEntry, i) => (
        <div key={stopEntry._key || `stop-${i}`} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <AddressAutocomplete
              label={`Stop ${i + 1}`}
              placeholder="Stop address or landmark..."
              onSelect={(addr) => {
                const updated = [...stopAddrs];
                updated[i] = { ...addr, _key: stopEntry._key };
                setStopAddrs(updated);
              }}
              onClear={() => {
                const updated = [...stopAddrs];
                updated[i] = { _key: stopEntry._key } as ValidatedAddress & { _key: string };
                setStopAddrs(updated);
              }}
              proximity={geoLat && geoLng ? { lat: geoLat, lng: geoLng } : undefined}
              value={stopEntry.name ? stopEntry as ValidatedAddress : null}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const updated = stopAddrs.filter((_, idx) => idx !== i);
              setStopAddrs(updated);
              if (updated.length === 0) setShowStops(false);
            }}
            style={{
              background: 'rgba(255,82,82,0.15)', border: '1px solid rgba(255,82,82,0.3)',
              borderRadius: '8px', padding: '10px 12px', color: COLORS.red,
              fontSize: '14px', cursor: 'pointer', marginBottom: '2px',
            }}
          >
            X
          </button>
        </div>
      ))}

      {stopAddrs.length < 3 && (
        <button
          type="button"
          onClick={() => {
            setShowStops(true);
            stopKeyCounter.current += 1;
            setStopAddrs([...stopAddrs, { _key: `stop-${stopKeyCounter.current}` } as ValidatedAddress & { _key: string }]);
          }}
          style={{
            background: 'transparent', border: '1px dashed rgba(255,255,255,0.15)',
            borderRadius: '10px', padding: '10px 14px', color: COLORS.grayLight,
            fontSize: '13px', cursor: 'pointer', width: '100%',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          + Add a stop
        </button>
      )}

      <button
        type="button"
        onClick={getMyLocation}
        disabled={gettingLocation}
        style={{
          background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '100px', padding: '10px 16px', color: COLORS.blue,
          fontSize: '13px', fontWeight: 600, cursor: 'pointer', width: '100%',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        }}
      >
        {gettingLocation ? 'Getting location...' : geoLat ? `\uD83D\uDCCD GPS shared (${geoLat.toFixed(4)}, ${geoLng?.toFixed(4)})` : '\uD83D\uDCCD Share my GPS location'}
      </button>

      {/* GPS error message — shows settings help for denied, retry for other errors */}
      {geoError && (
        geoError.toLowerCase().includes('denied') ? (
          <div style={{
            background: 'rgba(255,82,82,0.1)', borderRadius: '14px',
            border: '1px solid rgba(255,82,82,0.3)', padding: '14px',
          }}>
            <GeoBlockedHelp onRetry={() => window.location.reload()} />
          </div>
        ) : (
          <button
            type="button"
            onClick={getMyLocation}
            style={{
              width: '100%', fontSize: '13px', color: COLORS.white, textAlign: 'center',
              padding: '10px 14px', background: 'rgba(255,82,82,0.15)',
              borderRadius: '12px', border: '1px solid rgba(255,82,82,0.3)',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '8px',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          >
            <span style={{ fontSize: '14px' }}>{'\uD83D\uDCCD'}</span>
            <span style={{ color: COLORS.red }}>{geoError}</span>
            <span style={{
              background: 'rgba(255,82,82,0.2)', borderRadius: '100px',
              padding: '2px 10px', fontSize: '11px', fontWeight: 700, color: COLORS.red,
            }}>TAP TO RETRY</span>
          </button>
        )
      )}

      {error && (
        <div style={{
          fontSize: '13px', color: COLORS.red, padding: '10px 14px',
          background: 'rgba(255,82,82,0.08)', borderRadius: '12px',
          marginBottom: '8px', textAlign: 'center',
        }}>
          {error}
        </div>
      )}

      {/* Deposit-only mode: split display + hard-gated cash-on-hand confirm. */}
      {preview && preview.requiresCashOnHandConfirm && (
        <div style={{
          background: 'rgba(0,230,118,0.06)',
          border: '1px solid rgba(0,230,118,0.25)',
          borderRadius: '14px', padding: '14px',
          display: 'flex', flexDirection: 'column', gap: '10px',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: COLORS.grayLight }}>
            <span>Total ride</span>
            <span style={{ color: COLORS.white, fontWeight: 700 }}>${preview.agreedPrice.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: COLORS.grayLight }}>
            <span>Deposit (paid now)</span>
            <span style={{ color: COLORS.white, fontWeight: 700 }}>${preview.visibleDeposit.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: COLORS.grayLight }}>
            <span>Cash to driver on arrival</span>
            <span style={{ color: COLORS.green, fontWeight: 800 }}>${preview.cashRemainder.toFixed(2)}</span>
          </div>
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            fontSize: '13px', color: COLORS.white, cursor: 'pointer',
            paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)',
          }}>
            <input
              type="checkbox"
              checked={cashOnHandConfirmed}
              onChange={(e) => setCashOnHandConfirmed(e.target.checked)}
              style={{ marginTop: '2px', width: '18px', height: '18px', accentColor: COLORS.green }}
            />
            <span>
              I have <strong>${preview.cashRemainder.toFixed(2)}</strong> in cash for my driver.
            </span>
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={() => { setError(null); handleCoo(); }}
        disabled={loading || (preview?.requiresCashOnHandConfirm === true && !cashOnHandConfirmed)}
        style={{
          width: '100%', padding: '18px', borderRadius: '100px',
          border: 'none', background: COLORS.green, color: COLORS.black,
          fontWeight: 800, fontSize: '18px', cursor: 'pointer',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          opacity: (loading || (preview?.requiresCashOnHandConfirm === true && !cashOnHandConfirmed)) ? 0.4 : 1,
        }}
      >
        {loading ? 'Sending...' : 'Pull Up \u2014 I\'m ready'}
      </button>

      <div style={{ fontSize: '12px', color: COLORS.gray, textAlign: 'center' }}>
        {preview?.requiresCashOnHandConfirm
          ? 'Deposit secured now \u2014 pay your driver the cash on arrival'
          : 'This confirms your payment and shares your pickup location'}
      </div>
    </div>
  );
}

// ── Geo Blocked Help component ──
function GeoBlockedHelp({ onRetry }: { onRetry: () => void }) {
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
        Location is blocked in your settings
      </div>
      {isIOS ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>To fix on iPhone:</div>
          <div>1. Open <strong>Settings</strong> &gt; <strong>Privacy &amp; Security</strong> &gt; <strong>Location Services</strong></div>
          <div>2. Make sure Location Services is <strong>ON</strong></div>
          <div>3. Scroll to <strong>Safari Websites</strong> &gt; set to <strong>While Using</strong></div>
          <div style={{ marginTop: 4 }}>Or: <strong>Settings</strong> &gt; <strong>Safari</strong> &gt; <strong>Location</strong> &gt; <strong>Allow</strong></div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            Then come back here and tap the button below
          </div>
        </div>
      ) : isAndroid ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>To fix on Android:</div>
          <div>1. Open <strong>Settings</strong> &gt; <strong>Apps</strong> &gt; <strong>Chrome</strong></div>
          <div>2. Tap <strong>Permissions</strong> &gt; <strong>Location</strong> &gt; <strong>Allow</strong></div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            Search: &quot;Android Chrome enable location permission&quot;
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
          <div>Open your browser settings and enable location for this site.</div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            Search: &quot;enable location permission in browser&quot;
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 10, width: '100%', padding: '8px', borderRadius: 100,
          border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)',
          color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        I fixed it — try again
      </button>
    </div>
  );
}

// ── Cancel Button component ──
function CancelButton({ rideId, label, needsApproval, onCancelled }: {
  rideId: string;
  label: string;
  needsApproval?: boolean;
  onCancelled: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    if (needsApproval) {
      if (!confirm('The driver is already on the way. Request cancellation? The driver must agree.')) return;
    } else {
      if (!confirm('Cancel this ride?')) return;
    }

    setCancelling(true);
    try {
      const res = await fetch(`/api/rides/${rideId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Rider cancelled' }),
      });
      const data = await res.json();
      if (data.status === 'cancelled') {
        onCancelled();
      } else if (data.needsDriverApproval) {
        alert('Cancel request sent to driver. Waiting for their response...');
      }
    } catch { /* silent */ }
    setCancelling(false);
  }

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={cancelling}
      style={{
        width: '100%', padding: '12px', marginTop: '8px',
        borderRadius: '100px', border: '1px solid rgba(255,82,82,0.3)',
        background: 'transparent', color: '#FF5252',
        fontSize: '14px', fontWeight: 600, cursor: 'pointer',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        opacity: cancelling ? 0.5 : 1,
      }}
    >
      {cancelling ? 'Cancelling...' : label}
    </button>
  );
}

// ── Tappable Addresses for Driver ──
// ── Ride Analytics Summary (shown post-ride for drivers) ──
function RideAnalyticsSummary({ rideId, payout }: { rideId: string; payout: number }) {
  const [analytics, setAnalytics] = useState<{
    distanceMiles: number | null;
    durationMinutes: number | null;
    ratePerMile: number | null;
    ratePerMinute: number | null;
    comparison?: { percentile: number; area: string; areaAvgPerMile: number } | null;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Fetch ride details + analytics after a short delay (analytics may still be calculating)
    const timer = setTimeout(async () => {
      try {
        // Get this ride's analytics
        const rideRes = await fetch(`/api/rides/${rideId}`);
        if (rideRes.ok) {
          const rideData = await rideRes.json();
          const ride = rideData.ride || rideData;

          // Also fetch driver comparison
          let comparison = null;
          try {
            const analyticsRes = await fetch('/api/driver/analytics');
            if (analyticsRes.ok) {
              const analyticsData = await analyticsRes.json();
              comparison = analyticsData.comparison || null;
            }
          } catch { /* non-critical */ }

          setAnalytics({
            distanceMiles: ride.total_distance_miles ? Number(ride.total_distance_miles) : null,
            durationMinutes: ride.total_duration_minutes ? Number(ride.total_duration_minutes) : null,
            ratePerMile: ride.rate_per_mile ? Number(ride.rate_per_mile) : null,
            ratePerMinute: ride.rate_per_minute ? Number(ride.rate_per_minute) : null,
            comparison,
          });
        }
      } catch { /* silent */ }
      setLoaded(true);
    }, 2000); // Wait 2s for analytics to calculate

    return () => clearTimeout(timer);
  }, [rideId]);

  if (!loaded || !analytics || (!analytics.distanceMiles && !analytics.durationMinutes)) return null;

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '8px',
      padding: '12px', borderRadius: '14px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {analytics.distanceMiles != null && (
        <div style={{ flex: '1 1 45%', textAlign: 'center', padding: '4px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: "'Space Mono', monospace" }}>
            {analytics.distanceMiles.toFixed(1)} mi
          </div>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Distance</div>
        </div>
      )}
      {analytics.durationMinutes != null && (
        <div style={{ flex: '1 1 45%', textAlign: 'center', padding: '4px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: "'Space Mono', monospace" }}>
            {analytics.durationMinutes} min
          </div>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Duration</div>
        </div>
      )}
      {analytics.ratePerMile != null && (
        <div style={{ flex: '1 1 45%', textAlign: 'center', padding: '4px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.green, fontFamily: "'Space Mono', monospace" }}>
            ${analytics.ratePerMile.toFixed(2)}/mi
          </div>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Your Rate</div>
        </div>
      )}
      {analytics.ratePerMinute != null && (
        <div style={{ flex: '1 1 45%', textAlign: 'center', padding: '4px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.green, fontFamily: "'Space Mono', monospace" }}>
            ${analytics.ratePerMinute.toFixed(2)}/min
          </div>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Your Rate</div>
        </div>
      )}
      {analytics.comparison && analytics.comparison.percentile > 0 && (
        <div style={{
          flex: '1 1 100%', textAlign: 'center', padding: '6px 0',
          borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '4px',
        }}>
          <span style={{ fontSize: 13, color: COLORS.green, fontWeight: 600 }}>
            Top {100 - analytics.comparison.percentile}% in {analytics.comparison.area}
          </span>
          <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
            avg ${analytics.comparison.areaAvgPerMile.toFixed(2)}/mi
          </span>
        </div>
      )}
    </div>
  );
}
