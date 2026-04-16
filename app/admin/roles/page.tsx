'use client';

import { useState, useEffect, useCallback } from 'react';

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
interface AdminRow { id: string; clerk_id: string; driver_name: string | null; rider_name: string | null; driver_email: string | null; rider_email: string | null; role_slug: string | null; role_label: string | null; }

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
    await fetch('/api/admin/roles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: newSlug, label: newLabel, description: newDesc || null, permissions: newPerms, requires_publish_approval: newRequiresApproval }),
    });
    setNewSlug(''); setNewLabel(''); setNewDesc(''); setNewPerms([]); setNewRequiresApproval(false);
    setCreating(false); fetchData();
  };

  const assignRole = async () => {
    if (!assignUserId || !assignRoleId) return;
    await fetch('/api/admin/roles/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: assignUserId, role_id: assignRoleId }) });
    setAssignUserId(''); setAssignRoleId(''); setSearchQuery(''); setSearchResults([]); fetchData();
  };

  const deleteRole = async (id: string) => {
    if (!confirm('Delete this role? Users will lose their role.')) return;
    await fetch('/api/admin/roles', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    fetchData();
  };

  if (loading) return <div style={{ padding: 40, color: 'var(--admin-text-muted)', textAlign: 'center' }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 24 }}>Admin Roles</h1>

      {/* Existing Roles */}
      <div style={{ display: 'grid', gap: 10, marginBottom: 32 }}>
        {roles.map((role) => (
          <div key={role.id} style={{ padding: '16px 20px', borderRadius: 12, background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--admin-text)' }}>{role.label}</span>
                {role.is_super && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(0,230,118,0.1)', color: '#00E676', fontWeight: 700 }}>SUPER</span>}
                {role.requires_publish_approval && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(255,179,0,0.1)', color: '#FFB300', fontWeight: 700 }}>NEEDS APPROVAL</span>}
                <span style={{ fontSize: 11, color: 'var(--admin-text-faint)' }}>{role.admin_count} admin{role.admin_count !== '1' ? 's' : ''}</span>
              </div>
              {!role.is_super && <button onClick={() => deleteRole(role.id)} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, background: 'transparent', color: '#FF5252', border: '1px solid rgba(255,82,82,0.2)', cursor: 'pointer' }}>Delete</button>}
            </div>
            {role.description && <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 4 }}>{role.description}</div>}
            {!role.is_super && role.permissions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {role.permissions.map((p) => {
                  const level = p.split('.').pop() || '';
                  return (
                    <span key={p} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${LEVEL_COLORS[level] || '#666'}15`, color: LEVEL_COLORS[level] || '#666', border: `1px solid ${LEVEL_COLORS[level] || '#666'}30` }}>
                      {p}
                    </span>
                  );
                })}
              </div>
            )}
            {role.is_super && <div style={{ fontSize: 11, color: '#00E676', marginTop: 6 }}>All permissions (bypasses checks)</div>}
          </div>
        ))}
      </div>

      {/* Create Role */}
      <div style={{ padding: 20, borderRadius: 12, marginBottom: 32, background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)', marginBottom: 12 }}>Create Role</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input value={newSlug} onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="slug" style={inputStyle} />
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label" style={inputStyle} />
        </div>
        <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description" style={{ ...inputStyle, marginBottom: 12 }} />

        {/* Approval toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={newRequiresApproval} onChange={(e) => setNewRequiresApproval(e.target.checked)} />
          <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)' }}>Requires two-person publish approval</span>
        </label>

        {/* Permission picker with levels */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: 8 }}>Permissions</div>
        {PERMISSION_SECTIONS.map(({ group, items }) => (
          <div key={group} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--admin-text-faint)', marginBottom: 6 }}>{group}</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {items.map(({ key, label }) => {
                const current = getLevel(newPerms, key);
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', width: 120 }}>{label}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {LEVELS.map((lvl) => (
                        <button key={lvl} onClick={() => setNewPerms(setLevel(newPerms, key, current === lvl ? null : lvl))} style={{
                          padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                          background: current === lvl ? `${LEVEL_COLORS[lvl]}20` : 'var(--admin-bg)',
                          color: current === lvl ? LEVEL_COLORS[lvl] : 'var(--admin-text-faint)',
                          border: `1px solid ${current === lvl ? `${LEVEL_COLORS[lvl]}40` : 'var(--admin-border)'}`,
                        }}>
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <button onClick={createRole} disabled={creating || !newSlug || !newLabel} style={{
          marginTop: 8, padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: '#00E676', color: '#000', border: 'none', cursor: 'pointer',
          opacity: creating || !newSlug || !newLabel ? 0.5 : 1,
        }}>
          Create Role
        </button>
      </div>

      {/* Assign Role */}
      <div style={{ padding: 20, borderRadius: 12, marginBottom: 32, background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)', marginBottom: 12 }}>Assign Role to User</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, email, or phone" onKeyDown={(e) => e.key === 'Enter' && searchUsers()} style={{ ...inputStyle, flex: 1 }} />
          <button onClick={searchUsers} style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, background: 'var(--admin-bg-active)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', cursor: 'pointer' }}>Search</button>
        </div>
        {searchResults.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {searchResults.map((u) => (
              <button key={u.id} onClick={() => setAssignUserId(u.id)} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6, marginBottom: 4, cursor: 'pointer',
                background: assignUserId === u.id ? 'rgba(0,230,118,0.1)' : 'var(--admin-bg)',
                border: `1px solid ${assignUserId === u.id ? 'rgba(0,230,118,0.3)' : 'var(--admin-border)'}`, color: 'var(--admin-text)', fontSize: 13,
              }}>
                {u.display_name} — <span style={{ color: 'var(--admin-text-muted)' }}>{u.profile_type}</span>
              </button>
            ))}
          </div>
        )}
        {assignUserId && (
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={assignRoleId} onChange={(e) => setAssignRoleId(e.target.value)} style={{ flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13, background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}>
              <option value="">Select role...</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <button onClick={assignRole} disabled={!assignRoleId} style={{ padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600, background: '#00E676', color: '#000', border: 'none', cursor: 'pointer', opacity: !assignRoleId ? 0.5 : 1 }}>Assign</button>
          </div>
        )}
      </div>

      {/* Current Admins */}
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)', marginBottom: 12 }}>Current Admins</h2>
        <div style={{ display: 'grid', gap: 6 }}>
          {admins.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: 8, background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)' }}>{a.driver_name || a.rider_name || a.clerk_id}</span>
                <span style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginLeft: 8 }}>{a.driver_email || a.rider_email || ''}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: a.role_slug === 'super_admin' ? 'rgba(0,230,118,0.1)' : 'var(--admin-bg-active)', color: a.role_slug === 'super_admin' ? '#00E676' : 'var(--admin-text-secondary)' }}>
                {a.role_label || 'No role'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13, background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' };
