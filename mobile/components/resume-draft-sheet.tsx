// ResumeDraftSheet — "Pick up where you left off?" prompt shown when a booking
// flow is re-entered within the draft TTL. Two choices: Resume (re-apply the
// saved inputs) or Start over (clear and begin fresh).
//
// Rendered only when a draft exists, so it never affects the flow otherwise.
// Modal is non-dismissable by backdrop tap — the user must pick — but the back
// button maps to "Start over" so there's always an escape that can't strand them.

import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';

interface Props {
  /** What they're resuming, e.g. "blast" or "ride request". */
  label?: string;
  onResume: () => void;
  onStartOver: () => void;
}

export function ResumeDraftSheet({ label = 'booking', onResume, onStartOver }: Props) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onStartOver}>
      <View style={s.overlay}>
        <View style={[s.card, shadow.card]}>
          <Text style={s.title}>PICK UP WHERE YOU LEFT OFF?</Text>
          <Text style={s.body}>
            You started a {label} a moment ago. Resume it, or start fresh.
          </Text>
          <TouchableOpacity style={s.resumeBtn} onPress={onResume} activeOpacity={0.85}>
            <Text style={s.resumeText}>RESUME</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.startOverBtn} onPress={onStartOver} activeOpacity={0.7}>
            <Text style={s.startOverText}>Start over</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  resumeBtn: {
    width: '100%',
    backgroundColor: colors.green,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  resumeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.bg,
    letterSpacing: 0.5,
  },
  startOverBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  startOverText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textTertiary,
  },
});
