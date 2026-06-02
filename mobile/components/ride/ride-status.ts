// Shared ride status → display metadata. Single source of truth for both the
// rider and driver active screens (previously duplicated in each).

import { colors } from '@/lib/theme';

export interface StatusMeta {
  label: string;
  color: string;
  bg: string;
  border: string;
}

// Rider-facing labels. Driver screen can override the label per status where
// the wording differs (e.g. "RIDER CONFIRMING" vs "CONFIRM RIDE").
const RIDER_STATUS_META: Record<string, StatusMeta> = {
  matched:     { label: 'DRIVER ACCEPTED', color: colors.amber, bg: colors.amberDim, border: colors.amberBorder },
  otw:         { label: 'DRIVER EN ROUTE', color: colors.blue,  bg: colors.blueDim,  border: colors.blueBorder  },
  here:        { label: 'DRIVER ARRIVED',  color: colors.green, bg: colors.greenDim, border: colors.greenBorder },
  confirming:  { label: 'CONFIRM RIDE',    color: colors.green, bg: colors.greenDim, border: colors.greenBorder },
  active:      { label: 'ON THE WAY',      color: colors.green, bg: colors.greenDim, border: colors.greenBorder },
  in_progress: { label: 'ON THE WAY',      color: colors.green, bg: colors.greenDim, border: colors.greenBorder },
  ended:       { label: 'RIDE COMPLETE',   color: colors.textTertiary, bg: colors.cardAlt, border: colors.border },
  completed:   { label: 'RIDE COMPLETE',   color: colors.textTertiary, bg: colors.cardAlt, border: colors.border },
  cancelled:   { label: 'CANCELLED',       color: colors.red,   bg: colors.redDim,   border: colors.redBorder   },
};

const DRIVER_LABEL_OVERRIDES: Record<string, string> = {
  matched: 'MATCHED',
  confirming: 'RIDER CONFIRMING',
  active: 'RIDE ACTIVE',
};

export function statusMeta(status: string, role: 'rider' | 'driver' = 'rider'): StatusMeta {
  const base = RIDER_STATUS_META[status] ?? {
    label: status.toUpperCase(), color: colors.textFaint, bg: colors.cardAlt, border: colors.border,
  };
  if (role === 'driver' && DRIVER_LABEL_OVERRIDES[status]) {
    return { ...base, label: DRIVER_LABEL_OVERRIDES[status] };
  }
  return base;
}

/** Statuses where the driver marker / live tracking is meaningful. */
export function showsDriverMarker(status: string): boolean {
  return ['otw', 'here', 'confirming', 'active', 'in_progress'].includes(status);
}
