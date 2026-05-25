'use client';

import { useCallback, useEffect, useState } from 'react';

const REACTIONS = [
  { key: 'like', emoji: '👍' },
  { key: 'heart', emoji: '❤️' },
  { key: 'haha', emoji: '😂' },
  { key: 'dislike', emoji: '👎' },
] as const;
type ReactionKey = typeof REACTIONS[number]['key'];

interface ReactionCount { reaction: ReactionKey; count: number }

interface CommentData {
  id: string;
  content: string;
  redacted_content: string | null;
  admin_note: string | null;
  created_at: string;
  author_handle: string | null;
  author_name: string | null;
  author_photo: string | null;
  reactions: ReactionCount[] | null;
  my_reaction: ReactionKey | null;
  replies: CommentData[];
}

interface Props {
  subjectHandle: string;
  subjectId: string;
  isAuthenticated: boolean;
  /** True when the current viewer is the subject of the comments (they can reply) */
  canReply: boolean;
  /** True when the viewer has completed a ride with the subject (server validates) */
  canComment: boolean;
}

export default function CommentsSection({
  subjectHandle, subjectId, isAuthenticated, canReply, canComment,
}: Props) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/comments/user/${subjectHandle}`);
      if (r.ok) {
        const data = await r.json();
        setComments(data.comments ?? []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [subjectHandle]);

  useEffect(() => { load(); }, [load]);

  async function submitComment() {
    if (!newText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newText.trim(), subjectId }),
      });
      if (r.ok) { setNewText(''); await load(); }
    } finally { setSubmitting(false); }
  }

  async function submitReply(parentId: string) {
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/comments/${parentId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyText.trim() }),
      });
      if (r.ok) { setReplyText(''); setReplyingTo(null); await load(); }
    } finally { setSubmitting(false); }
  }

  async function react(commentId: string, reaction: ReactionKey) {
    if (!isAuthenticated) return;
    await fetch(`/api/comments/${commentId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction }),
    });
    await load();
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        fontFamily: "var(--font-mono, 'Space Mono', monospace)",
        fontSize: 10, color: '#888', letterSpacing: 3,
        textTransform: 'uppercase', marginBottom: 12,
      }}>
        Comments
      </div>

      {loading && <Skeleton />}

      {!loading && comments.length === 0 && (
        <div style={{
          background: '#141414', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, padding: '20px 16px', textAlign: 'center',
          fontSize: 13, color: '#555',
        }}>
          No Comments
        </div>
      )}

      {!loading && comments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {comments.map(c => (
            <CommentCard
              key={c.id}
              comment={c}
              isAuthenticated={isAuthenticated}
              canReply={canReply}
              replyingTo={replyingTo}
              replyText={replyText}
              submitting={submitting}
              onReact={react}
              onReplyOpen={id => { setReplyingTo(id); setReplyText(''); }}
              onReplyClose={() => setReplyingTo(null)}
              onReplyChange={setReplyText}
              onReplySubmit={submitReply}
            />
          ))}
        </div>
      )}

      {canComment && isAuthenticated && (
        <div style={{ marginTop: 14 }}>
          <textarea
            value={newText}
            onChange={e => setNewText(e.target.value)}
            maxLength={500}
            placeholder="Leave a comment…"
            rows={3}
            style={{
              width: '100%', background: '#141414',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12, padding: '10px 14px',
              color: '#fff', fontSize: 13, resize: 'none',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              boxSizing: 'border-box', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: '#555' }}>{newText.length}/500</span>
            <button
              onClick={submitComment}
              disabled={!newText.trim() || submitting}
              style={{
                background: newText.trim() ? '#00E676' : '#1a1a1a',
                color: newText.trim() ? '#000' : '#555',
                border: 'none', borderRadius: 100, padding: '8px 20px',
                fontSize: 12, fontWeight: 700, cursor: newText.trim() ? 'pointer' : 'default',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {submitting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentCard({
  comment, isAuthenticated, canReply,
  replyingTo, replyText, submitting,
  onReact, onReplyOpen, onReplyClose, onReplyChange, onReplySubmit,
}: {
  comment: CommentData;
  isAuthenticated: boolean;
  canReply: boolean;
  replyingTo: string | null;
  replyText: string;
  submitting: boolean;
  onReact: (id: string, r: ReactionKey) => void;
  onReplyOpen: (id: string) => void;
  onReplyClose: () => void;
  onReplyChange: (v: string) => void;
  onReplySubmit: (id: string) => void;
}) {
  const displayContent = comment.redacted_content ?? comment.content;

  return (
    <div style={{
      background: '#141414', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: '12px 14px',
    }}>
      <CommentRow
        handle={comment.author_handle}
        photoUrl={comment.author_photo}
        content={displayContent}
        adminNote={comment.admin_note}
        createdAt={comment.created_at}
        reactions={comment.reactions}
        myReaction={comment.my_reaction}
        isAuthenticated={isAuthenticated}
        onReact={r => onReact(comment.id, r)}
      />

      {canReply && replyingTo !== comment.id && (
        <button
          onClick={() => onReplyOpen(comment.id)}
          style={{
            background: 'none', border: 'none', color: '#555', fontSize: 11,
            cursor: 'pointer', padding: '4px 0 0',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          Reply
        </button>
      )}

      {comment.replies.length > 0 && (
        <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: '2px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {comment.replies.map(r => (
            <CommentRow
              key={r.id}
              handle={r.author_handle}
              photoUrl={r.author_photo}
              content={r.redacted_content ?? r.content}
              adminNote={r.admin_note}
              createdAt={r.created_at}
              reactions={r.reactions}
              myReaction={r.my_reaction}
              isAuthenticated={isAuthenticated}
              onReact={rxn => onReact(r.id, rxn)}
            />
          ))}
        </div>
      )}

      {replyingTo === comment.id && (
        <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: '2px solid rgba(0,230,118,0.25)' }}>
          <textarea
            value={replyText}
            onChange={e => onReplyChange(e.target.value)}
            maxLength={500}
            placeholder="Your side of the story…"
            rows={2}
            autoFocus
            style={{
              width: '100%', background: '#1a1a1a',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '8px 12px',
              color: '#fff', fontSize: 12, resize: 'none',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              boxSizing: 'border-box', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button onClick={onReplyClose} style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 100, padding: '6px 14px',
              color: '#888', fontSize: 11, cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button
              onClick={() => onReplySubmit(comment.id)}
              disabled={!replyText.trim() || submitting}
              style={{
                background: replyText.trim() ? '#00E676' : '#1a1a1a',
                color: replyText.trim() ? '#000' : '#555',
                border: 'none', borderRadius: 100, padding: '6px 14px',
                fontSize: 11, fontWeight: 700,
                cursor: replyText.trim() ? 'pointer' : 'default',
              }}
            >
              {submitting ? '…' : 'Reply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentRow({
  handle, photoUrl, content, adminNote, createdAt,
  reactions, myReaction, isAuthenticated, onReact,
}: {
  handle: string | null;
  photoUrl: string | null;
  content: string;
  adminNote: string | null;
  createdAt: string;
  reactions: ReactionCount[] | null;
  myReaction: ReactionKey | null;
  isAuthenticated: boolean;
  onReact: (r: ReactionKey) => void;
}) {
  const reactionMap = Object.fromEntries((reactions ?? []).map(r => [r.reaction, r.count]));
  const initials = (handle ?? 'U').charAt(0).toUpperCase();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {photoUrl ? (
          <img src={photoUrl} alt={handle ?? ''} style={{
            width: 28, height: 28, borderRadius: '50%', objectFit: 'cover',
            border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0,
          }} />
        ) : (
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: '#222', border: '1px solid rgba(255,255,255,0.1)',
            flexShrink: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#888',
          }}>
            {initials}
          </div>
        )}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>@{handle ?? 'user'}</div>
          <div style={{ fontSize: 10, color: '#555' }}>{formatTimeAgo(createdAt)}</div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5, marginBottom: 8 }}>{content}</div>

      {adminNote && (
        <div style={{
          fontSize: 10, color: '#888', fontStyle: 'italic',
          marginBottom: 6, paddingLeft: 8,
          borderLeft: '2px solid rgba(255,255,255,0.1)',
        }}>
          {adminNote}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {REACTIONS.map(({ key, emoji }) => {
          const count = reactionMap[key] ?? 0;
          const isActive = myReaction === key;
          return (
            <button
              key={key}
              onClick={() => onReact(key)}
              style={{
                background: isActive ? 'rgba(0,230,118,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isActive ? 'rgba(0,230,118,0.3)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 100, padding: '3px 10px',
                cursor: isAuthenticated ? 'pointer' : 'default',
                fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <span>{emoji}</span>
              {count > 0 && (
                <span style={{ fontSize: 11, color: isActive ? '#00E676' : '#888' }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[0, 1].map(i => (
        <div key={i} style={{
          background: '#141414', borderRadius: 12, padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ width: 80, height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div style={{ width: '100%', height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ width: '70%', height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
        </div>
      ))}
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
