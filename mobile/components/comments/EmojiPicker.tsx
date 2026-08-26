// EmojiPicker — a pure-JS emoji picker (no native modules, OTA-safe).
// A bottom sheet with a quick-reaction row + a categorized, scrollable grid.
// Selecting an emoji calls onSelect and closes. Used for comment reactions so a
// user can react with ANY emoji, not a fixed set.

import { useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Pressable,
} from 'react-native';
import { colors, fonts, radius, spacing } from '@/lib/theme';

// The fast path — the reactions people reach for first (heart is prominent).
export const QUICK_REACTIONS = ['❤️', '😂', '🔥', '👍', '😮', '😢', '🙏', '💯'];

const CATEGORIES: { key: string; label: string; emojis: string[] }[] = [
  {
    key: 'smileys',
    label: 'Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊',
      '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜',
      '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '😐', '😑', '😶', '😏',
      '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
      '🥴', '😵', '🤯', '🥵', '🥶', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮',
      '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱',
      '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈',
      '👿', '💀', '💩', '🤡', '👻', '👽', '🤖',
    ],
  },
  {
    key: 'hearts',
    label: 'Hearts',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕',
      '💞', '💓', '💗', '💖', '💘', '💝', '💟', '❤️‍🔥', '❤️‍🩹', '💯', '💢',
      '💥', '💫', '💦', '💨', '✨', '🌟', '⭐',
    ],
  },
  {
    key: 'gestures',
    label: 'Hands',
    emojis: [
      '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈',
      '👉', '👆', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👏', '🙌', '🫶',
      '👐', '🤲', '🤝', '🙏', '✊', '👊', '🤛', '🤜', '💪', '🫵', '👀', '🫡',
    ],
  },
  {
    key: 'symbols',
    label: 'Symbols',
    emojis: [
      '🔥', '⚡', '💥', '💫', '⭐', '🌟', '✨', '💧', '🌊', '💨', '🎉', '🎊',
      '🎈', '🥳', '👑', '💎', '💰', '💵', '🏆', '🥇', '🎯', '✅', '❌', '⭕',
      '❗', '❓', '💤', '🚗', '🛞', '📍', '🗺️', '🔑', '⏰', '📈', '💬', '🗣️',
    ],
  },
  {
    key: 'life',
    label: 'Life',
    emojis: [
      '🍕', '🍔', '🌮', '🌯', '🍟', '🍩', '🍪', '🎂', '🍰', '🍦', '☕', '🍺',
      '🍻', '🥂', '🍷', '🍸', '🚬', '💊', '🌴', '🌸', '🌹', '🌈', '🌙', '☀️',
      '⛽', '🎵', '🎶', '🎸', '🏀', '⚽', '🎮', '📱', '💻', '📸', '🐶', '🐱',
    ],
  },
];

export function EmojiPicker({
  visible, onClose, onSelect, accentColor = colors.green,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  accentColor?: string;
}) {
  const [cat, setCat] = useState(CATEGORIES[0].key);
  const active = useMemo(() => CATEGORIES.find((c) => c.key === cat) ?? CATEGORIES[0], [cat]);

  function pick(e: string) { onSelect(e); onClose(); }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        {/* Stop propagation so taps inside the sheet don't dismiss it. */}
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.grabber} />

          <Text style={s.heading}>React</Text>

          {/* Quick row */}
          <View style={s.quickRow}>
            {QUICK_REACTIONS.map((e) => (
              <TouchableOpacity key={e} style={s.quickBtn} onPress={() => pick(e)} hitSlop={6}>
                <Text style={s.quickEmoji}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Category tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.key}
                onPress={() => setCat(c.key)}
                style={[s.tab, c.key === cat && { borderColor: accentColor, backgroundColor: colors.cardAlt }]}
              >
                <Text style={[s.tabText, c.key === cat && { color: colors.textPrimary }]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Grid */}
          <ScrollView contentContainerStyle={s.grid} keyboardShouldPersistTaps="handled">
            {active.emojis.map((e, i) => (
              <TouchableOpacity key={`${e}-${i}`} style={s.cell} onPress={() => pick(e)} hitSlop={4}>
                <Text style={s.cellEmoji}>{e}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    height: '62%', backgroundColor: colors.bg,
    borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card,
    paddingBottom: spacing.xl, overflow: 'hidden',
  },
  grabber: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong,
    alignSelf: 'center', marginTop: spacing.sm, marginBottom: spacing.sm,
  },
  heading: {
    fontFamily: fonts.display, fontSize: 20, color: colors.textPrimary,
    letterSpacing: 0.5, paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  quickRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  quickBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center',
  },
  quickEmoji: { fontSize: 22 },
  tabs: { flexGrow: 0, marginBottom: spacing.sm },
  tab: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.tag, borderWidth: 1, borderColor: colors.border,
  },
  tabText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs,
  },
  cell: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellEmoji: { fontSize: 26 },
});
