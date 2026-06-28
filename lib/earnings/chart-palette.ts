// Earnings-chart palette — the 3 stacked stream colors (cash / HMU Pay /
// delivery) the driver wallet chart renders. Stored in platform_config so a
// superadmin can retune them live (no app rebuild): the mobile chart reads the
// resolved palette off the /driver/balance response on each load.
//
// Default = "Refined Neon": the brand neon green as the HMU Pay hero, a neon
// purple accent for delivery, and a warm gold anchor for cash so the two neons
// never sit adjacent in the stack and chromatically clash.

import { getPlatformConfig } from '@/lib/platform-config/get';

export const CHART_PALETTE_KEY = 'earnings_chart.palette';

// `type` (not `interface`) so it satisfies the Record<string, unknown>
// constraint on getPlatformConfig / logAdminAction.
export type ChartPalette = {
  cash: string;
  hmuPay: string;
  delivery: string;
};

export const DEFAULT_CHART_PALETTE: ChartPalette = {
  cash: '#FFC400',
  hmuPay: '#2CFF05',
  delivery: '#B026FF',
};

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function isValidHex(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v);
}

// Coerce any stored/incoming palette to valid 6-digit hex, falling back to the
// default per-channel so one bad value can never blank a bar (an invalid SVG
// fill silently renders nothing).
export function sanitizePalette(input: Partial<ChartPalette> | undefined | null): ChartPalette {
  const p = input ?? {};
  return {
    cash: isValidHex(p.cash) ? p.cash.toUpperCase() : DEFAULT_CHART_PALETTE.cash,
    hmuPay: isValidHex(p.hmuPay) ? p.hmuPay.toUpperCase() : DEFAULT_CHART_PALETTE.hmuPay,
    delivery: isValidHex(p.delivery) ? p.delivery.toUpperCase() : DEFAULT_CHART_PALETTE.delivery,
  };
}

export async function getChartPalette(): Promise<ChartPalette> {
  const raw = await getPlatformConfig<ChartPalette>(CHART_PALETTE_KEY, DEFAULT_CHART_PALETTE);
  return sanitizePalette(raw);
}

// Curated presets surfaced as one-tap options in the admin console.
export const CHART_PALETTE_PRESETS: { name: string; palette: ChartPalette }[] = [
  { name: 'Refined Neon', palette: { cash: '#FFC400', hmuPay: '#2CFF05', delivery: '#B026FF' } },
  { name: 'Green × Purple', palette: { cash: '#B026FF', hmuPay: '#00FD00', delivery: '#00E5FF' } },
  { name: 'Sophisticated', palette: { cash: '#FBBF24', hmuPay: '#34D399', delivery: '#A78BFA' } },
  { name: 'Classic', palette: { cash: '#FFC107', hmuPay: '#00E676', delivery: '#448AFF' } },
];
