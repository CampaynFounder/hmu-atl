'use client';

import { useCallback, useEffect, useState } from 'react';

interface CommentRow {
  id: string;
  content: string;
  redacted_content: string | null;
  admin_note: string | null;
  is_visible: boolean;
  flagged_for_review: boolean;
  parent_id: string | null;
  created_at: string;
  redacted_at: string | null;
  author_handle: string | null;
  author_name: string | null;
  subject_handle: string | null;
  subject_name: string | null;
}

type Tab = 'flagged' | 'all';

export default function CommentsModeration() {
  const [tab, setTab] = useState<Tab>('flagged');
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [redactModal, setRedactModal] = useState<CommentRow | null>(null);
  const [redactText, setRedactText] = useState('');
  const [adminNote, setAdminNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/comments?flagged=${tab === 'flagged' ? '1' : '0'}`);
      const data = await r.json();
      setComments(data.comments ?? []);
    } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  async function action(id: string, act: string, extra?: Record<string, string>) {
    setActioning(id);
    try {
      await fetch(`/api/admin/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act, ...extra }),
      });
      await load();
    } finally { setActioning(null); }
  }

  async function submitRedact() {
    if (!redactModal || !redactText.trim()) return;
    await action(redactModal.id, 'redact', { redactedContent: redactText.trim(), adminNote: adminNote.trim() });
    setRedactModal(null);
    setRedactText('');
    setAdminNote('');
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 860, margin: '0 auto', fontFamily: "'DM Sans', sans-serif", color: '#fff' }}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Comments</div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Moderate rider/driver comments before or after publishing.
      </div>

      {/* Tab toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['flagged', 'all'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: tab === t ? '#00E676' : 'rgba(255,255,255,0.06)',
            color: tab === t ? '#000' : '#aaa',
            border: 'none', transition: 'background 0.15s',
          }}>
            {t === 'flagged' ? 'Flagged' : 'All Comments'}
          </button>
        ))}
        <button onClick={load} style={{
          marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: 'none',
          borderRadius: 100, padding: '8px 16px', fontSize: 12, color: '#888', cursor: 'pointer',
        }}>
          Refresh
        </button>
      </div>

      {loading && (
        <div style={{ color: '#555', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Loading…</div>
      )}

      {!loading && comments.length === 0 && (
        <div style={{ color: '#555', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
          {tab === 'flagged' ? 'No flagged comments.' : 'No comments yet.'}
        </div>
      )}

      {!loading && comments.map(c => (
        <div key={c.id} style={{
          background: '#141414', border: `1px solid ${c.flagged_for_review ? 'rgba(255,82,82,0.3)' : 'rgba(255,255,255,0.07)'}`,
          borderRadius: 14, padding: '16px 18px', marginBottom: 12,
        }}>
          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>@{c.author_handle ?? '?'}</span>
            <span style={{ fontSize: 12, color: '#555' }}>→</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>@{c.subject_handle ?? '?'}</span>
            {c.parent_id && (
              <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.07)', borderRadius: 100, padding: '2px 8px', color: '#888' }}>
                REPLY
              </span>
            )}
            {c.flagged_for_review && (
              <span style={{ fontSize: 10, background: 'rgba(255,82,82,0.15)', borderRadius: 100, padding: '2px 8px', color: '#FF5252' }}>
                FLAGGED
              </span>
            )}
            {!c.is_visible && (
              <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 100, padding: '2px 8px', color: '#888' }}>
                HIDDEN
              </span>
            )}
            {c.redacted_content && (
              <span style={{ fontSize: 10, background: 'rgba(255,215,64,0.12)', borderRadius: 100, padding: '2px 8px', color: '#FFD740' }}>
                REDACTED
              </span>
            )}
            <span style={{ fontSize: 10, color: '#555', marginLeft: 'auto' }}>
              {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          {/* Content */}
          <div style={{ fontSize: 13, color: '#ccc', marginBottom: 4 }}>{c.content}</div>
          {c.redacted_content && (
            <div style={{ fontSize: 12, color: '#FFD740', fontStyle: 'italic', marginBottom: 4 }}>
              Shown as: "{c.redacted_content}"
            </div>
          )}
          {c.admin_note && (
            <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', marginBottom: 8 }}>
              Note: {c.admin_note}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {c.is_visible ? (
              <ActionBtn label="Hide" color="#FF5252" loading={actioning === c.id} onClick={() => action(c.id, 'hide')} />
            ) : (
              <ActionBtn label="Unhide" color="#00E676" loading={actioning === c.id} onClick={() => action(c.id, 'unhide')} />
            )}
            <ActionBtn label="Redact" color="#FFD740" loading={actioning === c.id}
              onClick={() => { setRedactModal(c); setRedactText(c.content); setAdminNote(c.admin_note ?? ''); }} />
            {c.flagged_for_review ? (
              <ActionBtn label="Unflag" color="#888" loading={actioning === c.id} onClick={() => action(c.id, 'unflag')} />
            ) : (
              <ActionBtn label="Flag" color="#FF9100" loading={actioning === c.id} onClick={() => action(c.id, 'flag')} />
            )}
          </div>
        </div>
      ))}

      {/* Redact modal */}
      {redactModal && (
        <>
          <div onClick={() => setRedactModal(null)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
          }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: '#1a1a1a', borderRadius: 18, padding: '24px', zIndex: 201,
            width: 'min(480px, calc(100vw - 40px))',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Redact Comment</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
              Original: <em>"{redactModal.content}"</em>
            </div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Replace content with:</div>
            <textarea
              value={redactText}
              onChange={e => setRedactText(e.target.value)}
              rows={3}
              style={{
                width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, padding: '10px 12px', color: '#fff', fontSize: 13, resize: 'none',
                fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none',
              }}
            />
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6, marginTop: 12 }}>
              Admin note shown to users (optional):
            </div>
            <input
              value={adminNote}
              onChange={e => setAdminNote(e.target.value)}
              placeholder="e.g. Personal information removed"
              style={{
                width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, padding: '8px 12px', color: '#fff', fontSize: 12,
                fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setRedactModal(null)} style={{
                flex: 1, background: 'rgba(255,255,255,0.06)', border: 'none',
                borderRadius: 100, padding: '10px', fontSize: 13, color: '#888', cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button onClick={submitRedact} disabled={!redactText.trim()} style={{
                flex: 1, background: redactText.trim() ? '#FFD740' : '#1a1a1a',
                color: redactText.trim() ? '#000' : '#555',
                border: 'none', borderRadius: 100, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                Save Redaction
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ActionBtn({ label, color, loading, onClick }: {
  label: string; color: string; loading: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}30`,
      borderRadius: 100, padding: '5px 14px', fontSize: 11, fontWeight: 600,
      color, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
      transition: 'background 0.15s',
    }}>
      {loading ? '…' : label}
    </button>
  );
}
