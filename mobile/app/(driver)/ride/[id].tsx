import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Animated, Easing,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useStableToken } from '@/hooks/use-stable-token';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import type { RideRecord } from '../rides';

// ── Rating type display ───────────────────────────────────────────────────────

const RATING_META: Record<string, { emoji: string; label: string; color: string; bg: string; border: string }> = {
  chill:        { emoji: '✅', label: 'CHILL',        color: colors.green, bg: colors.greenDim, border: colors.greenBorder },
  cool_af:      { emoji: '😎', label: 'COOL AF',      color: colors.blue,  bg: colors.blueDim,  border: colors.blueBorder  },
  kinda_creepy: { emoji: '👀', label: 'KINDA CREEPY', color: colors.amber, bg: colors.amberDim, border: colors.amberBorder },
  weirdo:       { emoji: '🚩', label: 'WEIRDO',       color: colors.red,   bg: colors.redDim,   border: colors.redBorder   },
};

// ── Comment types ──────────────────────────────────────────────────────────────

interface CommentData {
  id: string;
  content: string;
  redacted_content: string | null;
  admin_note: string | null;
  is_visible: boolean;
  parent_id: string | null;
  author_id: string;
  author_role: string;
  driver_handle: string | null;
  driver_name: string | null;
  rider_handle: string | null;
  rider_name: string | null;
  created_at: string;
  replies?: CommentData[];
}

interface CommentsPayload {
  thread: CommentData[];
  canPost: boolean;
  postType: 'initial' | 'reply' | null;
  replyToId: string | null;
  maxChars: number;
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:     { label: 'PENDING',     color: colors.amber,        bg: colors.amberDim,  border: colors.amberBorder },
  matched:     { label: 'MATCHED',     color: colors.amber,        bg: colors.amberDim,  border: colors.amberBorder },
  accepted:    { label: 'ACCEPTED',    color: colors.amber,        bg: colors.amberDim,  border: colors.amberBorder },
  otw:         { label: 'EN ROUTE',    color: colors.blue,         bg: colors.blueDim,   border: colors.blueBorder  },
  here:        { label: 'ARRIVED',     color: colors.blue,         bg: colors.blueDim,   border: colors.blueBorder  },
  active:      { label: 'IN PROGRESS', color: colors.green,        bg: colors.greenDim,  border: colors.greenBorder },
  in_progress: { label: 'IN PROGRESS', color: colors.green,        bg: colors.greenDim,  border: colors.greenBorder },
  ended:       { label: 'COMPLETED',   color: colors.textTertiary, bg: colors.cardAlt,   border: colors.border      },
  completed:   { label: 'COMPLETED',   color: colors.textTertiary, bg: colors.cardAlt,   border: colors.border      },
  cancelled:   { label: 'CANCELLED',   color: colors.red,          bg: colors.redDim,    border: colors.redBorder   },
};

function statusMeta(s: string | null | undefined) {
  if (!s) return { label: 'UNKNOWN', color: colors.textFaint, bg: colors.cardAlt, border: colors.border };
  return STATUS[s] ?? { label: s.toUpperCase(), color: colors.textFaint, bg: colors.cardAlt, border: colors.border };
}

