// Shared ride safety UI: an always-available SOS button, the scheduled
// check-in overlay ("YOU GOOD?"), and an escalation sheet (Notify HMU / Call 911).
// Driven by useRideSafety — the parent owns the hook so it can feed Ably prompts.

import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { DistressKind } from './useRideSafety';

interface RideSafetyProps {
  check: { checkId: string; secs: number } | null;
  respond: (response: 'ok' | 'alert', distress?: DistressKind) => void;
  distress: (kind: DistressKind) => void;
  sosOpen: boolean;
  setSosOpen: (v: boolean) => void;
  busy: boolean;
  bottom?: number; // vertical offset for the SOS button (to stack above other FABs)
}

function SosOptions({ onAdmin, onCall911, onClose, busy, title }: {
  onAdmin: () => void; onCall911: () => void; onClose: () => void; busy: boolean; title: string;
}) {
  return (
    <View style={s.sheet}>
      <Text style={s.sheetTitle}>{title}</Text>
      <TouchableOpacity style={[s.optBtn, { borderColor: colors.amberBorder, backgroundColor: colors.amberDim }]} onPress={onAdmin} disabled={busy}>
        <Ionicons name="shield-checkmark" size={18} color={colors.amber} />
        <Text style={[s.optText, { color: colors.amber }]}>Notify HMU Safety</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.optBtn, { borderColor: colors.redBorder, backgroundColor: colors.redDim }]} onPress={onCall911} disabled={busy}>
        <Ionicons name="call" size={18} color={colors.red} />
        <Text style={[s.optText, { color: colors.red }]}>Call 911</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.cancelBtn} onPress={onClose} disabled={busy}>
        <Text style={s.cancelText}>{busy ? 'Sending…' : "Never mind — I'm good"}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function RideSafety({ check, respond, distress, sosOpen, setSosOpen, busy, bottom = 88 }: RideSafetyProps) {
  const insets = useSafeAreaInsets();

  return (
    <>
      {/* Always-available SOS button (bottom-left, opposite the chat FAB) */}
      <TouchableOpacity style={[s.sosFab, { bottom }]} onPress={() => setSosOpen(true)} activeOpacity={0.85}>
        <Ionicons name="shield-half" size={20} color={colors.bg} />
      </TouchableOpacity>

      {/* Scheduled check-in overlay */}
      <Modal transparent visible={!!check} animationType="fade">
        <View style={s.overlay}>
          <View style={s.checkCard}>
            <Text style={s.checkEmoji}>🛟</Text>
            <Text style={s.checkTitle}>YOU GOOD?</Text>
            {!!check && <Text style={s.checkSub}>Auto-closes in {check.secs}s</Text>}
            <TouchableOpacity style={s.allGoodBtn} onPress={() => respond('ok')} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={s.allGoodText}>ALL GOOD 👍</Text>}
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <TouchableOpacity style={[s.miniBtn, { borderColor: colors.amberBorder }]} onPress={() => respond('alert', 'admin')} disabled={busy}>
                <Text style={[s.miniText, { color: colors.amber }]}>Notify HMU</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.miniBtn, { borderColor: colors.redBorder }]} onPress={() => respond('alert', '911')} disabled={busy}>
                <Text style={[s.miniText, { color: colors.red }]}>Call 911</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manual SOS sheet */}
      <Modal transparent visible={sosOpen} animationType="slide" onRequestClose={() => setSosOpen(false)}>
        <View style={s.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSosOpen(false)} />
          <View style={{ paddingBottom: insets.bottom + spacing.sm }}>
            <SosOptions
              title="WHAT'S UP?"
              busy={busy}
              onAdmin={() => distress('admin')}
              onCall911={() => distress('911')}
              onClose={() => setSosOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  sosFab: {
    position: 'absolute', left: spacing.xl, width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  checkCard: {
    backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, alignItems: 'center', width: '100%', maxWidth: 360,
  },
  checkEmoji: { fontSize: 40, marginBottom: spacing.sm },
  checkTitle: { fontFamily: fonts.display, fontSize: 30, color: colors.textPrimary, letterSpacing: 1 },
  checkSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 4, marginBottom: spacing.lg },
  allGoodBtn: {
    width: '100%', backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center',
  },
  allGoodText: { fontFamily: fonts.mono, fontSize: 15, color: colors.bg, letterSpacing: 1 },
  miniBtn: { flex: 1, borderWidth: 1, borderRadius: radius.pill, paddingVertical: spacing.sm, alignItems: 'center' },
  miniText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.5 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card,
    borderTopWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.sm,
  },
  sheetTitle: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary, letterSpacing: 2, marginBottom: spacing.sm },
  optBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: 1, borderRadius: radius.card, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  optText: { fontFamily: fonts.bodyMedium, fontSize: 15 },
  cancelBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  cancelText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
});
