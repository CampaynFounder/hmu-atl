'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '@/app/admin/components/admin-auth-context';

const PERMISSION_SECTIONS = [
  { group: 'MONITOR', items: [
    { key: 'monitor.liveops', label: 'Live Ops' },
    { key: 'monitor.revenue', label: 'Revenue' },
    { key: 'monitor.pricing', label: 'Pricing' },
    { key: 'monitor.schedules', label: 'Schedules' },
  ]},
  { group: 'ACT', items: [
    { key: 'act.support', label: 'Support' },
    { key: 'act.notifications', label: 'Notifications' },
    { key: 'act.disputes', label: 'Disputes' },
    { key: 'act.users', label: 'Users' },
    { key: 'act.suspect', label: 'Suspect Usage' },
  ]},
  { group: 'GROW', items: [
    { key: 'grow.outreach', label: 'Outreach' },
    { key: 'grow.messages', label: 'Messages' },
    { key: 'grow.leads', label: 'Leads' },
    { key: 'grow.content', label: 'Content' },
    { key: 'grow.funnel', label: 'Funnel CMS' },
  ]},
  { group: 'RAISE', items: [
    { key: 'raise.dataroom', label: 'Data Room' },
    { key: 'raise.pitch', label: 'Pitch Videos' },
    { key: 'raise.videos', label: 'Videos' },
    { key: 'raise.docs', label: 'Tech Docs' },
  ]},
  { group: 'SYSTEM', items: [
    { key: 'admin.roles', label: 'Roles' },
    { key: 'admin.audit', label: 'Audit Log' },
  ]},
];

const LEVELS = ['view', 'edit', 'publish'] as const;
const LEVEL_COLORS: Record<string, string> = { view: '#448AFF', edit: '#FFB300', publish: '#00E676' };

interface Role { id: string; slug: string; label: string; description: string | null; permissions: string[]; is_super: boolean; requires_publish_approval: boolean; admin_count: string; }
interface AdminRow { id: string; clerk_id: string; driver_name: string | null; rider_name: string | null; driver_email: string | null; rider_phone: string | null; role_slug: string | null; role_label: string | null; }

function getLevel(perms: string[], key: string): string | null {
  if (perms.includes(`${key}.publish`)) return 'publish';
  if (perms.includes(`${key}.edit`)) return 'edit';
  if (perms.includes(`${key}.view`)) return 'view';
  return null;
}

function setLevel(perms: string[], key: string, level: string | null): string[] {
  const filtered = perms.filter((p) => !p.startsWith(`${key}.`));
  if (level) filtered.push(`${key}.${level}`);
  return filtered;
}

