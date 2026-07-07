// Shared "Delete my account" screen for both rider and driver.
//
// This is a SOFT delete on the backend: the account is marked for deletion, the
// user loses all access and disappears from every other user's experience, and
// the Clerk user is removed so the phone frees up. Signing up again with the
// same number creates a brand-new account — nothing carries over.
//
// Requires an explicit type-to-confirm (the word DELETE) before the destructive
// action is enabled, plus a final native confirmation. POSTs /users/delete, then
// signs out — the root layout routes back to sign-in.

import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStableToken } from '@/hooks/use-stable-token';
import { apiClient } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';

const CONFIRM_WORD = 'DELETE';

const CONSEQUENCES = [
  'You lose access to this account right away.',
  'Your handle, profile, and photo disappear from the app — no one can find or book you.',
  'Your ride history and saved payment methods are closed out.',
  'Any HMU First subscription is cancelled so you stop being charged.',
];

export function DeleteAccountView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const getToken = useStableToken();
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canDelete = confirmText.trim().toUpperCase() === CONFIRM_WORD && !submitting;

  const doDelete = useCallback(async () => {
    setSubmitting(true);
    try {
      const t = await getToken();
      if (!t) throw new Error('You need to be signed in. Restart the app and try again.');
      await apiClient('/users/delete', t, { method: 'POST' });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Account + Clerk user are gone server-side; clear the local session. The
      // root auth gate routes to sign-in from here.
      await signOut();
    } catch (e: any) {
      setSubmitting(false);
      Alert.alert('Could not delete account', e?.message ?? 'Something went wrong. Try again.');
    }
  }, [getToken, signOut]);

  const confirmAndDelete = useCallback(() => {
    if (!canDelete) return;
    Alert.alert(
      'Delete your account?',
      'This can’t be undone. Everything on this account is closed out for good.',
      [
        { text: 'Keep my account', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: () => void doDelete() },
      ],
    );
  }, [canDelete, doDelete]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          disabled={submitting}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>DELETE ACCOUNT</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 44}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.warnIcon}>
            <Ionicons name="warning-outline" size={30} color={colors.red} />
          </View>

          <Text style={s.title}>This deletes your account for good</Text>
          <Text style={s.subtitle}>
            We keep a record for safety, but you won’t be able to get back into this
            account. Here’s what happens:
          </Text>

          <View style={s.card}>
            {CONSEQUENCES.map((line) => (
              <View key={line} style={s.bulletRow}>
                <Ionicons name="close-circle" size={16} color={colors.red} style={{ marginTop: 1 }} />
                <Text style={s.bulletText}>{line}</Text>
              </View>
            ))}
          </View>

          <View style={s.infoRow}>
            <Ionicons name="refresh-outline" size={15} color={colors.textTertiary} />
            <Text style={s.infoText}>
              You can sign up again later with the same number — it just starts a
              fresh account with nothing carried over.
            </Text>
          </View>

          <Text style={s.confirmLabel}>Type {CONFIRM_WORD} to confirm</Text>
          <TextInput
            style={s.input}
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={CONFIRM_WORD}
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!submitting}
            returnKeyType="done"
          />

          <TouchableOpacity
            style={[s.deleteBtn, !canDelete && s.deleteBtnDisabled]}
            onPress={confirmAndDelete}
            disabled={!canDelete}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={colors.red} />
            ) : (
              <Text style={[s.deleteText, !canDelete && s.deleteTextDisabled]}>
                DELETE MY ACCOUNT
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.cancelBtn}
            onPress={() => router.back()}
            disabled={submitting}
            activeOpacity={0.7}
          >
            <Text style={s.cancelText}>KEEP MY ACCOUNT</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  headerTitle: { fontFamily: fonts.mono, fontSize: 13, color: colors.textPrimary, letterSpacing: 2 },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.lg },

  warnIcon: {
    alignSelf: 'center', width: 60, height: 60, borderRadius: 30,
    backgroundColor: colors.redDim, borderWidth: 1, borderColor: colors.redBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fonts.display, fontSize: 28, color: colors.textPrimary,
    textAlign: 'center', marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl,
  },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.lg, gap: spacing.md,
    borderWidth: 1, borderColor: colors.redBorder, marginBottom: spacing.lg,
  },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bulletText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

  infoRow: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    marginBottom: spacing.xxl, paddingHorizontal: spacing.xs,
  },
  infoText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, lineHeight: 19 },

  confirmLabel: {
    fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary,
    letterSpacing: 1, marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.card, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    fontFamily: fonts.monoBold, fontSize: 16, color: colors.textPrimary,
    letterSpacing: 2, marginBottom: spacing.xl,
  },

  deleteBtn: {
    paddingVertical: 16, alignItems: 'center',
    backgroundColor: colors.redDim, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.redBorder, marginBottom: spacing.md,
  },
  deleteBtnDisabled: { opacity: 0.4 },
  deleteText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.red, letterSpacing: 1 },
  deleteTextDisabled: { color: colors.textTertiary },

  cancelBtn: { paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary, letterSpacing: 1 },
});
