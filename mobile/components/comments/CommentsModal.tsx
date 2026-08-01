// CommentsModal — full nested comment thread with CRUD.
// Riders comment on driver profiles; drivers comment on rider profiles.
// Supports arbitrary-depth replies, edit + delete of your own comments, and
// optimistic updates so every action feels instant (per the frontend-feel bar).
//
// Reads/writes:
//   GET    /comments/user/{handle}      → nested tree
//   POST   /comments/profile            → { subjectHandle, content, parentId? }
//   PATCH  /comments/{id}               → { content }
//   DELETE /comments/{id}

import { useCallback, useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';

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
  replies: CommentNode[];
}

const MAX_DEPTH_INDENT = 4;

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

export function CommentsModal({
  visible, onClose, handle, subjectLabel, token, accentColor = colors.green,
}: {
  visible: boolean;
  onClose: () => void;
  handle: string;
  subjectLabel?: string;
  token: string | null;
  accentColor?: string;
}) {
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentNode | null>(null);
  const [editing, setEditing] = useState<CommentNode | null>(null);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient<{ comments: CommentNode[] }>(`/comments/user/${handle}`, token);
      setComments(data.comments ?? []);
    } catch { /* leave prior state */ }
    finally { setLoading(false); }
  }, [handle, token]);

  useEffect(() => { if (visible) fetchTree(); }, [visible, fetchTree]);

  function resetComposer() {
    setText(''); setReplyTo(null); setEditing(null);
  }

  async function submit() {
    const body = text.trim();
    if (!body || posting) return;
    if (!token) { Alert.alert('Sign in', 'You need to be signed in to comment.'); return; }
    setPosting(true);
    try {
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
            await apiClient(`/comments/${node.id}`, token, { method: 'DELETE' });
          } catch {
            await fetchTree();
          }
        },
      },
    ]);
  }

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
          <ScrollView style={s.scroll} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
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
    </Modal>
  );
}

function CommentRow({
  node, depth, accentColor, onReply, onEdit, onDelete,
}: {
  node: CommentNode;
  depth: number;
  accentColor: string;
  onReply: (n: CommentNode) => void;
  onEdit: (n: CommentNode) => void;
  onDelete: (n: CommentNode) => void;
}) {
  const indent = Math.min(depth, MAX_DEPTH_INDENT) * spacing.md;
  const body = node.redacted_content ?? node.content;

  return (
    <View style={{ marginLeft: indent }}>
      <View style={[s.comment, depth > 0 && s.reply]}>
        <View style={s.commentTop}>
          <Text style={s.author}>
            {node.author_handle ? `@${node.author_handle}` : (node.author_name ?? 'Anonymous')}
          </Text>
          <Text style={s.date}>
            {fmtDate(node.created_at)}{node.edited_at ? ' · edited' : ''}
          </Text>
        </View>
        <Text style={s.body}>{body}</Text>
        <View style={s.actions}>
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

      {(node.replies ?? []).map((r) => (
        <CommentRow
          key={r.id} node={r} depth={depth + 1} accentColor={accentColor}
          onReply={onReply} onEdit={onEdit} onDelete={onDelete}
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

  comment: {
    backgroundColor: colors.card, borderRadius: radius.cardInner, padding: spacing.md,
    borderLeftWidth: 2, borderLeftColor: colors.borderStrong,
  },
  reply: { backgroundColor: colors.cardAlt, marginTop: spacing.sm },
  commentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  author: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.textSecondary, letterSpacing: 0.5 },
  date: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
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
