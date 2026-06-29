// Single source of truth for "does this rider have a linked payment method?".
// Used by both the home <PaymentGate> (gates the booking cards) and the
// <RequirePayment> wrapper (gates each booking screen). Re-checks on focus so
// returning from payment-setup reveals the gated content without a manual refresh.
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useStableToken } from '@/hooks/use-stable-token';
import { apiClient } from '@/lib/api';

interface PaymentMethod {
  id: string;
  brand: string | null;
  last4: string | null;
  isDefault: boolean;
}

export interface PaymentMethodStatus {
  // true while the FIRST check (per mount) is in flight — show a spinner.
  loading: boolean;
  // true = has ≥1 card, false = confirmed none (gate), null = unknown.
  // We ONLY ever gate on an explicit `false`; null (check never succeeded) falls
  // through to the content so a slow/failed check can't lock out a paying rider
  // (the server still enforces a linked card at capture).
  hasMethod: boolean | null;
}

export function useHasPaymentMethod(): PaymentMethodStatus {
  const getToken = useStableToken();
  const [hasMethod, setHasMethod] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);

  const check = useCallback(async () => {
    try {
      const t = await getToken();
      const data = await apiClient<{ methods: PaymentMethod[] }>('/rider/payment-methods', t);
      setHasMethod((data.methods ?? []).length > 0);
    } catch {
      // Keep the last known value (or null = unknown). Do NOT assume "none" on
      // error — that would wrongly gate a rider who already has a card.
    } finally {
      setLoading(false);
      hasLoaded.current = true;
    }
  }, [getToken]);

  // First focus shows a spinner; later focuses (e.g. returning from
  // payment-setup) refresh silently so the gate clears in place.
  useFocusEffect(useCallback(() => {
    if (!hasLoaded.current) setLoading(true);
    void check();
  }, [check]));

  return { loading, hasMethod };
}
