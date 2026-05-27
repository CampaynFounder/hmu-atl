// In-app support chat — AI-backed, hits POST /api/chat/support.
// Conversation saves server-side; conversationId passed back each round.

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { apiClient } from '@/lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING: Message = {
  role: 'assistant',
  content: "Hey! I'm here to help with rides, payments, disputes, or anything else. What's going on?",
};

export default function SupportScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();

  useEffect(() => {
    if (messages.length > 1) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    Haptics.selectionAsync();

    const userMsg: Message = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const token = await getToken();
      const data = await apiClient<{ reply: string; conversationId: string }>(
        '/chat/support',
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            messages: nextMessages,
            conversationId,
          }),
        },
      );
      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting right now. Try again in a sec.",
      }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Nav */}
        <View style={s.navbar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View>
            <Text style={s.navTitle}>SUPPORT</Text>
            <Text style={s.navSub}>HMU ATL Team</Text>
          </View>
          <View style={s.onlineDot} />
        </View>

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 16 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => (
            <MessageBubble
              message={item}
              isFirst={index === 0}
              isLast={index === messages.length - 1}
            />
          )}
          ListFooterComponent={sending ? (
            <View style={s.thinkingRow}>
              <View style={s.thinkingBubble}>
                <ActivityIndicator size="small" color={colors.textFaint} />
                <Text style={s.thinkingText}>typing…</Text>
              </View>
            </View>
          ) : null}
        />

        {/* Input bar */}
        <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message…"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={1000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
            onPress={send}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-up" size={18} color={colors.bg} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message, isFirst }: { message: Message; isFirst: boolean; isLast: boolean }) {
  const isUser = message.role === 'user';
  return (
    <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowAssistant]}>
      {!isUser && isFirst && (
        <View style={s.avatarDot}>
          <Text style={s.avatarText}>H</Text>
        </View>
      )}
      {!isUser && !isFirst && <View style={s.avatarSpacer} />}
      <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAssistant]}>
        <Text style={[s.bubbleText, isUser && s.bubbleTextUser]}>{message.content}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  navbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  navTitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, letterSpacing: 2 },
  navSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 1 },
  onlineDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.green, marginLeft: 'auto',
    shadowColor: colors.green, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4,
  },

  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAssistant: { justifyContent: 'flex-start' },

  avatarDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontFamily: fonts.display, fontSize: 14, color: colors.green },
  avatarSpacer: { width: 28 },

  bubble: { maxWidth: '78%', borderRadius: radius.card, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  bubbleUser: { backgroundColor: colors.green, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
  bubbleTextUser: { color: colors.bg },

  thinkingRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  thinkingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.card,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  thinkingText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.card,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border, maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
});
