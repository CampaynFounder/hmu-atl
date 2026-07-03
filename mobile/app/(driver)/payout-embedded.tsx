// Driver payout onboarding — Stripe embedded Connect flow inside an IN-APP
// WebView. No external browser bounce: the driver stays inside HMU, we control
// the chrome, and completion lands on a gamified "PAYOUTS UNLOCKED" celebration.
//
// Reached from payout-setup.tsx / onboarding.tsx when payoutMode === 'embedded'
// (the default; feature flag driver_payout_native_forms is OFF). The WebView
// loads /driver/payout-setup/embedded-mobile (a public page) and we inject the
// Clerk token as window.__HMU_TOKEN so it can create the AccountSession without
// cookies. The page postMessages {type:'exit'} when the driver finishes; we then
// re-check /driver/payout-setup and celebrate if payouts are live.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useStableToken } from '@/hooks/use-stable-token';
import { apiClient, API_BASE } from '@/lib/api';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';

const WEB_BASE = API_BASE.replace(/\/api\/?$/, '');
const EMBED_URL = `${WEB_BASE}/driver/payout-setup/embedded-mobile`;

interface PayoutStatus {
  setupComplete?: boolean;
  stripeComplete?: boolean;
  stripeAccount?: { last4?: string | null; type?: string | null; bank?: string | null; instantEligible?: boolean | null } | null;
}

type Phase = 'loading' | 'onboarding' | 'checking' | 'done' | 'error';

export default function PayoutEmbedded() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const getToken = useStableToken();

  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [status, setStatus] = useState<PayoutStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getToken().then((t) => {
      if (cancelled) return;
      if (!t) { setPhase('error'); return; }
      setToken(t);
      setPhase('onboarding');
    });
    return () => { cancelled = true; };
  }, [getToken]);

  // After the embedded flow exits, re-pull authoritative status. Celebrate if
  // payouts are live; otherwise return to the setup screen (which shows the
  // in-review state) rather than a fake success.
  const checkStatus = useCallback(async () => {
    setPhase('checking');
    try {
      const t = await getToken();
      const s = await apiClient<PayoutStatus>('/driver/payout-setup', t);
      setStatus(s);
      if (s.setupComplete || s.stripeComplete) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPhase('done');
      } else {
        router.back();
      }
    } catch {
      router.back();
    }
  }, [getToken, router]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: { type?: string } = {};
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === 'exit') void checkStatus();
    else if (msg.type === 'error') setPhase('error');
  }, [checkStatus]);

  // ─── Celebration ───────────────────────────────────────────────────────────
  if (phase === 'done') {
    const acct = status?.stripeAccount;
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top, padding: spacing.xl }]}>
        <Animated.View entering={ZoomIn.duration(420)} style={s.celebrateIcon}>
          <Ionicons name="checkmark-circle" size={72} color={colors.green} />
        </Animated.View>
        <Animated.Text entering={FadeIn.delay(150)} style={s.celebrateTitle}>PAYOUTS UNLOCKED</Animated.Text>
        <Animated.Text entering={FadeIn.delay(250)} style={s.celebrateBody}>
          You&apos;re set to get paid{acct?.bank ? ` to ${acct.bank}` : ''}{acct?.last4 ? ` ••${acct.last4}` : ''}. Every ride pays out straight here.
        </Animated.Text>
        {acct?.instantEligible ? (
          <Animated.View entering={FadeIn.delay(350)} style={s.instantBadge}>
            <Ionicons name="flash" size={13} color={colors.green} />
            <Text style={s.instantText}>INSTANT PAYOUTS ELIGIBLE</Text>
          </Animated.View>
        ) : null}
        <Animated.View entering={FadeIn.delay(450)} style={{ width: '100%', marginTop: spacing.xxl }}>
          <TouchableOpacity style={s.cta} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={s.ctaText}>START EARNING</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.bg} />
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top, padding: spacing.xl }]}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.red} />
        <Text style={s.errorTitle}>COULDN&apos;T LOAD PAYOUT SETUP</Text>
        <Text style={s.errorBody}>Check your connection and try again.</Text>
        <TouchableOpacity style={[s.cta, { marginTop: spacing.xl }]} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={s.ctaText}>GO BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Onboarding (WebView) + loading/checking overlays ───────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.closeBtn} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>PAYOUT SETUP</Text>
        <View style={{ width: 40 }} />
      </View>

      {phase === 'onboarding' && token ? (
        <WebView
          source={{ uri: EMBED_URL }}
          injectedJavaScriptBeforeContentLoaded={`window.__HMU_TOKEN=${JSON.stringify(token)};true;`}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['https://*']}
          allowsInlineMediaPlayback
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          startInLoadingState
          renderLoading={() => (
            <View style={[s.center, s.webLoading]}>
              <ActivityIndicator size="large" color={colors.green} />
            </View>
          )}
          style={s.web}
        />
      ) : (
        <View style={[s.center, { flex: 1 }]}>
          <ActivityIndicator size="large" color={colors.green} />
          <Text style={s.checkingText}>
            {phase === 'checking' ? 'Confirming your payout account…' : 'Loading…'}
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textPrimary, letterSpacing: 1.5 },
  web: { flex: 1, backgroundColor: colors.bg },
  webLoading: { flex: 1, backgroundColor: colors.bg },
  checkingText: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, marginTop: spacing.md },

  celebrateIcon: {
    width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, marginBottom: spacing.lg,
  },
  celebrateTitle: { fontFamily: fonts.display, fontSize: 34, color: colors.green, letterSpacing: 1, textAlign: 'center' },
  celebrateBody: { fontFamily: fonts.body, fontSize: 15, color: colors.textTertiary, textAlign: 'center', lineHeight: 22, marginTop: spacing.md },
  instantBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.lg,
    backgroundColor: colors.greenDim, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: colors.greenBorder,
  },
  instantText: { fontFamily: fonts.mono, fontSize: 10, color: colors.green, letterSpacing: 1 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.green, borderRadius: radius.pill, paddingVertical: 16,
  },
  ctaText: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.bg, letterSpacing: 1.5 },
  errorTitle: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.textPrimary, letterSpacing: 1, marginTop: spacing.md, textAlign: 'center' },
  errorBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, marginTop: spacing.sm, textAlign: 'center' },
});