function formatTs(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' · '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function timeAgo(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RideDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const getToken = useStableToken();
  const params = useLocalSearchParams<{ id: string; d: string }>();

  // Comments state
  const [comments, setComments] = useState<CommentsPayload | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Card stagger animations
  const anims = useRef([0, 1, 2, 3, 4, 5].map(() => ({
    opacity: new Animated.Value(0),
    y: new Animated.Value(14),
  }))).current;

  useEffect(() => {
    Animated.stagger(
      70,
      anims.map(({ opacity, y }) =>
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(y, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ])
      )
    ).start();
  }, []);

  const fetchComments = useCallback(async (rideId: string) => {
    setCommentsLoading(true);
    try {
      const t = await getToken();
      const data = await apiClient<CommentsPayload>(`/rides/${rideId}/comments`, t);
      setComments(data);
    } catch { /* non-critical — comments section hidden on error */ }
    finally { setCommentsLoading(false); }
  }, [getToken]);

  useEffect(() => {
    if (!params.d || !params.id) return;
    const ride: RideRecord = JSON.parse(params.d);
    if (ride.status === 'completed' || ride.status === 'ended') {
      void fetchComments(params.id);
    }
  }, [params.id, params.d]);

  async function submitComment() {
    if (!commentText.trim() || !params.id || submitting) return;
    const maxChars = comments?.maxChars ?? 160;
    if (commentText.length > maxChars) return;

    const parentId = comments?.postType === 'reply' ? (comments?.replyToId ?? null) : null;

    setSubmitting(true);
    try {
      const t = await getToken();
      await apiClient('/comments', t, {
        method: 'POST',
        body: JSON.stringify({ rideId: params.id, content: commentText.trim(), parentId }),
      });
      setCommentText('');
      await fetchComments(params.id);
    } catch (e: any) {
      Alert.alert('Could not post', e.message ?? 'Try again');
    } finally {
      setSubmitting(false);
    }
  }

  if (!params.d) {
    return (
      <View style={[s.loader, { paddingTop: insets.top }]}>
        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.textFaint }}>
          Ride not found
        </Text>
      </View>
    );
  }

  const ride: RideRecord = JSON.parse(params.d);
  const meta = statusMeta(ride.status);

  const gross = Number(ride.final_agreed_price ?? ride.amount ?? 0);
  const fee = Number(ride.platform_fee_amount ?? 0);
  const kept = Number(ride.driver_payout_amount ?? (gross - fee));

  const driverRatingMeta = ride.driver_rating != null ? RATING_META[String(ride.driver_rating)] : null;
  const riderRatingMeta = ride.rider_rating != null ? RATING_META[String(ride.rider_rating)] : null;

  const isPostRide = ride.status === 'completed' || ride.status === 'ended';
  const maxChars = comments?.maxChars ?? 160;
  const charsLeft = maxChars - commentText.length;

  function card(index: number, children: React.ReactNode, extraStyle?: object) {
    const { opacity, y } = anims[index];
    return (
      <Animated.View style={[s.card, shadow.card, extraStyle, { opacity, transform: [{ translateY: y }] }]}>
        {children}
      </Animated.View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* ── Nav bar ── */}
        <View style={s.navbar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.navTitle}>RIDE DETAIL</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Status hero ── */}
          {card(0,
            <View style={s.heroInner}>
              <View style={[s.statusPill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                <Text style={[s.statusLabel, { color: meta.color }]}>{meta.label}</Text>
              </View>
              {ride.ref_code && (
                <Text style={s.refCode}>REF {ride.ref_code}</Text>
              )}
              <Text style={s.heroDate}>{formatTs(ride.created_at)}</Text>
            </View>,
            { borderColor: meta.border }
          )}

          {/* ── Route card ── */}
          {card(1,
            <>
              <Text style={s.cardLabel}>ROUTE</Text>
              <View style={s.routeWrap}>
                <View style={s.routeStop}>
                  <View style={s.routeIconCol}>
                    <View style={s.dotFrom} />
                    <View style={s.routeConnector} />
                  </View>
                  <View style={s.routeTextCol}>
                    <Text style={s.stopType}>PICKUP</Text>
                    <Text style={s.stopAddr}>{ride.pickup_address ?? '—'}</Text>
                  </View>
                </View>
                <View style={s.routeStop}>
                  <View style={s.routeIconCol}>
                    <Ionicons name="location" size={13} color={colors.green} />
                  </View>
                  <View style={s.routeTextCol}>
                    <Text style={s.stopType}>DROPOFF</Text>
                    <Text style={s.stopAddr}>{ride.dropoff_address ?? ride.destination ?? '—'}</Text>
                  </View>
                </View>
              </View>
            </>
          )}

          {/* ── Earnings card ── */}
          {card(2,
            <>
              <Text style={s.cardLabel}>EARNINGS</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                <AmountPill label="GROSS" value={`$${gross.toFixed(2)}`} color={colors.textPrimary} />
                <AmountPill label="FEES" value={fee > 0 ? `-$${fee.toFixed(2)}` : '$0.00'} color={fee > 0 ? colors.red : colors.textFaint} />
                <AmountPill label="KEPT" value={`$${kept.toFixed(2)}`} color={colors.green} highlight />
              </View>
              <View style={[s.typePill, ride.is_cash
                ? { backgroundColor: colors.cashDim, borderColor: colors.cashBorder }
                : { backgroundColor: colors.greenDim, borderColor: colors.greenBorder }
              ]}>
                <Ionicons
                  name={ride.is_cash ? 'cash-outline' : 'card-outline'}
                  size={12}
                  color={ride.is_cash ? colors.cash : colors.green}
                />
                <Text style={[s.typeText, { color: ride.is_cash ? colors.cash : colors.green }]}>
                  {ride.is_cash ? 'CASH RIDE' : 'DIGITAL RIDE'}
                </Text>
              </View>
              <View style={[s.typePill, { backgroundColor: colors.blueDim, borderColor: colors.blueBorder, marginTop: spacing.sm }]}>
                <Ionicons name="pricetag-outline" size={12} color={colors.blue} />
                <Text style={[s.typeText, { color: colors.blue }]}>
                  {(ride.booking_method ?? 'Direct').toUpperCase()}
                </Text>
              </View>
            </>
          )}

          {/* ── Rider + ratings card ── */}
          {(ride.rider_handle || ride.rider_name) && card(3,
            <>
              <Text style={s.cardLabel}>RIDER</Text>
              <View style={s.riderRow}>
                <View style={s.avatar}>
                  <Text style={s.avatarLetter}>
                    {(ride.rider_handle ?? ride.rider_name ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  {ride.rider_handle && <Text style={s.riderHandle}>@{ride.rider_handle}</Text>}
                  {ride.rider_name && <Text style={s.riderName}>{ride.rider_name}</Text>}
                </View>
              </View>
              {/* Ratings — both directions */}
              {(driverRatingMeta || riderRatingMeta) && (
                <View style={s.ratingsWrap}>
                  {driverRatingMeta && (
                    <View style={s.ratingRow}>
                      <Text style={s.ratingDir}>YOU RATED</Text>
                      <View style={[s.ratingPill, { backgroundColor: driverRatingMeta.bg, borderColor: driverRatingMeta.border }]}>
                        <Text style={s.ratingEmoji}>{driverRatingMeta.emoji}</Text>
                        <Text style={[s.ratingLabel, { color: driverRatingMeta.color }]}>{driverRatingMeta.label}</Text>
                      </View>
                    </View>
                  )}
                  {riderRatingMeta && (
                    <View style={s.ratingRow}>
                      <Text style={s.ratingDir}>THEY RATED YOU</Text>
                      <View style={[s.ratingPill, { backgroundColor: riderRatingMeta.bg, borderColor: riderRatingMeta.border }]}>
                        <Text style={s.ratingEmoji}>{riderRatingMeta.emoji}</Text>
                        <Text style={[s.ratingLabel, { color: riderRatingMeta.color }]}>{riderRatingMeta.label}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {/* ── Timeline card ── */}
          {card(4,
            <>
              <Text style={s.cardLabel}>TIMELINE</Text>
              <TimelineRow icon="ellipse" label="REQUESTED" value={formatTs(ride.created_at)} active />
              <TimelineRow icon="checkmark-circle" label="STARTED" value={formatTs(ride.started_at)} active={ride.started_at != null} />
              <TimelineRow icon="flag" label="ENDED" value={formatTs(ride.ended_at)} active={ride.ended_at != null} last />
            </>
          )}

          {/* ── Comments card — only on completed/ended rides ── */}
          {isPostRide && card(5,
            <>
              <Text style={s.cardLabel}>COMMENTS</Text>

              {commentsLoading ? (
                <ActivityIndicator size="small" color={colors.green} style={{ marginVertical: spacing.md }} />
              ) : (comments?.thread ?? []).length === 0 && !comments?.canPost ? (
                <Text style={s.emptyComments}>No comments on this ride.</Text>
              ) : (
                <>
                  {/* Existing comments */}
                  {(comments?.thread ?? []).map((c) => (
                    <CommentBubble key={c.id} comment={c} />
                  ))}

                  {/* Post form */}
                  {comments?.canPost && (
                    <View style={s.postWrap}>
                      <Text style={s.postHint}>
                        {comments.postType === 'reply' ? 'Reply to rider' : 'Leave a comment'}
                      </Text>
                      <View style={s.inputRow}>
                        <TextInput
                          style={s.input}
                          value={commentText}
                          onChangeText={setCommentText}
                          placeholder="Say something..."
                          placeholderTextColor={colors.textFaint}
                          multiline
                          maxLength={maxChars}
                          returnKeyType="default"
                        />
                        <TouchableOpacity
                          style={[s.sendBtn, (!commentText.trim() || submitting) && s.sendBtnDisabled]}
                          onPress={submitComment}
                          disabled={!commentText.trim() || submitting}
                        >
                          {submitting
                            ? <ActivityIndicator size="small" color={colors.bg} />
                            : <Ionicons name="send" size={15} color={colors.bg} />
                          }
                        </TouchableOpacity>
                      </View>
                      <Text style={[s.charCount, charsLeft < 20 && { color: colors.amber }]}>
                        {charsLeft} left
                      </Text>
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── CommentBubble ─────────────────────────────────────────────────────────────

function CommentBubble({ comment }: { comment: CommentData }) {
  const isDriver = comment.author_role === 'driver';
  const displayName = isDriver
    ? (comment.driver_handle ? `@${comment.driver_handle}` : comment.driver_name ?? 'Driver')
    : (comment.rider_handle ? `@${comment.rider_handle}` : comment.rider_name ?? 'Rider');
  const body = comment.redacted_content ?? comment.content;

  return (
    <View style={cb.wrap}>
      <View style={[cb.bubble, isDriver ? cb.bubbleDriver : cb.bubbleRider]}>
        <View style={cb.header}>
          <Text style={[cb.author, { color: isDriver ? colors.green : colors.blue }]}>{displayName}</Text>
          <Text style={cb.time}>{timeAgo(comment.created_at)}</Text>
        </View>
        <Text style={cb.body}>{body}</Text>
        {comment.admin_note && (
          <Text style={cb.modNote}>{comment.admin_note}</Text>
        )}
      </View>
      {/* Replies */}
      {(comment.replies ?? []).map((r) => (
        <View key={r.id} style={cb.replyWrap}>
          <CommentBubble comment={r} />
        </View>
      ))}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AmountPill({ label, value, color, highlight }: { label: string; value: string; color: string; highlight?: boolean }) {
  return (
    <View style={[s.amountPill, highlight && { borderColor: colors.greenBorder, backgroundColor: colors.greenDim }]}>
      <Text style={s.amountPillLabel}>{label}</Text>
      <Text style={[s.amountPillValue, { color }]}>{value}</Text>
    </View>
  );
}

function TimelineRow({ icon, label, value, active, last }: {
  icon: string; label: string; value: string; active: boolean; last?: boolean;
}) {
  return (
    <View style={tl.row}>
      <View style={tl.iconCol}>
        <Ionicons name={icon as any} size={14} color={active ? colors.green : colors.textFaint} />
        {!last && <View style={[tl.line, !active && { backgroundColor: colors.border }]} />}
      </View>
      <View style={tl.textCol}>
        <Text style={[tl.label, !active && { color: colors.textFaint }]}>{label}</Text>
        <Text style={[tl.value, !active && { color: colors.textFaint }]}>{value}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  navbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  navTitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, letterSpacing: 2 },

  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 3, marginBottom: spacing.md },

  heroInner: { alignItems: 'flex-start', gap: spacing.sm },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1 },
  statusLabel: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1.5 },
  refCode: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, letterSpacing: 1 },
  heroDate: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary },

  routeWrap: { gap: spacing.sm },
  routeStop: { flexDirection: 'row', gap: spacing.md },
  routeIconCol: { width: 16, alignItems: 'center', paddingTop: 2 },
  dotFrom: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textFaint, marginTop: 2 },
  routeConnector: { flex: 1, width: 1, backgroundColor: colors.border, marginVertical: 4 },
  routeTextCol: { flex: 1, paddingBottom: spacing.md },
  stopType: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1.5, marginBottom: 4 },
  stopAddr: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

  amountPill: { flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.cardInner, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  amountPillLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1, marginBottom: 4 },
  amountPillValue: { fontFamily: fonts.display, fontSize: 20 },

  typePill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
  typeText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 },

  riderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  avatarLetter: { fontFamily: fonts.display, fontSize: 22, color: colors.green },
  riderHandle: { fontFamily: fonts.mono, fontSize: 13, color: colors.textPrimary, letterSpacing: 0.5 },
  riderName: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary, marginTop: 2 },

  ratingsWrap: { gap: spacing.sm },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ratingDir: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1, width: 90 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  ratingEmoji: { fontSize: 14 },
  ratingLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.5 },

  emptyComments: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.md },

  postWrap: { marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg },
  postHint: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1.5, marginBottom: spacing.sm },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  input: {
    flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary,
    minHeight: 44, maxHeight: 120,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.cardAlt },
  charCount: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, marginTop: spacing.xs, textAlign: 'right' },
});

const tl = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  iconCol: { width: 20, alignItems: 'center' },
  line: { flex: 1, width: 1, backgroundColor: colors.green, marginTop: 4, minHeight: 20 },
  textCol: { flex: 1, paddingBottom: spacing.sm },
  label: { fontFamily: fonts.mono, fontSize: 9, color: colors.green, letterSpacing: 1.5, marginBottom: 3 },
  value: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
});

const cb = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  bubble: {
    borderRadius: radius.cardInner, padding: spacing.md,
    borderWidth: 1,
  },
  bubbleDriver: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  bubbleRider: { backgroundColor: colors.cardAlt, borderColor: colors.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  author: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 0.5 },
  time: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint },
  body: { fontFamily: fonts.body, fontSize: 13, color: colors.textPrimary, lineHeight: 20 },
  modNote: { fontFamily: fonts.mono, fontSize: 10, color: colors.amber, marginTop: 4 },
  replyWrap: { marginTop: spacing.xs, marginLeft: spacing.lg },
});
