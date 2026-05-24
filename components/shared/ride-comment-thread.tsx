'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ThreadComment {
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
  replies?: ThreadComment[];
}

interface ThreadData {
  thread: ThreadComment[];
  canPost: boolean;
  postType: 'initial' | 'reply' | null;
  replyToId: string | null;
  maxChars: number;
}

interface Props {
  rideId: string;
  role: 'rider' | 'driver';
}

export default function RideCommentThread({ rideId, role }: Props) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rides/${rideId}/comments`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    if (open && !data) load();
  }, [open, data, load]);

  async function handleSubmit() {
    if (!data || !text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string> = {
        rideId,
        content: text.trim(),
      };
      if (data.postType === 'reply' && data.replyToId) {
        body.parentId = data.replyToId;
      }
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to post');
        return;
      }
      setText('');
      setData(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const maxChars = data?.maxChars ?? 160;
  const remaining = maxChars - text.length;
  const hasThread = (data?.thread?.length ?? 0) > 0;
  const showCta = !open && (hasThread || data?.canPost);

  const ctaLabel = !data
    ? (role === 'rider' ? 'Leave a comment' : 'Leave a response')
    : !hasThread
      ? (role === 'rider' ? 'Leave a comment' : data.canPost ? 'Leave a response' : 'No comments yet')
      : (data.canPost
          ? (role === 'driver' ? 'Leave a response' : 'Add a comment')
          : 'View comments');

  // Only disable after data has loaded and we've confirmed the user can't post.
  // While data === null we don't know yet — keep the button active so clicking opens the thread.
  const ctaDisabled = data !== null && !hasThread && !data.canPost;

  return (
    <div style={{ marginTop: 10 }}>
      {/* Collapsed CTA */}
      {!open && (
        <button
          type="button"
          onClick={() => {
            if (!ctaDisabled) setOpen(true);
          }}
          disabled={!loading && ctaDisabled}
          style={{
            width: '100%', padding: '9px', borderRadius: 100,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${hasThread ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.1)'}`,
            color: hasThread ? '#00E676' : '#888',
            fontSize: 12, fontWeight: 600, cursor: ctaDisabled ? 'default' : 'pointer',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            opacity: ctaDisabled ? 0.5 : 1,
            transition: 'border-color 0.15s, color 0.15s',
          }}
        >
          {loading ? '…' : (hasThread
            ? `💬 ${data!.thread.length + data!.thread.reduce((s, c) => s + (c.replies?.length ?? 0), 0)} comment${(data!.thread.length + data!.thread.reduce((s, c) => s + (c.replies?.length ?? 0), 0)) !== 1 ? 's' : ''}`
            : ctaLabel)}
        </button>
      )}

      {/* Expanded thread */}
      {open && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
              Ride Comments
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#555', fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {loading && !data && (
            <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Loading…</div>
          )}

          {/* Thread — scrollable when comments stack up */}
          {hasThread && (
            <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 8 }}>
              {data!.thread.map(comment => (
                <CommentBubble key={comment.id} comment={comment} />
              ))}
            </div>
          )}

          {!loading && data && !hasThread && !data.canPost && (
            <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
              No comments yet
            </div>
          )}

          {/* Compose */}
          {data?.canPost && (
            <div style={{ marginTop: hasThread ? 10 : 0 }}>
              {hasThread && data.postType === 'reply' && (
                <div style={{ fontSize: 11, color: '#555', marginBottom: 6, paddingLeft: 20 }}>
                  ↳ Your response
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => setText(e.target.value)}
                maxLength={maxChars}
                autoFocus
                placeholder={
                  data.postType === 'reply'
                    ? 'Leave your response…'
                    : role === 'driver'
                      ? 'Leave a comment for your rider…'
                      : 'Leave a comment for your driver…'
                }
                rows={3}
                style={{
                  width: '100%', background: '#141414',
                  border: `1px solid ${remaining < 0 ? 'rgba(255,82,82,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 10, padding: '10px 12px', color: '#fff',
                  fontSize: 13, resize: 'none', outline: 'none',
                  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                  boxSizing: 'border-box', lineHeight: 1.5,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: remaining < 20 ? (remaining < 0 ? '#FF5252' : '#FFD740') : '#555' }}>
                  {remaining} left
                </span>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !text.trim() || remaining < 0}
                  style={{
                    padding: '7px 18px', borderRadius: 100,
                    background: (submitting || !text.trim() || remaining < 0) ? 'rgba(255,255,255,0.08)' : '#00E676',
                    color: (submitting || !text.trim() || remaining < 0) ? '#555' : '#080808',
                    border: 'none', fontSize: 12, fontWeight: 700,
                    cursor: (submitting || !text.trim() || remaining < 0) ? 'not-allowed' : 'pointer',
                    fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                    transition: 'background 0.15s',
                  }}
                >
                  {submitting ? 'Posting…' : 'Post'}
                </button>
              </div>
              {error && <div style={{ fontSize: 12, color: '#FF5252', marginTop: 4 }}>{error}</div>}
            </div>
          )}

          {/* Already commented — no more posts */}
          {data && !data.canPost && hasThread && (
            <div style={{ fontSize: 11, color: '#555', textAlign: 'center', marginTop: 8 }}>
              {role === 'rider' ? 'You left a comment on this ride.' : 'You responded on this ride.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CommentBubble({ comment, indent = false }: { comment: ThreadComment; indent?: boolean }) {
  const displayName = comment.authorHandle ? `@${comment.authorHandle}` : comment.authorName;
  const roleLabel = comment.authorRole === 'rider' ? 'Rider' : 'Driver';
  const roleColor = comment.authorRole === 'rider' ? '#448AFF' : '#00E676';

  if (!comment.isVisible) return null;

  return (
    <div style={{ marginBottom: 8, paddingLeft: indent ? 20 : 0 }}>
      {indent && (
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', left: -12, top: 0, bottom: 0,
            width: 1, background: 'rgba(255,255,255,0.08)',
          }} />
        </div>
      )}
      <div style={{
        background: indent ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
        borderRadius: 10, padding: '9px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: roleColor,
            background: `${roleColor}15`, borderRadius: 100, padding: '1px 7px' }}>
            {roleLabel}
          </span>
          <span style={{ fontSize: 11, color: '#888' }}>{displayName}</span>
          <span style={{ fontSize: 10, color: '#444', marginLeft: 'auto' }}>
            {new Date(comment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
        <div style={{ fontSize: 13, color: comment.isRedacted ? '#888' : '#ddd', fontStyle: comment.isRedacted ? 'italic' : 'normal', lineHeight: 1.5 }}>
          {comment.displayContent}
        </div>
        {comment.adminNote && (
          <div style={{ fontSize: 11, color: '#666', marginTop: 4, fontStyle: 'italic' }}>
            {comment.adminNote}
          </div>
        )}
      </div>
      {comment.replies?.map(r => (
        <CommentBubble key={r.id} comment={r} indent />
      ))}
    </div>
  );
}
