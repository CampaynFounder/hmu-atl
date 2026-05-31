// CommentsAccordion — micro-animated expandable/collapsible comment thread.
// Fetches from GET /api/comments/user/[handle] on first open (lazy load).
// Used on driver cards (visible to riders) and rider cards (visible to drivers).

import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';

interface CommentItem {
  id: string;
  content: string;
  redacted_content: string | null;
  author_handle: string | null;
  author_name: string | null;
  created_at: string;
  replies?: CommentItem[];
}

export function CommentsAccordion({
  handle,
  token,
  accentColor = colors.textFaint,
}: {
  handle: string;
  token: string | null;
  accentColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Animated height via a wrapper with overflow hidden
  const heightAnim = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({
    maxHeight: withTiming(open ? 600 : 0, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    }),
    opacity: withTiming(open ? 1 : 0, { duration: 200 }),
    overflow: 'hidden',
  }));

  async function fetchComments() {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const data = await apiClient<{ comments: CommentItem[] }>(
        `/comments/user/${handle}`, token,
      );
      setComments(data.comments ?? []);
      setLoaded(true);
    } catch {}
    finally { setLoading(false); }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) fetchComments();
  }

  const count = loaded ? ` (${comments.length})` : '';

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.header} onPress={toggle} activeOpacity={0.7} hitSlop={8}>
        <Ionicons name="chatbubbles-outline" size={11} color={accentColor} />
        <Text style={[s.headerText, { color: accentColor }]}>
          {open ? 'HIDE COMMENTS' : `COMMENTS${count}`}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={11}
          color={accentColor}
        />
      </TouchableOpacity>

      <Animated.View style={animStyle}>
        <View style={s.body}>
          {loading ? (
            <ActivityIndicator
              size="small"
              color={colors.textFaint}
              style={{ marginVertical: spacing.sm }}
            />
          ) : !loaded ? null : comments.length === 0 ? (
            <Text style={s.empty}>No comments yet.</Text>
          ) : (
            comments.map(c => (
              <View key={c.id} style={s.comment}>
                <View style={s.commentTop}>
                  <Text style={s.commentAuthor}>
                    {c.author_handle ? `@${c.author_handle}` : (c.author_name ?? 'Anonymous')}
                  </Text>
                  <Text style={s.commentDate}>
                    {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
                <Text style={s.commentBody}>{c.redacted_content ?? c.content}</Text>

                {(c.replies ?? []).map(r => (
                  <View key={r.id} style={s.reply}>
                    <Text style={s.replyAuthor}>
                      ↳ {r.author_handle ? `@${r.author_handle}` : (r.author_name ?? 'Anonymous')}
                    </Text>
                    <Text style={s.replyBody}>{r.redacted_content ?? r.content}</Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: spacing.sm },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 4,
  },
  headerText: {
    fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, flex: 1,
  },

  body: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: spacing.sm, gap: spacing.sm,
  },

  comment: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderLeftWidth: 2, borderLeftColor: colors.borderStrong,
  },
  commentTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', marginBottom: 3,
  },
  commentAuthor: { fontFamily: fonts.monoBold, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.5 },
  commentDate: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint },
  commentBody: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },

  reply: { marginTop: spacing.xs, paddingLeft: spacing.sm },
  replyAuthor: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, marginBottom: 2 },
  replyBody: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, lineHeight: 16 },

  empty: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, paddingVertical: spacing.xs },
});
