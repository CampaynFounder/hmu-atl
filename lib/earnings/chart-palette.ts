// Earnings-chart palette — the 3 stacked stream colors (cash / HMU Pay /
// delivery), their legend labels, and the gradient-blend toggle that the driver
// wallet chart renders. Stored in platform_config so a superadmin can retune it
// live (no app rebuild): the mobile chart reads the resolved palette off the
// /driver/balance response on each load.
//
// Default = "Refined Neon": the brand neon green as the HMU Pay hero, a neon
// purple accent for delivery, and a warm gold anchor for cash so the two neons
// never sit adjacent in the stack and chromatically clash.

import { getPlatformConfig } from '@/lib/platform-config/get';

export const CHART_PALETTE_KEY = 'earnings_chart.palette';

// The 3 stream channels, shared shape for both the hex colors and the labels.
export type ChartChannels = {
  cash: string;
  hmuPay: string;
  delivery: string;
};

// Per-stream legend/label text, superadmin-editable.
export type ChartLabels = ChartChannels;

// `type` (not `interface`) so it satisfies the Record<string, unknown>
// constraint on getPlatformConfig / logAdminAction.
export type ChartPalette = {
  cash: string;
  hmuPay: string;
  delivery: string;
  // Legend labels per stream (e.g. "Fee Free Cash" / "HMU Pay" / "HMU Deliveries").
  labels: ChartLabels;
  // When true the stacked bar renders as ONE continuous gradient blending the
  // stream colors top→bottom; when false each segment keeps its own solid
  // (per-stream sheen) fill. Superadmin-toggleable so they can revert anytime.
  gradientBlend: boolean;
};

export const DEFAULT_CHART_LABELS: ChartLabels = {
  cash: 'Fee Free Cash',
  hmuPay: 'HMU Pay',
  delivery: 'HMU Deliveries',
};

export const DEFAULT_CHART_PALETTE: ChartPalette = {
  cash: '#FFC400',
  hmuPay: '#2CFF05',
  delivery: '#B026FF',
  labels: DEFAULT_CHART_LABELS,
  gradientBlend: true,
};

const HEX_RE = /^#([0-9a-fA-F]{6})$/;
// Cap label length so a long string can't blow out the small legend row.
const MAX_LABEL_LEN = 24;

export function isValidHex(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v);
}

function sanitizeLabel(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = v.trim();
  if (!t) return fallback;
  return t.slice(0, MAX_LABEL_LEN);
}

// Coerce any stored/incoming palette to a fully-populated, valid object: 6-digit
// hex per color (falling back to the default per-channel so one bad value can
// never blank a bar — an invalid SVG fill silently renders nothing), non-empty
// labels, and a boolean toggle. Backward-compatible with rows saved before
// labels/gradientBlend existed.
export function sanitizePalette(input: Partial<ChartPalette> | undefined | null): ChartPalette {
  const p = input ?? {};
  const labels = (p.labels ?? {}) as Partial<ChartLabels>;
  return {
    cash: isValidHex(p.cash) ? p.cash.toUpperCase() : DEFAULT_CHART_PALETTE.cash,
    hmuPay: isValidHex(p.hmuPay) ? p.hmuPay.toUpperCase() : DEFAULT_CHART_PALETTE.hmuPay,
    delivery: isValidHex(p.delivery) ? p.delivery.toUpperCase() : DEFAULT_CHART_PALETTE.delivery,
    labels: {
      cash: sanitizeLabel(labels.cash, DEFAULT_CHART_LABELS.cash),
      hmuPay: sanitizeLabel(labels.hmuPay, DEFAULT_CHART_LABELS.hmuPay),
      delivery: sanitizeLabel(labels.delivery, DEFAULT_CHART_LABELS.delivery),
    },
    gradientBlend: typeof p.gradientBlend === 'boolean'
      ? p.gradientBlend
      : DEFAULT_CHART_PALETTE.gradientBlend,
  };
}

export async function getChartPalette(): Promise<ChartPalette> {
  const raw = await getPlatformConfig<ChartPalette>(CHART_PALETTE_KEY, DEFAULT_CHART_PALETTE);
  return sanitizePalette(raw);
}

// Curated color presets surfaced as one-tap options in the admin console. Colors
// only — labels and the blend toggle are independent of preset choice.
export const CHART_PALETTE_PRESETS: { name: string; palette: ChartChannels }[] = [
  { name: 'Refined Neon', palette: { cash: '#FFC400', hmuPay: '#2CFF05', delivery: '#B026FF' } },
  { name: 'Green × Purple', palette: { cash: '#B026FF', hmuPay: '#00FD00', delivery: '#00E5FF' } },
  { name: 'Sophisticated', palette: { cash: '#FBBF24', hmuPay: '#34D399', delivery: '#A78BFA' } },
  { name: 'Classic', palette: { cash: '#FFC107', hmuPay: '#00E676', delivery: '#448AFF' } },
];