// Collapsible section wrapper
function Section({ title, count, defaultOpen = false, children }: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderRadius: open ? '12px 12px 0 0' : 12,
          background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
          borderBottom: open ? '1px solid var(--admin-border)' : undefined,
          cursor: 'pointer', color: 'var(--admin-text)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
          {count !== undefined && (
            <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: 'var(--admin-bg-active)', color: 'var(--admin-text-muted)' }}>{count}</span>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--admin-text-faint)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          ▼
        </span>
      </button>
      {open && (
        <div style={{
          padding: 16, borderRadius: '0 0 12px 12px',
          background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', borderTop: 'none',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSlug, setNewSlug] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPerms, setNewPerms] = useState<string[]>([]);
  const [newRequiresApproval, setNewRequiresApproval] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; display_name: string; profile_type: string }>>([]);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRoleId, setAssignRoleId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const fetchData = useCallback(() => {
    fetch('/api/admin/roles').then((r) => r.json()).then((data) => { setRoles(data.roles || []); setAdmins(data.admins || []); }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchQuery)}&limit=5`);
    const data = await res.json();
    setSearchResults((data.users || []).map((u: Record<string, unknown>) => ({ id: u.id as string, display_name: (u.displayName as string) || (u.email as string) || 'Unknown', profile_type: u.profileType as string })));
  };

  const createRole = async () => {
    if (!newSlug || !newLabel) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: newSlug, label: newLabel, description: newDesc || null, permissions: newPerms, requires_publish_approval: newRequiresApproval }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed: ${err.error || res.statusText}`);
        return;
      }
      setNewSlug(''); setNewLabel(''); setNewDesc(''); setNewPerms([]); setNewRequiresApproval(false);
      fetchData();
    } catch (e) {
      alert(`Failed: ${e}`);
    } finally {
      setCreating(false);
    }
  };

  const assignRole = async () => {
    if (!assignUserId || !assignRoleId) return;
    setAssigning(true);
    try {
      const res = await fetch('/api/admin/roles/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: assignUserId, role_id: assignRoleId }) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed: ${err.error || res.statusText}`);
        return;
      }
      setAssignUserId(''); setAssignRoleId(''); setSearchQuery(''); setSearchResults([]);
      fetchData();
    } catch (e) {
      alert(`Failed: ${e}`);
    } finally {
      setAssigning(false);
    }
  };

  const deleteRole = async (id: string) => {
    if (!confirm('Delete this role? Users assigned to it will lose admin access.')) return;
    await fetch('/api/admin/roles', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    fetchData();
  };

  const revokeAdmin = async (userId: string) => {
    if (!confirm('Revoke admin access for this user?')) return;
    await fetch('/api/admin/grant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, grant: false }) });
    fetchData();
  };

  const togglePerm = (key: string) => setNewPerms((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]);

  const { admin } = useAdminAuth();
  const isSuperAdmin = admin?.isSuper ?? false;

  if (loading) return <div style={{ padding: 40, color: 'var(--admin-text-muted)', textAlign: 'center' }}>Loading...</div>;

  const groups = [...new Set(PERMISSION_SECTIONS.map((p) => p.group))];

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 8 }}>Admin Roles & Users</h1>
      <p style={{ fontSize: 13, color: 'var(--admin-text-muted)', marginBottom: 16 }}>
        Manage roles, permissions, and admin access. Assign a role to any user to grant them admin access.
      </p>

      {/* Admin Portal Links — visible to super admins */}
      {isSuperAdmin && (
        <div style={{
          padding: '14px 18px', borderRadius: 10, marginBottom: 20,
          background: 'rgba(0,230,118,0.04)', border: '1px solid rgba(0,230,118,0.15)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#00E676', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
            Admin Portal Links
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', width: 80 }}>Login:</span>
              <code style={{ fontSize: 12, color: 'var(--admin-text)', background: 'var(--admin-bg)', padding: '2px 8px', borderRadius: 4 }}>
                atl.hmucashride.com/admin-login
              </code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', width: 80 }}>Sign Up:</span>
              <code style={{ fontSize: 12, color: 'var(--admin-text)', background: 'var(--admin-bg)', padding: '2px 8px', borderRadius: 4 }}>
                atl.hmucashride.com/admin-signup
              </code>
            </div>
            <p style={{ fontSize: 11, color: 'var(--admin-text-faint)', marginTop: 4 }}>
              Share the sign-up link with new admins. After they create an account, assign their role below.
            </p>
          </div>
        </div>
      )}

      {/* ═══ ADD ADMIN USER ═══ */}
      <Section title="Add Admin User" count={admins.length} defaultOpen={false}>
        <p style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginBottom: 12 }}>
          Search for any existing user by name, email, or phone. Assigning a role automatically grants admin access.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, email, or phone" onKeyDown={(e) => e.key === 'Enter' && searchUsers()} style={{ ...inputStyle, flex: 1 }} />
          <button onClick={searchUsers} style={secondaryBtnStyle}>Search</button>
        </div>
        {searchResults.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {searchResults.map((u) => (
              <button key={u.id} onClick={() => setAssignUserId(u.id)} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 6, marginBottom: 4, cursor: 'pointer',
                background: assignUserId === u.id ? 'rgba(0,230,118,0.08)' : 'var(--admin-bg)',
                border: `1px solid ${assignUserId === u.id ? 'rgba(0,230,118,0.3)' : 'var(--admin-border)'}`, color: 'var(--admin-text)', fontSize: 13,
              }}>
                <span style={{ fontWeight: 600 }}>{u.display_name}</span>
                <span style={{ color: 'var(--admin-text-muted)', marginLeft: 8, fontSize: 11 }}>{u.profile_type}</span>
              </button>
            ))}
          </div>
        )}
        {assignUserId && (
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={assignRoleId} onChange={(e) => setAssignRoleId(e.target.value)} style={{ flex: 1, ...inputStyle }}>
              <option value="">Select role...</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.label}{r.is_super ? ' (Super)' : ''}</option>)}
            </select>
            <button onClick={assignRole} disabled={!assignRoleId || assigning} style={{ ...primaryBtnStyle, opacity: !assignRoleId || assigning ? 0.5 : 1 }}>
              {assigning ? 'Assigning...' : 'Grant Admin'}
            </button>
          </div>
        )}
      </Section>

      {/* ═══ CURRENT ADMINS ═══ */}
      <Section title="Current Admins" count={admins.length} defaultOpen={false}>
        {admins.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>No admin users</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {admins.map((a) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)' }}>{a.driver_name || a.rider_name || a.clerk_id.substring(0, 12)}</span>
                  <span style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginLeft: 8 }}>{a.driver_email || a.rider_phone || ''}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: a.role_slug === 'super_admin' ? 'rgba(0,230,118,0.1)' : 'var(--admin-bg-active)',
                    color: a.role_slug === 'super_admin' ? '#00E676' : 'var(--admin-text-secondary)',
                  }}>
                    {a.role_label || 'No role'}
                  </span>
                  {a.role_slug !== 'super_admin' && (
                    <button onClick={() => revokeAdmin(a.id)} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, background: 'transparent', color: '#FF5252', border: '1px solid rgba(255,82,82,0.2)', cursor: 'pointer' }}>
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ═══ EXISTING ROLES ═══ */}
      <Section title="Roles" count={roles.length} defaultOpen={false}>
        <div style={{ display: 'grid', gap: 8 }}>
          {roles.map((role) => (
            <div key={role.id} style={{ padding: '14px 16px', borderRadius: 8, background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)' }}>{role.label}</span>
                  {role.is_super && <span style={badgeStyle('#00E676')}>SUPER</span>}
                  {role.requires_publish_approval && <span style={badgeStyle('#FFB300')}>NEEDS APPROVAL</span>}
                  <span style={{ fontSize: 11, color: 'var(--admin-text-faint)' }}>{role.admin_count} user{role.admin_count !== '1' ? 's' : ''}</span>
                </div>
                {!role.is_super && (
                  <button onClick={() => deleteRole(role.id)} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, background: 'transparent', color: '#FF5252', border: '1px solid rgba(255,82,82,0.2)', cursor: 'pointer' }}>Delete</button>
                )}
              </div>
              {role.description && <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 4 }}>{role.description}</div>}
              {role.is_super ? (
                <div style={{ fontSize: 11, color: '#00E676', marginTop: 6 }}>All permissions (bypasses checks)</div>
              ) : role.permissions.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {role.permissions.map((p) => {
                    const level = p.split('.').pop() || '';
                    return <span key={p} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${LEVEL_COLORS[level] || '#666'}15`, color: LEVEL_COLORS[level] || '#666', border: `1px solid ${LEVEL_COLORS[level] || '#666'}30` }}>{p}</span>;
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ CREATE ROLE ═══ */}
      <Section title="Create New Role" defaultOpen={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input value={newSlug} onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="slug (e.g. content_editor)" style={inputStyle} />
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Display Label" style={inputStyle} />
        </div>
        <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" style={{ ...inputStyle, marginBottom: 12 }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={newRequiresApproval} onChange={(e) => setNewRequiresApproval(e.target.checked)} />
          <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)' }}>Requires two-person publish approval</span>
        </label>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: 8 }}>Permissions</div>
        <p style={{ fontSize: 11, color: 'var(--admin-text-faint)', marginBottom: 12 }}>
          For each page, choose an access level. <span style={{ color: '#448AFF' }}>View</span> = read-only. <span style={{ color: '#FFB300' }}>Edit</span> = make changes (includes view). <span style={{ color: '#00E676' }}>Publish</span> = push live (includes edit + view).
        </p>

        {PERMISSION_SECTIONS.map(({ group, items }) => (
          <div key={group} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--admin-text-faint)', marginBottom: 6 }}>{group}</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {items.map(({ key, label }) => {
                const current = getLevel(newPerms, key);
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', width: 120, flexShrink: 0 }}>{label}</span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button onClick={() => setNewPerms(setLevel(newPerms, key, current === 'view' ? null : 'view'))} style={levelBtnStyle(current === 'view', '#448AFF')}>view</button>
                      <button onClick={() => setNewPerms(setLevel(newPerms, key, current === 'edit' ? null : 'edit'))} style={levelBtnStyle(current === 'edit', '#FFB300')}>edit</button>
                      <button onClick={() => setNewPerms(setLevel(newPerms, key, current === 'publish' ? null : 'publish'))} style={levelBtnStyle(current === 'publish', '#00E676')}>publish</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <button onClick={createRole} disabled={creating || !newSlug || !newLabel} style={{ ...primaryBtnStyle, marginTop: 8, opacity: creating || !newSlug || !newLabel ? 0.5 : 1 }}>
          {creating ? 'Creating...' : 'Create Role'}
        </button>
      </Section>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13, background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' };
const primaryBtnStyle: React.CSSProperties = { padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#00E676', color: '#000', border: 'none', cursor: 'pointer' };
const secondaryBtnStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 6, fontSize: 13, background: 'var(--admin-bg-active)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', cursor: 'pointer' };

function badgeStyle(color: string): React.CSSProperties {
  return { fontSize: 9, padding: '2px 6px', borderRadius: 3, background: `${color}15`, color, fontWeight: 700 };
}

function levelBtnStyle(active: boolean, color: string): React.CSSProperties {
  return {
    padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
    background: active ? `${color}20` : 'var(--admin-bg)',
    color: active ? color : 'var(--admin-text-faint)',
    border: `1px solid ${active ? `${color}40` : 'var(--admin-border)'}`,
  };
}
