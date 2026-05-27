// Rider ride detail — shows ride summary, ratings (both directions),
// rate-driver sheet for ended rides, and comment thread.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
  Modal, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RideDetail {
  id: string;
  ref_code: string | null;
  status: string;
  amount: number;
  final_agreed_price: number | null;
  driver_rating: string | null;
  rider_rating: string | null;
  driver_name: string | null;
  driver_handle: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  is_cash: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

interface CommentData {
  id: string;
  displayContent: string;
  isRedacted: boolean;
  adminNote: string | null;
  isVisible: boolean;
  parentId: string | null;
  authorId: string;
  authorHandle: string | null;
  authorName: string;
  authorRole: string;
  createdAt: string;
  replies?: CommentData[];
}

interface CommentsPayload {
  thread: CommentData[];
  canPost: boolean;
  postType: 'initial' | 'reply' | null;
  replyToId: string | null;
  maxChars: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RATING_META: Record<string, { emoji: string; label: string; color: string; bg: string; border: string }> = {
  chill:        { emoji: '✅', label: 'CHILL',        color: colors.green, bg: colors.greenDim,  border: colors.greenBorder  },
  cool_af:      { emoji: '😎', label: 'COOL AF',      color: colors.blue,  bg: colors.blueDim,   border: colors.blueBorder   },
  kinda_creepy: { emoji: '👀', label: 'KINDA CREEPY', color: colors.amber, bg: colors.amberDim,  border: colors.amberBorder  },
  weirdo:       { emoji: '🚩', label: 'WEIRDO',       color: colors.red,   bg: colors.redDim,    border: colors.redBorder    },
};

const RATING_OPTIONS = ['chill', 'cool_af', 'kinda_creepy', 'weirdo'] as const;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Comment bubble ───────────────────────────────────────────────────────────

function CommentBubble({ comment }: { comment: CommentData }) {
  const isRider = comment.authorRole === 'rider';
  const displayName = isRider
    ? (comment.authorHandle ? `@${comment.authorHandle}` : comment.authorName)
    : (comment.authorHandle ? `@${comment.authorHandle}` : comment.authorName);
  const body = comment.displayContent;

  return (
    <View style={[cb.wrap, isRider ? cb.riderWrap : cb.driverWrap]}>
      <View style={[cb.bubble, isRider ? cb.riderBubble : cb.driverBubble]}>
        <View style={cb.header}>
          <Text style={[cb.name, isRider ? cb.riderName : cb.driverName]}>{displayName}</Text>
          <Text style={cb.ts}>{new Date(comment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
        </View>
        <Text style={cb.body}>{body}</Text>
        {comment.isRedacted && (
          <Text style={cb.redactedNote}>Content moderated</Text>
        )}
      </View>
      {comment.replies?.map(reply => (
        <View key={reply.id} style={cb.replyIndent}>
          <CommentBubble comment={reply} />
        </View>
      ))}
    </View>
  );
}

const cb = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  riderWrap: { alignItems: 'flex-end' },
  driverWrap: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '85%', borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1,
  },
  riderBubble: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  driverBubble: { backgroundColor: colors.cardAlt, borderColor: colors.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm, marginBottom: 4 },
  name: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 0.5 },
  riderName: { color: colors.green },
  driverName: { color: colors.textTertiary },
  ts: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  redactedNote: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, marginTop: 4, fontStyle: 'italic' },
  replyIndent: { marginLeft: 20, marginTop: spacing.xs, width: '100%' },
});

// ─── Rating sheet ─────────────────────────────────────────────────────────────

