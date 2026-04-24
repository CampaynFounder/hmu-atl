import { getPlatformConfig } from '@/lib/platform-config/get';

// Admin-tunable chat-booking config. Read from platform_config.chat_booking.
// Ships DISABLED — see lib/db/migrations/chat-booking-config.sql.
//
// Resolution order for a given driver_id:
//   1. driver_overrides[driver_id] (explicit admin override)
//   2. (future) enabled_for_tiers[driver.tier]
//   3. (future) allow_driver_self_opt_in + driver.chat_booking_self_enabled
//   4. global `enabled`
//
// Future fields are ignored when absent — no breaking change needed to add them.

export interface ChatBookingConfig {
  enabled: boolean;
  driver_overrides: Record<string, boolean>;
  generative: GenerativeConfig;
  deterministic: DeterministicConfig;
  // Forward-compatible, optional today:
  enabled_for_tiers?: string[];
  allow_driver_self_opt_in?: boolean;
}

export interface GenerativeConfig {
  enabled: boolean;
  model: string;
  temperature: number;
  system_prompt_override: string | null;
  tools_enabled: {
    extract_booking: boolean;
    confirm_details: boolean;
    calculate_route: boolean;
    compare_pricing: boolean;
    analyze_sentiment: boolean;
  };
}

export interface DeterministicConfig {
  enforce_min_price: boolean;
  require_payment_slot: boolean;
  buffer_minutes: number;
  re_resolve_time_from_text: boolean;
}

const DEFAULTS: ChatBookingConfig = {
  enabled: false,
  driver_overrides: {},
  generative: {
    enabled: true,
    model: 'gpt-4o-mini',
    temperature: 0.3,
    system_prompt_override: null,
    tools_enabled: {
      extract_booking: true,
      confirm_details: true,
      calculate_route: true,
      compare_pricing: true,
      analyze_sentiment: true,
    },
  },
  deterministic: {
    enforce_min_price: true,
    require_payment_slot: true,
    buffer_minutes: 10,
    re_resolve_time_from_text: true,
  },
};

/** Raw read of the chat_booking config row, merged with code defaults. Shallow merge only. */
export async function getChatBookingConfig(): Promise<ChatBookingConfig> {
  const merged = await getPlatformConfig('chat_booking', DEFAULTS as unknown as Record<string, unknown>);
  const m = merged as unknown as ChatBookingConfig;
  // Deep-merge nested objects so a partial admin edit doesn't blank out defaults.
  return {
    ...DEFAULTS,
    ...m,
    generative: {
      ...DEFAULTS.generative,
      ...(m.generative ?? {}),
      tools_enabled: {
        ...DEFAULTS.generative.tools_enabled,
        ...((m.generative?.tools_enabled ?? {}) as ChatBookingConfig['generative']['tools_enabled']),
      },
    },
    deterministic: { ...DEFAULTS.deterministic, ...(m.deterministic ?? {}) },
    driver_overrides: m.driver_overrides ?? {},
  };
}

/**
 * Resolve whether chat booking is enabled for a specific driver.
 * Returns both the final boolean + the reason (useful for admin debug UI).
 */
export interface ChatBookingResolution {
  enabled: boolean;
  reason: 'override_on' | 'override_off' | 'global_on' | 'global_off';
  config: ChatBookingConfig;
}

export function resolveChatBookingForDriver(
  cfg: ChatBookingConfig,
  driverId: string,
): ChatBookingResolution {
  const override = cfg.driver_overrides?.[driverId];
  if (override === true)  return { enabled: true,  reason: 'override_on',  config: cfg };
  if (override === false) return { enabled: false, reason: 'override_off', config: cfg };
  // Future tier/self-opt-in resolution slots in here. For now fall through to global.
  return {
    enabled: !!cfg.enabled,
    reason: cfg.enabled ? 'global_on' : 'global_off',
    config: cfg,
  };
}

/** Convenience: fetch config + resolve in one call. */
export async function isChatBookingEnabledForDriver(driverId: string): Promise<boolean> {
  const cfg = await getChatBookingConfig();
  return resolveChatBookingForDriver(cfg, driverId).enabled;
}
