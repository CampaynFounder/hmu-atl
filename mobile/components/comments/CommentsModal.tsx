// CommentsModal — full nested comment thread with CRUD + emoji reactions.
// Riders comment on driver profiles; drivers comment on rider profiles.
// Supports arbitrary-depth replies, edit + delete of your own comments, any-emoji
// reactions, and optimistic updates so every action feels instant (per the
// frontend-feel bar). The layout is flat/Instagram-style: compact rows, no boxy
// cards, clamped indentation so a deep thread never runs off-screen.
//
// Reads/writes:
//   GET    /comments/user/{handle}      → nested tree
//   POST   /comments/profile            → { subjectHandle, content, parentId? }
//   PATCH  /comments/{id}               → { content }
//   DELETE /comments/{id}
//   POST   /comments/{id}/react         → { reaction }   (any emoji; same = toggle off)
//
// AUTH — the modal is handed a `getToken` fn, NOT a captured token string. Clerk
// JWTs live ~60s; a token grabbed when the sheet opened is usually stale by the
// time someone reads the thread and taps Reply → the server rejects it as 401
// ("unauthorized when I reply"). We mint a FRESH token immediately before every
// network call instead.

import { useCallback, useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { EmojiPicker } from './EmojiPicker';

export interface CommentReaction { reaction: string; count: number }

export interface CommentNode {
  id: string;
  parent_id: string | null;
  content: string;
  redacted_content: string | null;
  author_id: string;
  author_handle: string | null;
  author_name: string | null;
  author_photo: string | null;
  created_at: string;
  edited_at: string | null;
  mine: boolean;
  reactions: CommentReaction[] | null;
  my_reaction: string | null;
  replies: CommentNode[];
}

// How far each nesting level shifts right, and where indentation STOPS growing.
// Beyond the cap replies stay readable (a thin thread line still marks depth) —
// this is what keeps deep chains from being squeezed off the right edge.
const INDENT_STEP = spacing.lg;
const MAX_INDENT_DEPTH = 3;

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function countAll(nodes: CommentNode[]): number {
  return nodes.reduce((n, c) => n + 1 + countAll(c.replies ?? []), 0);
}

// Recursively remove a subtree by id (optimistic delete).
function pruneTree(nodes: CommentNode[], id: string): CommentNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, replies: pruneTree(n.replies ?? [], id) }));
}

// Recursively update a node's content (optimistic edit).
function editInTree(nodes: CommentNode[], id: string, content: string): CommentNode[] {
  return nodes.map((n) =>
    n.id === id
      ? { ...n, content, edited_at: new Date().toISOString() }
      : { ...n, replies: editInTree(n.replies ?? [], id, content) },
  );
}

// Apply a reaction toggle to one node, mirroring the server: same emoji as your
// current one removes it; a different emoji replaces it; none adds it.
function toggleNodeReaction(node: CommentNode, emoji: string): CommentNode {
  const prev = node.my_reaction;
  let reactions = [...(node.reactions ?? [])];
  const dec = (r: string) => {
    reactions = reactions
      .map((x) => (x.reaction === r ? { ...x, count: x.count - 1 } : x))
      .filter((x) => x.count > 0);
  };
  const inc = (r: string) => {
    reactions = reactions.some((x) => x.reaction === r)
      ? reactions.map((x) => (x.reaction === r ? { ...x, count: x.count + 1 } : x))
      : [...reactions, { reaction: r, count: 1 }];
  };
  let mine: string | null = prev;
  if (prev === emoji) { dec(emoji); mine = null; }
  else { if (prev) dec(prev); inc(emoji); mine = emoji; }
  return { ...node, reactions, my_reaction: mine };
}

function reactInTree(nodes: CommentNode[], id: string, emoji: string): CommentNode[] {
  return nodes.map((n) =>
    n.id === id
      ? toggleNodeReaction(n, emoji)
      : { ...n, replies: reactInTree(n.replies ?? [], id, emoji) },
  );
}

