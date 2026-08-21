// CommentActivityScreen — the in-app "Activity" inbox listing comments left on
// your profile and replies to your comments. Tapping an item opens the full
// thread (CommentsModal) on that profile so you can reply in one tap.
//
// Shared by both (rider)/activity and (driver)/activity. Reads everything from
// the notifications context (which keeps the list + unread count fresh in
// realtime); opening the screen marks everything seen.

import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStableToken } from '@/hooks/use-stable-token';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { CommentsModal } from '@/components/comments/CommentsModal';
import { useNotifications, type CommentActivityItem } from '@/contexts/notifications';

// Compact relative time — "now", "5m", "3h", "2d", else a short date.
function timeAgo(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'now';
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

export function CommentActivityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const getToken = useStableToken();
  const {
    commentActivity, refreshCommentActivity, markCommentsSeen,
  } = useNotifications();

  const [refreshing, setRefreshing] = useState(false);
  const [openHandle, setOpenHandle] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Opening the inbox = you've seen these. Mark seen + pull the latest.
  useFocusEffect(useCallback(() => {
    markCommentsSeen();
    refreshCommentActivity();
  }, [markCommentsSeen, refreshCommentActivity]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshCommentActivity();
    // The context fetch is fire-and-forget; give it a beat, then release the spinner.
    setTimeout(() => setRefreshing(false), 600);
  }, [refreshCommentActivity]);

  const openThread = useCallback(async (item: CommentActivityItem) => {
    const t = await getToken();
    setToken(t);
    setOpenHandle(item.subjectHandle);
  }, [getToken]);

  const renderItem = useCallback(({ item }: { item: CommentActivityItem }) => {
    const who = item.authorHandle ? `@${item.authorHandle}` : (item.authorName ?? 'Someone');
    const verb = item.kind === 'comment_on_profile' ? 'commented on your profile' : 'replied to your comment';
    return (
      <TouchableOpacity style={s.row} onPress={() => openThread(item)} activeOpacity={0.75}>
        <Avatar uri={item.authorPhoto} size={40} fallbackInitials={(who.replace(/^@/, '')[0] ?? '?').toUpperCase()} />
        <View style={s.rowBody}>
          <Text style={s.rowTop} numberOfLines={1}>
            <Text style={s.who}>{who}</Text>
            <Text style={s.verb}> {verb}</Text>
          </Text>
          <Text style={s.preview} numberOfLines={2}>{item.preview}</Text>
        </View>
        <View style={s.rowRight}>
          <Text style={s.time}>{timeAgo(item.createdAt)}</Text>
          {item.unread && <View style={s.unreadDot} />}
        </View>
      </TouchableOpacity>
    );
  }, [openThread]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={s.title}>ACTIVITY</Text>
        <View style={s.backBtn} />
      </View>

      <FlatList
        data={commentActivity}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={commentActivity.length === 0 ? s.emptyWrap : s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        ListEmptyComponent={(
          <View style={s.empty}>
            <Ionicons name="chatbubbles-outline" size={40} color={colors.textFaint} />
            <Text style={s.emptyTitle}>No comments yet</Text>
            <Text style={s.emptyBody}>When someone comments on your photo, it&apos;ll show up here.</Text>
          </View>
        )}
        windowSize={7}
        initialNumToRender={12}
        removeClippedSubviews
      />

      <CommentsModal
        visible={!!openHandle}
        onClose={() => { setOpenHandle(null); refreshCommentActivity(); }}
        handle={openHandle ?? ''}
        token={token}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary, letterSpacing: 0.5 },

  listContent: { padding: spacing.md },
  sep: { height: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.cardInner, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  rowBody: { flex: 1 },
  rowTop: { marginBottom: 2 },
  who: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textPrimary, letterSpacing: 0.3 },
  verb: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },
  preview: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  rowRight: { alignItems: 'flex-end', gap: 6, marginLeft: spacing.xs },
  time: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },

  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.textSecondary, marginTop: spacing.sm },
  emptyBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textAlign: 'center' },
});
