// Driver "why you passing?" sheet — RN parity of web components/driver/
// pass-reason-sheet.tsx. Shown when a driver passes on a DIRECT booking so the
// rider gets the reason in real time. One-tap chips + an optional note; the
// chosen reason ('price' | 'distance' | 'booked' | 'other') + message POST to
// the existing /bookings/{id}/decline rail.

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing } from '@/lib/theme';

export type PassReason = 'price' | 'distance' | 'booked' | 'other';

const MAX_MESSAGE = 140;

const REASONS: Array<{ key: PassReason; label: string; sub: string }> = [
  { key: 'price',    label: 'Price too low',       sub: "Offer is below what you'll do." },
  { key: 'booked',   label: 'Schedule conflict',   sub: "You're booked / busy then." },
  { key: 'distance', label: 'Too far / wrong way',  sub: "Distance or direction doesn't work." },
  { key: 'other',    label: 'Something else',       sub: 'Add a note below.' },
];

export function PassReasonSheet({
  open, onClose, onConfirm, riderHandle, secondaryLabel = 'Back',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: PassReason | null, message: string) => Promise<void> | void;
  riderHandle?: string | null;
  /** Label for the dismiss button. Use 'Skip' when the pass is already committed
   *  (e.g. swipe-to-pass) and the reason is an optional add-on. */
  secondaryLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<PassReason | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm(reason, message.trim());
      setReason(null);
      setMessage('');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setReason(null);
    setMessage('');
    onClose();
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.overlay} onPress={close} />
      <KeyboardAvoidingView
        style={s.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={s.handle} />
          <Text style={s.title}>WHY YOU PASSING?</Text>
          <Text style={s.sub}>
            {riderHandle ? `@${riderHandle} ` : 'The rider '}will see your reason — helps them adjust.
          </Text>

          <View style={s.chips}>
            {REASONS.map((r) => {
              const active = reason === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => setReason(active ? null : r.key)}
                  disabled={busy}
                  activeOpacity={0.8}
                >
                  <Text style={[s.chipLabel, active && { color: colors.green }]}>{r.label}</Text>
                  <Text style={s.chipSub}>{r.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.noteLabel}>NOTE TO RIDER (OPTIONAL)</Text>
          <TextInput
            style={s.note}
            value={message}
            onChangeText={(t) => setMessage(t.slice(0, MAX_MESSAGE))}
            placeholder="e.g. Can you do $20? I'd run it."
            placeholderTextColor={colors.textFaint}
            multiline
            editable={!busy}
          />
          <Text style={s.count}>{message.length}/{MAX_MESSAGE}</Text>

          <View style={s.actions}>
            <TouchableOpacity style={[s.btn, s.btnBack]} onPress={close} disabled={busy} activeOpacity={0.8}>
              <Text style={s.btnBackText}>{secondaryLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnPass]} onPress={submit} disabled={busy} activeOpacity={0.85}>
              {busy
                ? <ActivityIndicator size="small" color={colors.bg} />
                : <Text style={s.btnPassText}>PASS</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.72)' },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderColor: colors.borderStrong,
    paddingHorizontal: spacing.xl, paddingTop: spacing.md,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.textPrimary, textAlign: 'center', letterSpacing: 0.5 },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, textAlign: 'center', marginTop: 4, marginBottom: spacing.lg },
  chips: { gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    padding: spacing.md, borderRadius: radius.cardInner,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  chipLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  chipSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  noteLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2, marginBottom: spacing.xs },
  note: {
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary,
    minHeight: 60, textAlignVertical: 'top',
  },
  count: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, textAlign: 'right', marginTop: 4 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  btn: { flex: 1, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnBack: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderStrong },
  btnBackText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textTertiary },
  btnPass: { backgroundColor: colors.amber },
  btnPassText: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.bg, letterSpacing: 1 },
});