export function CommentsModal({
  visible, onClose, handle, subjectLabel, getToken, accentColor = colors.green,
}: {
  visible: boolean;
  onClose: () => void;
  handle: string;
  subjectLabel?: string;
  getToken: () => Promise<string | null>;
  accentColor?: string;
}) {
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentNode | null>(null);
  const [editing, setEditing] = useState<CommentNode | null>(null);
  const [reactFor, setReactFor] = useState<CommentNode | null>(null); // open emoji picker for this comment

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const data = await apiClient<{ comments: CommentNode[] }>(`/comments/user/${handle}`, token);
      setComments(data.comments ?? []);
    } catch { /* leave prior state */ }
    finally { setLoading(false); }
  }, [handle, getToken]);

  useEffect(() => { if (visible) fetchTree(); }, [visible, fetchTree]);

  function resetComposer() {
    setText(''); setReplyTo(null); setEditing(null);
  }

  async function submit() {
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const token = await getToken();
      if (!token) { Alert.alert('Sign in', 'You need to be signed in to comment.'); return; }
      if (editing) {
        const target = editing;
        setComments((prev) => editInTree(prev, target.id, body));  // optimistic
        resetComposer();
        await apiClient(`/comments/${target.id}`, token, { method: 'PATCH', body: JSON.stringify({ content: body }) });
      } else {
        const parentId = replyTo?.id ?? null;
        resetComposer();
        await apiClient('/comments/profile', token, {
          method: 'POST',
          body: JSON.stringify({ subjectHandle: handle, content: body, parentId }),
        });
      }
      await fetchTree();  // reconcile with server truth
    } catch (e) {
      Alert.alert('Comment failed', e instanceof Error ? e.message : 'Try again.');
      await fetchTree();
    } finally {
      setPosting(false);
    }
  }

  async function del(node: CommentNode) {
    Alert.alert('Delete comment', 'This removes it and any replies.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setComments((prev) => pruneTree(prev, node.id));  // optimistic
          try {
            const token = await getToken();
            await apiClient(`/comments/${node.id}`, token, { method: 'DELETE' });
          } catch {
            await fetchTree();
          }
        },
      },
    ]);
  }

  const react = useCallback(async (node: CommentNode, emoji: string) => {
    setComments((prev) => reactInTree(prev, node.id, emoji));  // optimistic toggle
    try {
      const token = await getToken();
      if (!token) { await fetchTree(); return; }
      await apiClient(`/comments/${node.id}/react`, token, {
        method: 'POST',
        body: JSON.stringify({ reaction: emoji }),
      });
    } catch {
      await fetchTree();  // roll back to server truth
    }
  }, [getToken, fetchTree]);

  const total = countAll(comments);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.sheet}
        >
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Comments{total ? ` (${total})` : ''}</Text>
              {subjectLabel ? <Text style={s.subtitle}>on {subjectLabel}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Thread */}
          <ScrollView style={s.scroll} contentContainerStyle={{ paddingVertical: spacing.sm }}>
            {loading && comments.length === 0 ? (
              <ActivityIndicator color={accentColor} style={{ marginTop: spacing.xl }} />
            ) : comments.length === 0 ? (
              <Text style={s.empty}>No comments yet. Be the first.</Text>
            ) : (
              comments.map((c) => (
                <CommentRow
                  key={c.id} node={c} depth={0} accentColor={accentColor}
                  onReply={(n) => { setEditing(null); setReplyTo(n); }}
                  onEdit={(n) => { setReplyTo(null); setEditing(n); setText(n.content); }}
                  onDelete={del}
                  onReact={react}
                  onOpenPicker={(n) => setReactFor(n)}
                />
              ))
            )}
          </ScrollView>

          {/* Composer */}
          <View style={s.composer}>
            {(replyTo || editing) && (
              <View style={s.contextChip}>
                <Text style={s.contextText} numberOfLines={1}>
                  {editing ? 'Editing your comment' : `Replying to @${replyTo?.author_handle ?? replyTo?.author_name ?? 'comment'}`}
                </Text>
                <TouchableOpacity onPress={resetComposer} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textFaint} />
                </TouchableOpacity>
              </View>
            )}
            <View style={s.composerRow}>
              <TextInput
                style={s.input}
                value={text}
                onChangeText={setText}
                placeholder={editing ? 'Edit your comment…' : replyTo ? 'Write a reply…' : 'Add a comment…'}
                placeholderTextColor={colors.textFaint}
                multiline
                maxLength={300}
              />
              <TouchableOpacity
                style={[s.sendBtn, { backgroundColor: text.trim() ? accentColor : colors.cardAlt }]}
                onPress={submit}
                disabled={!text.trim() || posting}
              >
                {posting
                  ? <ActivityIndicator size="small" color={colors.bg} />
                  : <Ionicons name={editing ? 'checkmark' : 'arrow-up'} size={18} color={text.trim() ? colors.bg : colors.textFaint} />}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Any-emoji reaction picker */}
      <EmojiPicker
        visible={!!reactFor}
        accentColor={accentColor}
        onClose={() => setReactFor(null)}
        onSelect={(emoji) => { if (reactFor) react(reactFor, emoji); }}
      />
    </Modal>
  );
}

