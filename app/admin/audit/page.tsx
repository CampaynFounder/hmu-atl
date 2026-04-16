'use client';

import { useState, useEffect, useCallback } from 'react';

interface AuditEntry {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  admin_name: string | null;
  admin_email: string | null;
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEntries = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), limit: '50' });
    if (actionFilter) qs.set('action', actionFilter);
    fetch(`/api/admin/audit?${qs}`)
      .then((r) => r.json())
      .then((data) => { setEntries(data.entries || []); setTotal(data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, actionFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const totalPages = Math.ceil(total / 50);

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 16 }}>Audit Log</h1>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          placeholder="Filter by action (e.g. cms_variant, role)"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13, background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
        />
        <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', alignSelf: 'center' }}>
          {total} entries
        </div>
      </div>

      {/* Entries */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--admin-text-muted)' }}>Loading...</div>
      ) : entries.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--admin-text-muted)' }}>No audit entries found</div>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          {entries.map((entry) => (
            <div key={entry.id} style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', borderRadius: 8, overflow: 'hidden' }}>
              <button
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'var(--admin-bg-active)', color: 'var(--admin-text-secondary)', fontFamily: 'monospace' }}>
                    {entry.action}
                  </span>
                  {entry.target_type && (
                    <span style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
                      {entry.target_type} {entry.target_id ? `#${entry.target_id.substring(0, 8)}` : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
                    {entry.admin_name || 'System'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--admin-text-faint)' }}>
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
              </button>
              {expandedId === entry.id && entry.details && Object.keys(entry.details).length > 0 && (
                <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--admin-border)' }}>
                  <pre style={{ fontSize: 11, color: 'var(--admin-text-secondary)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0 }}>
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: 'var(--admin-bg-active)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', cursor: 'pointer', opacity: page === 1 ? 0.3 : 1 }}>
            Prev
          </button>
          <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', alignSelf: 'center' }}>
            Page {page} of {totalPages}
          </span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
            style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: 'var(--admin-bg-active)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', cursor: 'pointer', opacity: page === totalPages ? 0.3 : 1 }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