function RatingSheet({
  visible,
  onRate,
  onClose,
  submitting,
}: {
  visible: boolean;
  onRate: (rating: string) => void;
  onClose: () => void;
  submitting: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={rs.overlay} onPress={onClose} />
      <View style={[rs.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={rs.handle} />
        <Text style={rs.title}>RATE YOUR DRIVER</Text>
        <Text style={rs.sub}>How was this ride?</Text>
        {RATING_OPTIONS.map(key => {
          const m = RATING_META[key];
          return (
            <TouchableOpacity
              key={key}
              style={[rs.optionRow, { borderColor: m.border, backgroundColor: m.bg }]}
              onPress={() => onRate(key)}
              disabled={submitting}
              activeOpacity={0.75}
            >
              <Text style={rs.optionEmoji}>{m.emoji}</Text>
              <Text style={[rs.optionLabel, { color: m.color }]}>{m.label}</Text>
              {submitting && <ActivityIndicator size="small" color={m.color} style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </Modal>
  );
}

const rs = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.xl, paddingTop: spacing.lg,
    borderWidth: 1, borderColor: colors.borderStrong,
  },
  handle: {
    width: 40, height: 4, backgroundColor: colors.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: spacing.lg,
  },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.textPrimary, marginBottom: spacing.xs },
  sub: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, marginBottom: spacing.xl },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.cardInner, padding: spacing.md,
    borderWidth: 1, marginBottom: spacing.sm,
  },
  optionEmoji: { fontSize: 20 },
  optionLabel: { fontFamily: fonts.monoBold, fontSize: 14, letterSpacing: 0.5 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RiderRideDetail() {
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const router = useRouter();
  const { id: rideId } = useLocalSearchParams<{ id: string }>();

  const [ride, setRide] = useState<RideDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Comments
  const [comments, setComments] = useState<CommentsPayload | null>(null);
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const MAX_CHARS = comments?.maxChars ?? 160;

  // Rating
  const [ratingSheet, setRatingSheet] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  // ── Fetch ride from history (contains enough fields) ──
  const fetchRide = useCallback(async () => {
    try {
      const t = await getToken();
      const data = await apiClient<{ rides: RideDetail[] }>('/rides/history', t);
      const found = data.rides?.find(r => r.id === rideId) ?? null;
      setRide(found);
    } catch {}
    finally { setLoading(false); }
  }, [getToken, rideId]);

  const fetchComments = useCallback(async () => {
    if (!rideId) return;
    setCommentLoading(true);
    try {
      const t = await getToken();
      const data = await apiClient<CommentsPayload>(`/rides/${rideId}/comments`, t);
      setComments(data);
    } catch {}
    finally { setCommentLoading(false); }
  }, [getToken, rideId]);

  useEffect(() => { void fetchRide(); }, [fetchRide]);
  useEffect(() => {
    if (ride && ['completed', 'ended'].includes(ride.status)) {
      void fetchComments();
    }
  }, [ride?.status, fetchComments]);

  // ── Rate driver ──
  async function submitRating(rating: string) {
    if (!rideId) return;
    setSubmittingRating(true);
    try {
      const t = await getToken();
      await apiClient(`/rides/${rideId}/rate`, t, {
        method: 'POST',
        body: JSON.stringify({ rating }),
      });
      setRatingSheet(false);
      await fetchRide();
      await fetchComments();
    } catch {}
    finally { setSubmittingRating(false); }
  }

  // ── Post comment ──
  async function submitComment() {
    if (!commentText.trim() || !comments?.canPost || !rideId) return;
    setSubmittingComment(true);
    try {
      const t = await getToken();
      const body: Record<string, unknown> = { rideId, content: commentText.trim() };
      if (comments.postType === 'reply' && comments.replyToId) {
        body.parentId = comments.replyToId;
      }
      await apiClient('/comments', t, { method: 'POST', body: JSON.stringify(body) });
      setCommentText('');
      await fetchComments();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    } catch {}
    finally { setSubmittingComment(false); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.notFound}>
          <Text style={s.notFoundText}>Ride not found</Text>
        </View>
      </View>
    );
  }

  const price = ride.final_agreed_price ?? ride.amount;
  const canRate = ride.status === 'ended' && ride.driver_rating == null;

  const driverRatingMeta = ride.driver_rating ? RATING_META[String(ride.driver_rating)] : null;
  const riderRatingMeta  = ride.rider_rating  ? RATING_META[String(ride.rider_rating)]  : null;
  const showComments = ['completed', 'ended'].includes(ride.status);

  const charsLeft = MAX_CHARS - commentText.length;

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Navbar */}
      <View style={[s.nav, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>RIDE {ride.ref_code ?? ride.id.slice(0, 6).toUpperCase()}</Text>
        <View style={s.navSpacer} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Route card */}
        <View style={[s.card, shadow.card]}>
          <Text style={s.sectionLabel}>ROUTE</Text>
          <View style={s.routeRow}>
            <View style={s.routeDot} />
            <Text style={s.routeAddr} numberOfLines={2}>{ride.pickup_address ?? 'Pickup'}</Text>
          </View>
          <View style={s.routeLine} />
          <View style={s.routeRow}>
            <View style={[s.routeDot, s.routeDotDest]} />
            <Text style={s.routeAddr} numberOfLines={2}>{ride.dropoff_address ?? 'Dropoff'}</Text>
          </View>
        </View>

        {/* Details card */}
        <View style={[s.card, shadow.card]}>
          <Text style={s.sectionLabel}>DETAILS</Text>
          <View style={s.detailsGrid}>
            <DetailRow label="DRIVER" value={ride.driver_handle ? `@${ride.driver_handle}` : ride.driver_name ?? '—'} />
            <DetailRow label="DATE"   value={fmtDate(ride.created_at)} />
            <DetailRow label="AMOUNT" value={`${ride.is_cash ? '💵 ' : ''}$${price.toFixed(2)}`} />
            <DetailRow label="STATUS" value={ride.status.toUpperCase()} />
          </View>
        </View>

        {/* Ratings */}
        {(driverRatingMeta || riderRatingMeta || canRate) && (
          <View style={[s.card, shadow.card]}>
            <Text style={s.sectionLabel}>RATINGS</Text>

            {driverRatingMeta && (
              <View style={s.ratingRow}>
                <Text style={s.ratingDir}>YOU RATED THE DRIVER</Text>
                <View style={[s.ratingPill, { backgroundColor: driverRatingMeta.bg, borderColor: driverRatingMeta.border }]}>
                  <Text style={s.ratingEmoji}>{driverRatingMeta.emoji}</Text>
                  <Text style={[s.ratingLabel, { color: driverRatingMeta.color }]}>{driverRatingMeta.label}</Text>
                </View>
              </View>
            )}

            {riderRatingMeta && (
              <View style={s.ratingRow}>
                <Text style={s.ratingDir}>DRIVER RATED YOU</Text>
                <View style={[s.ratingPill, { backgroundColor: riderRatingMeta.bg, borderColor: riderRatingMeta.border }]}>
                  <Text style={s.ratingEmoji}>{riderRatingMeta.emoji}</Text>
                  <Text style={[s.ratingLabel, { color: riderRatingMeta.color }]}>{riderRatingMeta.label}</Text>
                </View>
              </View>
            )}

            {canRate && (
              <TouchableOpacity style={s.rateBtn} onPress={() => setRatingSheet(true)} activeOpacity={0.8}>
                <Ionicons name="star-outline" size={14} color={colors.bg} />
                <Text style={s.rateBtnText}>RATE YOUR DRIVER</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Comments */}
        {showComments && (
          <View style={[s.card, shadow.card]}>
            <Text style={s.sectionLabel}>COMMENTS</Text>

            {commentLoading ? (
              <ActivityIndicator size="small" color={colors.green} style={{ marginVertical: spacing.md }} />
            ) : comments?.thread?.length === 0 ? (
              <Text style={s.noComments}>No comments yet. Be the first to leave a note.</Text>
            ) : (
              <View style={s.thread}>
                {comments?.thread?.map(c => <CommentBubble key={c.id} comment={c} />)}
              </View>
            )}

            {comments?.canPost && (
              <View style={s.commentInput}>
                <TextInput
                  style={s.input}
                  placeholder={
                    comments.postType === 'reply'
                      ? 'Reply to driver…'
                      : 'Leave a note about this ride…'
                  }
                  placeholderTextColor={colors.textFaint}
                  value={commentText}
                  onChangeText={t => setCommentText(t.slice(0, MAX_CHARS))}
                  multiline
                  maxLength={MAX_CHARS}
                />
                <View style={s.commentFooter}>
                  <Text style={[s.charCount, charsLeft < 20 && { color: colors.amber }]}>
                    {charsLeft}
                  </Text>
                  <TouchableOpacity
                    style={[s.sendBtn, (!commentText.trim() || submittingComment) && s.sendBtnDisabled]}
                    onPress={submitComment}
                    disabled={!commentText.trim() || submittingComment}
                    activeOpacity={0.8}
                  >
                    {submittingComment
                      ? <ActivityIndicator size="small" color={colors.bg} />
                      : <Ionicons name="send" size={16} color={colors.bg} />
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <RatingSheet
        visible={ratingSheet}
        onRate={submitRating}
        onClose={() => setRatingSheet(false)}
        submitting={submittingRating}
      />
    </KeyboardAvoidingView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={d.row}>
      <Text style={d.label}>{label}</Text>
      <Text style={d.value}>{value}</Text>
    </View>
  );
}

const d = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1 },
  value: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, maxWidth: '60%', textAlign: 'right' },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: 80 },

  nav: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs },
  navTitle: {
    flex: 1, textAlign: 'center', fontFamily: fonts.mono,
    fontSize: 13, color: colors.textPrimary, letterSpacing: 1.5,
  },
  navSpacer: { width: 30 },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontFamily: fonts.mono, fontSize: 13, color: colors.textFaint },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, borderWidth: 1, borderColor: colors.borderStrong,
  },
  sectionLabel: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint,
    letterSpacing: 2, marginBottom: spacing.md,
  },

  routeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  routeDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.green, flexShrink: 0,
  },
  routeDotDest: { backgroundColor: colors.textTertiary },
  routeLine: { width: 2, height: 16, backgroundColor: colors.border, marginLeft: 4, marginVertical: 2 },
  routeAddr: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, flex: 1 },

  detailsGrid: { gap: 0 },

  ratingsWrap: { gap: spacing.sm },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  ratingDir: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1 },
  ratingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1,
  },
  ratingEmoji: { fontSize: 14 },
  ratingLabel: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 0.5 },

  rateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 13, marginTop: spacing.sm,
  },
  rateBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1 },

  thread: { gap: spacing.xs, marginBottom: spacing.md },
  noComments: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginBottom: spacing.md },

  commentInput: {
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.borderStrong,
    padding: spacing.md, marginTop: spacing.sm,
  },
  input: {
    fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary,
    minHeight: 60, textAlignVertical: 'top',
  },
  commentFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  charCount: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },
  sendBtn: {
    backgroundColor: colors.green, width: 36, height: 36,
    borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.greenDim },
});
