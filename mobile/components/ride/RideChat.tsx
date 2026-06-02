// Shared ride chat sheet — rider ↔ driver, used by both active screens.
// Mirrors the web ride-chat: message bubbles + status-gated quick-reply chips +
// a text input. Quick replies also fire an SMS to the other party server-side.

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Modal, KeyboardAvoidingView, Platform, Linking, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { ChatMessage } from './useRideMessages';
import { ViewerRole } from './types';

interface QuickMsg { key: string; label: string; emoji: string }

const RIDER_QUICK: QuickMsg[] = [
  { key: 'rider_eta', label: 'ETA?', emoji: '⏱' },
  { key: 'rider_wya', label: 'WYA?', emoji: '👀' },
  { key: 'rider_here', label: "I'm here", emoji: '📍' },
  { key: 'rider_late', label: 'Running late', emoji: '🏃' },
];
const DRIVER_QUICK: QuickMsg[] = [
  { key: 'driver_otw', label: 'OTW', emoji: '🚗' },
  { key: 'driver_5min', label: '5 min away', emoji: '⏱' },
  { key: 'driver_pulling_up', label: 'Pulling up', emoji: '🅿️' },
  { key: 'driver_here', label: "I'm here", emoji: '📍' },
  { key: 'driver_cantfind', label: "Can't find you", emoji: '❓' },
];

const QUICK_STATUSES = ['otw', 'here', 'confirming'];
const URL_RE = /(https?:\/\/[^\s]+)/;

function MessageBody({ content, mine }: { content: string; mine: boolean }) {
  const m = content.match(URL_RE);
  if (m) {
    const url = m[1];
    const isMap = /maps|google|goo\.gl|apple/.test(url);
    return (
      <TouchableOpacity onPress={() => Linking.openURL(url).catch(() => {})}>
        <Text style={[s.msgText, mine && s.msgTextMine, s.msgLink]}>
          {isMap ? '📍 Open in Maps' : url}
        </Text>
      </TouchableOpacity>
    );
  }
  return <Text style={[s.msgText, mine && s.msgTextMine]}>{content}</Text>;
}

export function RideChat({
  visible, onClose, messages, isMine, onSend, sending, viewerRole, rideStatus, otherName,
}: {
  visible: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  isMine: (m: ChatMessage) => boolean;
  onSend: (content: string, quickKey?: string) => void;
  sending: boolean;
  viewerRole: ViewerRole;
  rideStatus: string;
  otherName: string;
}) {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const [sentQuick, setSentQuick] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [visible, messages.length]);

  const quick = viewerRole === 'rider' ? RIDER_QUICK : DRIVER_QUICK;
  const showQuick = QUICK_STATUSES.includes(rideStatus);

  function sendQuick(q: QuickMsg) {
    if (sentQuick.has(q.key)) return;
    setSentQuick((prev) => new Set([...prev, q.key]));
    onSend(q.label, q.key);
  }

  function sendText() {
    const t = input.trim();
    if (!t) return;
    setInput('');
    onSend(t);
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.sm }]}>
            <View style={s.header}>
              <View style={s.handle} />
              <View style={s.headerRow}>
                <Text style={s.title}>CHAT — {otherName}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              ref={scrollRef}
              style={s.list}
              contentContainerStyle={{ paddingVertical: spacing.md, gap: spacing.sm }}
              keyboardShouldPersistTaps="handled"
            >
              {messages.length === 0 ? (
                <Text style={s.empty}>No messages yet. Say what&apos;s up 👋</Text>
              ) : (
                messages.map((m) => {
                  const mine = isMine(m);
                  return (
                    <View key={m.id} style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
                      <MessageBody content={m.content} mine={mine} />
                    </View>
                  );
                })
              )}
            </ScrollView>

            {showQuick && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.quickRow} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
                {quick.map((q) => {
                  const used = sentQuick.has(q.key);
                  return (
                    <TouchableOpacity key={q.key} style={[s.quickChip, used && s.quickChipUsed]} onPress={() => sendQuick(q)} disabled={used}>
                      <Text style={[s.quickChipText, used && { color: colors.textFaint }]}>{q.emoji} {q.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={input}
                onChangeText={setInput}
                placeholder="Message…"
                placeholderTextColor={colors.textFaint}
                maxLength={500}
                multiline
                onSubmitEditing={sendText}
                returnKeyType="send"
              />
              <TouchableOpacity style={[s.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]} onPress={sendText} disabled={!input.trim() || sending}>
                {sending ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="arrow-up" size={18} color={colors.bg} />}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card,
    borderTopWidth: 1, borderColor: colors.border, maxHeight: '80%',
  },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary, letterSpacing: 1.5 },
  list: { maxHeight: 380, paddingHorizontal: spacing.lg },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
  bubble: { maxWidth: '80%', borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.green },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  msgText: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, lineHeight: 19 },
  msgTextMine: { color: colors.bg },
  msgLink: { textDecorationLine: 'underline' },
  quickRow: { maxHeight: 44, paddingVertical: spacing.sm },
  quickChip: { borderWidth: 1, borderColor: colors.greenBorder, backgroundColor: colors.greenDim, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  quickChipUsed: { borderColor: colors.border, backgroundColor: colors.cardAlt },
  quickChipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.green, letterSpacing: 0.5 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  input: {
    flex: 1, maxHeight: 100, backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
});
