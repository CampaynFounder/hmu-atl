// Shared types + defaults for admin realtime banner notifications.
// Stored in platform_config row 'admin.realtime_notifications'.
// Read at admin layout mount; updated via /api/admin/realtime-notifications.

export type AdminRealtimeNotifType = 'user_signup' | 'ride_request' | 'ride_booking';

export interface AdminRealtimeNotifConfig {
  user_signup: boolean;
  ride_request: boolean;
  ride_booking: boolean;
}

// user_signup ships ON so the super admin sees real activity in prod
// without needing to flip a toggle first. The other two stay OFF until an
// admin opts in — they fire often and could be noisy.
export const REALTIME_NOTIF_DEFAULTS: AdminRealtimeNotifConfig = {
  user_signup: true,
  ride_request: false,
  ride_booking: false,
};

export const REALTIME_NOTIF_KEY = 'admin.realtime_notifications';

// Several Ably event names can map to the same notif type so we don't have
// to retrofit every existing publisher. Update this map when adding sources.
export const EVENT_TO_TYPE: Record<string, AdminRealtimeNotifType | undefined> = {
  user_signup: 'user_signup',
  rider_request: 'ride_request',
  ride_created: 'ride_booking',
  direct_booking_created: 'ride_booking',
};

export const TYPE_LABELS: Record<AdminRealtimeNotifType, { label: string; emoji: string; description: string }> = {
  user_signup: {
    label: 'New signups',
    emoji: '👋',
    description: 'Banner when a new rider or driver completes onboarding',
  },
  ride_request: {
    label: 'Ride requests',
    emoji: '📣',
    description: 'Banner when a rider broadcasts a new HMU post',
  },
  ride_booking: {
    label: 'Ride bookings',
    emoji: '✅',
    description: 'Banner when a rider books a driver directly or a match is created',
  },
};