function CommentRow({
  node, depth, accentColor, onReply, onEdit, onDelete, onReact, onOpenPicker,
}: {
  node: CommentNode;
  depth: number;
  accentColor: string;
  onReply: (n: CommentNode) => void;
  onEdit: (n: CommentNode) => void;
  onDelete: (n: CommentNode) => void;
  onReact: (n: CommentNode, emoji: string) => void;
  onOpenPicker: (n: CommentNode) => void;
}) {
  const body = node.redacted_content ?? node.content;
  const authorLabel = node.author_handle ? `@${node.author_handle}` : (node.author_name ?? 'Anonymous');
  const initial = (authorLabel.replace(/^@/, '')[0] ?? '?').toUpperCase();
  const reactions = (node.reactions ?? []).filter((r) => r.count > 0);

  return (
    <View>
      {/* One comment: avatar + a flex column. Nested rows get a thin thread line. */}
      <View style={[s.row, depth > 0 && { marginLeft: INDENT_STEP, borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: spacing.md }]}>
        <Avatar uri={node.author_photo} size={depth > 0 ? 26 : 30} fallbackInitials={initial} />

        <View style={s.col}>
          <View style={s.metaTop}>
            <Text style={s.author} numberOfLines={1}>{authorLabel}</Text>
            <Text style={s.date}>{fmtDate(node.created_at)}{node.edited_at ? ' · edited' : ''}</Text>
          </View>

          <Text style={s.body}>{body}</Text>

          {/* Reaction pills */}
          {reactions.length > 0 && (
            <View style={s.reactRow}>
              {reactions.map((r) => {
                const mine = node.my_reaction === r.reaction;
                return (
                  <TouchableOpacity
                    key={r.reaction}
                    onPress={() => onReact(node, r.reaction)}
                    style={[s.pill, mine && { borderColor: accentColor, backgroundColor: colors.cardAlt }]}
                    hitSlop={6}
                  >
                    <Text style={s.pillEmoji}>{r.reaction}</Text>
                    <Text style={[s.pillCount, mine && { color: colors.textPrimary }]}>{r.count}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Actions */}
          <View style={s.actions}>
            <TouchableOpacity onPress={() => onReact(node, '❤️')} hitSlop={8} style={s.actionBtn}>
              <Ionicons
                name={node.my_reaction === '❤️' ? 'heart' : 'heart-outline'}
                size={14}
                color={node.my_reaction === '❤️' ? colors.pink : colors.textTertiary}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onOpenPicker(node)} hitSlop={8} style={s.actionBtn}>
              <Ionicons name="happy-outline" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onReply(node)} hitSlop={8}>
              <Text style={[s.action, { color: accentColor }]}>Reply</Text>
            </TouchableOpacity>
            {node.mine && (
              <>
                <TouchableOpacity onPress={() => onEdit(node)} hitSlop={8}>
                  <Text style={s.action}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(node)} hitSlop={8}>
                  <Text style={[s.action, { color: colors.red }]}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>

      {(node.replies ?? []).map((r) => (
        <CommentRow
          key={r.id}
          node={r}
          depth={Math.min(depth + 1, MAX_INDENT_DEPTH)}
          accentColor={accentColor}
          onReply={onReply} onEdit={onEdit} onDelete={onDelete}
          onReact={onReact} onOpenPicker={onOpenPicker}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { height: '82%', backgroundColor: colors.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, overflow: 'hidden' },

  header: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, marginTop: 2 },

  scroll: { flex: 1 },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl },

  // Flat Instagram-style comment: avatar + text column, no card box.
  row: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  col: { flex: 1, minWidth: 0 },
  metaTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  author: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.textSecondary, letterSpacing: 0.5, flexShrink: 1 },
  date: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, lineHeight: 19 },

  reactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pillEmoji: { fontSize: 12 },
  pillCount: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.textTertiary },

  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  actionBtn: { paddingVertical: 2 },
  action: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' },

  composer: { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, backgroundColor: colors.bg },
  contextChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.cardAlt, borderRadius: radius.tag, paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs, marginBottom: spacing.sm,
  },
  contextText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, flex: 1, marginRight: spacing.sm },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.cardInner, borderWidth: 1,
    borderColor: colors.border, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 14,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxHeight: 120,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
