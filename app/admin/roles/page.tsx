'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '@/app/admin/components/admin-auth-context';
import { useMarket } from '@/app/admin/components/market-context';
import { PermissionMatrix, LEVEL_COLORS } from './permission-matrix';

interface Role { id: string; slug: string; label: string; description: string | null; permissions: string[]; is_super: boolean; requires_publish_approval: boolean; admin_count: string; }
interface DashboardOption { id: string; slug: string; label: string; description: string | null; scope: string; is_builtin: boolean; granted: boolean; }
interface AdminRow {
  id: string;
  clerk_id: string;
  driver_name: string | null;
  rider_name: string | null;
  driver_email: string | null;
  rider_phone: string | null;
  role_slug: string | null;
  role_label: string | null;
  is_super: boolean;
  admin_market_ids: string[] | null;
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
  // Inline edit state — only one role is edited at a time. editingId === null
  // means no row is open. Fields hydrate from the role when editing starts.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [editRequiresApproval, setEditRequiresApproval] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  // Per-role dashboards editor — collapsible panel separate from the
  // permissions editor since dashboards are managed independently.
  const [dashboardEditingId, setDashboardEditingId] = useState<string | null>(null);
  const [dashboardOptions, setDashboardOptions] = useState<DashboardOption[]>([]);
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set());
  const [savingDashboards, setSavingDashboards] = useState(false);
  // Market scope editor — separate from role editor; one admin's markets are
  // edited at a time. null marketEditing means no row is open. Draft is
  // either a Set of market IDs (restricted) or null (unrestricted = all).
  const [marketEditingAdminId, setMarketEditingAdminId] = useState<string | null>(null);
  const [marketDraft, setMarketDraft] = useState<string[] | null>(null);
  const [savingMarkets, setSavingMarkets] = useState(false);

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

  const startMarketEdit = (admin: AdminRow) => {
    setMarketEditingAdminId(admin.id);
    setMarketDraft(admin.admin_market_ids === null ? null : [...admin.admin_market_ids]);
  };

  const cancelMarketEdit = () => {
    setMarketEditingAdminId(null);
    setMarketDraft(null);
  };

  const saveMarkets = async () => {
    if (!marketEditingAdminId) return;
    setSavingMarkets(true);
    try {
      const res = await fetch('/api/admin/roles/markets', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: marketEditingAdminId, market_ids: marketDraft }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed: ${err.error || res.statusText}`);
        return;
      }
      cancelMarketEdit();
      fetchData();
    } catch (e) {
      alert(`Failed: ${e}`);
    } finally {
      setSavingMarkets(false);
    }
  };

  const toggleMarketInDraft = (marketId: string) => {
    setMarketDraft((prev) => {
      // If currently unrestricted, picking a market starts an explicit allowlist
      if (prev === null) return [marketId];
      return prev.includes(marketId) ? prev.filter((id) => id !== marketId) : [...prev, marketId];
    });
  };

  const openDashboards = async (roleId: string) => {
    setDashboardEditingId(roleId);
    setDashboardOptions([]);
    setGrantedIds(new Set());
    try {
      const res = await fetch(`/api/admin/roles/${roleId}/dashboards`);
      if (!res.ok) {
        alert('Failed to load dashboards');
        setDashboardEditingId(null);
        return;
      }
      const data = await res.json();
      const opts = (data.dashboards || []) as DashboardOption[];
      setDashboardOptions(opts);
      setGrantedIds(new Set(opts.filter((o) => o.granted).map((o) => o.id)));
    } catch {
      alert('Failed to load dashboards');
      setDashboardEditingId(null);
    }
  };

  const closeDashboards = () => {
    setDashboardEditingId(null);
    setDashboardOptions([]);
    setGrantedIds(new Set());
  };

  const toggleDashboardGrant = (id: string) => {
    setGrantedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const saveDashboards = async () => {
    if (!dashboardEditingId) return;
    setSavingDashboards(true);
    try {
      const res = await fetch(`/api/admin/roles/${dashboardEditingId}/dashboards`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboard_ids: Array.from(grantedIds) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed: ${err.error || res.statusText}`);
        return;
      }
      closeDashboards();
    } catch (e) {
      alert(`Failed: ${e}`);
    } finally {
      setSavingDashboards(false);
    }
  };

  const startEdit = (role: Role) => {
    setEditingId(role.id);
    setEditLabel(role.label);
    setEditDesc(role.description || '');
    setEditPerms([...role.permissions]);
    setEditRequiresApproval(role.requires_publish_approval);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel(''); setEditDesc(''); setEditPerms([]); setEditRequiresApproval(false);
  };

  const saveEdit = async () => {
    if (!editingId || !editLabel) return;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          label: editLabel,
          description: editDesc || null,
          permissions: editPerms,
          requires_publish_approval: editRequiresApproval,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed: ${err.error || res.statusText}`);
        return;
      }
      cancelEdit();
      fetchData();
    } catch (e) {
      alert(`Failed: ${e}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const { admin } = useAdminAuth();
  const { markets: availableMarkets } = useMarket();
  // realIsSuper survives even when this super admin is currently previewing
  // as a lower role — they should still see the "Preview as" affordances so
  // they can switch between roles without first exiting preview.
  const isSuperAdmin = (admin?.realIsSuper ?? admin?.isSuper) ?? false;
  const marketLabelById = (id: string) => availableMarkets.find((m) => m.id === id)?.name || id.substring(0, 8);

  const previewAsRole = async (roleId: string) => {
    const res = await fetch('/api/admin/preview-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Failed to enter preview: ${err.error || res.statusText}`);
      return;
    }
    // Hard reload so the layout re-renders the swapped permissions everywhere.
    window.location.href = '/admin';
  };

  if (loading) return <div style={{ padding: 40, color: 'var(--admin-text-muted)', textAlign: 'center' }}>Loading...</div>;

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
              <a href="/admin-login" target="_blank" style={{ fontSize: 12, color: '#00E676', background: 'var(--admin-bg)', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace', textDecoration: 'none' }}>
                atl.hmucashride.com/admin-login
              </a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', width: 80 }}>Sign Up:</span>
              <a href="/admin-signup" target="_blank" style={{ fontSize: 12, color: '#00E676', background: 'var(--admin-bg)', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace', textDecoration: 'none' }}>
                atl.hmucashride.com/admin-signup
              </a>
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
            {admins.map((a) => {
              const editingMarkets = marketEditingAdminId === a.id;
              const unrestricted = a.admin_market_ids === null;
              const marketBadge = a.is_super
                ? 'All markets (super)'
                : unrestricted
                  ? 'All markets'
                  : a.admin_market_ids!.length === 0
                    ? 'No markets'
                    : a.admin_market_ids!.map(marketLabelById).join(', ');
              return (
              <div key={a.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--admin-bg)', border: `1px solid ${editingMarkets ? 'rgba(0,230,118,0.3)' : 'var(--admin-border)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)' }}>{a.driver_name || a.rider_name || a.clerk_id.substring(0, 12)}</span>
                    <span style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginLeft: 8 }}>{a.driver_email || a.rider_phone || ''}</span>
                    <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: a.role_slug === 'super_admin' ? 'rgba(0,230,118,0.1)' : 'var(--admin-bg-active)',
                        color: a.role_slug === 'super_admin' ? '#00E676' : 'var(--admin-text-secondary)',
                      }}>
                        {a.role_label || 'No role'}
                      </span>
                      <span title="Markets this admin can access" style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        background: a.is_super || unrestricted ? 'rgba(68,138,255,0.08)' : 'rgba(255,179,0,0.08)',
                        color: a.is_super || unrestricted ? '#448AFF' : '#FFB300',
                        border: `1px solid ${a.is_super || unrestricted ? 'rgba(68,138,255,0.2)' : 'rgba(255,179,0,0.25)'}`,
                      }}>
                        🌎 {marketBadge}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isSuperAdmin && !a.is_super && !editingMarkets && (
                      <button onClick={() => startMarketEdit(a)} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, background: 'rgba(68,138,255,0.08)', color: '#448AFF', border: '1px solid rgba(68,138,255,0.3)', cursor: 'pointer', fontWeight: 600 }}>
                        🌎 Markets
                      </button>
                    )}
                    {a.role_slug !== 'super_admin' && !editingMarkets && (
                      <button onClick={() => revokeAdmin(a.id)} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, background: 'transparent', color: '#FF5252', border: '1px solid rgba(255,82,82,0.2)', cursor: 'pointer' }}>
                        Revoke
                      </button>
                    )}
                  </div>
                </div>

                {editingMarkets && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--admin-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginBottom: 8 }}>
                      Pick the markets this admin can access. <strong>Unrestricted</strong> means they see every market (current + future).
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={marketDraft === null}
                        onChange={(e) => setMarketDraft(e.target.checked ? null : [])}
                      />
                      <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)' }}>Unrestricted (all markets)</span>
                    </label>
                    {marketDraft !== null && (
                      <div style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
                        {availableMarkets.length === 0 ? (
                          <div style={{ fontSize: 11, color: 'var(--admin-text-faint)', fontStyle: 'italic' }}>
                            No markets available to assign
                          </div>
                        ) : (
                          availableMarkets.map((m) => {
                            const checked = marketDraft.includes(m.id);
                            return (
                              <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, background: checked ? 'rgba(0,230,118,0.05)' : 'transparent' }}>
                                <input type="checkbox" checked={checked} onChange={() => toggleMarketInDraft(m.id)} />
                                <span style={{ fontSize: 12, color: 'var(--admin-text)' }}>{m.name}</span>
                                <span style={{ fontSize: 10, color: 'var(--admin-text-faint)', marginLeft: 'auto' }}>{m.status}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={saveMarkets} disabled={savingMarkets} style={{ ...primaryBtnStyle, opacity: savingMarkets ? 0.5 : 1 }}>
                        {savingMarkets ? 'Saving…' : 'Save Markets'}
                      </button>
                      <button onClick={cancelMarketEdit} disabled={savingMarkets} style={secondaryBtnStyle}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </Section>

      {/* ═══ EXISTING ROLES ═══ */}
      <Section title="Roles" count={roles.length} defaultOpen={false}>
        <div style={{ display: 'grid', gap: 8 }}>
          {roles.map((role) => {
            const isEditing = editingId === role.id;
            return (
            <div key={role.id} style={{ padding: '14px 16px', borderRadius: 8, background: 'var(--admin-bg)', border: `1px solid ${isEditing ? 'rgba(0,230,118,0.3)' : 'var(--admin-border)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)' }}>{role.label}</span>
                  {role.is_super && <span style={badgeStyle('#00E676')}>SUPER</span>}
                  {role.requires_publish_approval && <span style={badgeStyle('#FFB300')}>NEEDS APPROVAL</span>}
                  <span style={{ fontSize: 11, color: 'var(--admin-text-faint)' }}>{role.admin_count} user{role.admin_count !== '1' ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {isSuperAdmin && !role.is_super && !isEditing && (
                    <button
                      onClick={() => previewAsRole(role.id)}
                      title="Browse the admin portal as if you had this role's permissions. Read-only."
                      style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, background: 'rgba(255,179,0,0.08)', color: '#FFB300', border: '1px solid rgba(255,179,0,0.3)', cursor: 'pointer', fontWeight: 600 }}
                    >
                      👁 Preview as
                    </button>
                  )}
                  {!role.is_super && !isEditing && dashboardEditingId !== role.id && (
                    <button
                      onClick={() => openDashboards(role.id)}
                      title="Pick which dashboards this role can view on /admin/users/[id]. Use 'Preview as' to test."
                      style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, background: 'rgba(0,230,118,0.08)', color: '#00E676', border: '1px solid rgba(0,230,118,0.3)', cursor: 'pointer', fontWeight: 600 }}
                    >
                      📊 Dashboards
                    </button>
                  )}
                  {!role.is_super && !isEditing && (
                    <button onClick={() => startEdit(role)} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, background: 'rgba(68,138,255,0.08)', color: '#448AFF', border: '1px solid rgba(68,138,255,0.3)', cursor: 'pointer', fontWeight: 600 }}>
                      ✎ Edit
                    </button>
                  )}
                  {!role.is_super && !isEditing && (
                    <button onClick={() => deleteRole(role.id)} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, background: 'transparent', color: '#FF5252', border: '1px solid rgba(255,82,82,0.2)', cursor: 'pointer' }}>Delete</button>
                  )}
                </div>
              </div>
              {!isEditing && role.description && <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 4 }}>{role.description}</div>}
              {!isEditing && (role.is_super ? (
                <div style={{ fontSize: 11, color: '#00E676', marginTop: 6 }}>All permissions (bypasses checks)</div>
              ) : role.permissions.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {role.permissions.map((p) => {
                    const level = p.split('.').pop() || '';
                    return <span key={p} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${LEVEL_COLORS[level] || '#666'}15`, color: LEVEL_COLORS[level] || '#666', border: `1px solid ${LEVEL_COLORS[level] || '#666'}30` }}>{p}</span>;
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--admin-text-faint)', marginTop: 6, fontStyle: 'italic' }}>No permissions assigned</div>
              ))}

              {dashboardEditingId === role.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginBottom: 8 }}>
                    Pick which dashboards this role sees on <code style={{ background: 'var(--admin-bg)', padding: '1px 4px', borderRadius: 3 }}>/admin/users/[id]</code>.
                    Builtins listed first. <strong>default-user-profile</strong> is always visible — no need to grant it.
                    To verify, click <strong>👁 Preview as</strong> after saving, then open any user.
                  </div>
                  {dashboardOptions.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--admin-text-faint)', fontStyle: 'italic', marginBottom: 12 }}>Loading…</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 4, marginBottom: 12, maxHeight: 320, overflowY: 'auto' }}>
                      {dashboardOptions.map((d) => {
                        const checked = grantedIds.has(d.id);
                        const disabled = d.is_builtin && d.slug === 'default-user-profile';
                        return (
                          <label
                            key={d.id}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: 8,
                              padding: '6px 8px', borderRadius: 4,
                              background: checked ? 'rgba(0,230,118,0.05)' : 'transparent',
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              opacity: disabled ? 0.6 : 1,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked || disabled}
                              disabled={disabled}
                              onChange={() => toggleDashboardGrant(d.id)}
                              style={{ marginTop: 2 }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 13, color: 'var(--admin-text)', fontWeight: 500 }}>{d.label}</span>
                                {d.is_builtin && (
                                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>BUILTIN</span>
                                )}
                                <code style={{ fontSize: 10, color: 'var(--admin-text-faint)' }}>{d.slug}</code>
                                {disabled && (
                                  <span style={{ fontSize: 9, color: 'var(--admin-text-faint)' }}>always visible</span>
                                )}
                              </div>
                              {d.description && (
                                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 2 }}>
                                  {d.description}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={saveDashboards} disabled={savingDashboards || dashboardOptions.length === 0} style={{ ...primaryBtnStyle, opacity: savingDashboards || dashboardOptions.length === 0 ? 0.5 : 1 }}>
                      {savingDashboards ? 'Saving…' : 'Save Dashboards'}
                    </button>
                    <button onClick={closeDashboards} disabled={savingDashboards} style={secondaryBtnStyle}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {isEditing && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--admin-border)' }}>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--admin-text-muted)', marginBottom: 4, letterSpacing: 1 }}>LABEL</label>
                    <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--admin-text-muted)', marginBottom: 4, letterSpacing: 1 }}>DESCRIPTION</label>
                    <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Optional" style={inputStyle} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editRequiresApproval} onChange={(e) => setEditRequiresApproval(e.target.checked)} />
                    <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)' }}>Requires two-person publish approval</span>
                  </label>

                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: 8 }}>Permissions</div>
                  <PermissionMatrix value={editPerms} onChange={setEditPerms} />

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={saveEdit} disabled={savingEdit || !editLabel} style={{ ...primaryBtnStyle, opacity: savingEdit || !editLabel ? 0.5 : 1 }}>
                      {savingEdit ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button onClick={cancelEdit} disabled={savingEdit} style={secondaryBtnStyle}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
          })}
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
        <PermissionMatrix value={newPerms} onChange={setNewPerms} />

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
