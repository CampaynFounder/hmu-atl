'use client';

// Reusable permission matrix used by both Create and Edit role flows. Renders
// the section/level grid (view / edit / publish per page) and exposes the
// selected permissions via a controlled `value` + `onChange`.

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
    { key: 'act.safety', label: 'Safety' },
    { key: 'act.users', label: 'Users' },
    { key: 'act.rides', label: 'Ride Requests' },
    { key: 'act.hmus', label: 'HMUs' },
    { key: 'act.suspect', label: 'Suspect Usage' },
  ]},
  { group: 'GROW', items: [
    { key: 'grow.activation', label: 'Activation' },
    { key: 'grow.outreach', label: 'Outreach' },
    { key: 'grow.messages', label: 'Messages' },
    { key: 'grow.playbook', label: 'Playbook' },
    { key: 'grow.leads', label: 'Leads' },
    { key: 'grow.events', label: 'Event Inquiries' },
    { key: 'grow.content', label: 'Content' },
    { key: 'grow.funnel', label: 'Funnel CMS' },
    { key: 'grow.fbgroups', label: 'Playbook FB Groups' },
    { key: 'grow.convagent', label: 'Conversation Agent' },
    { key: 'grow.chatbooking', label: 'Chat Booking' },
  ]},
  { group: 'RAISE', items: [
    { key: 'raise.dataroom', label: 'Data Room' },
    { key: 'raise.pitch', label: 'Pitch Videos' },
    { key: 'raise.videos', label: 'Videos' },
    { key: 'raise.docs', label: 'Tech Docs' },
  ]},
  { group: 'SYSTEM', items: [
    { key: 'admin.roles', label: 'Roles' },
    { key: 'admin.markets', label: 'Markets' },
    { key: 'admin.flags', label: 'Feature Flags' },
    { key: 'admin.hmuconfig', label: 'HMU Config' },
    { key: 'admin.onboarding', label: 'Onboarding Config' },
    { key: 'admin.banners', label: 'Realtime Banners' },
    { key: 'admin.browsebanner', label: 'Browse Banner' },
    { key: 'admin.maintenance', label: 'Maintenance' },
    { key: 'admin.voip', label: 'VoIP Debug' },
    { key: 'admin.smstemplates', label: 'SMS Templates' },
    { key: 'admin.dashboards', label: 'Dashboards' },
    { key: 'admin.audit', label: 'Audit Log' },
  ]},
  { group: 'TOOLS', items: [
    { key: 'tools.flows', label: 'Flows' },
  ]},
];

export const LEVEL_COLORS: Record<string, string> = { view: '#448AFF', edit: '#FFB300', publish: '#00E676' };

export function getLevel(perms: string[], key: string): string | null {
  if (perms.includes(`${key}.publish`)) return 'publish';
  if (perms.includes(`${key}.edit`)) return 'edit';
  if (perms.includes(`${key}.view`)) return 'view';
  return null;
}

export function setLevel(perms: string[], key: string, level: string | null): string[] {
  const filtered = perms.filter((p) => !p.startsWith(`${key}.`));
  if (level) filtered.push(`${key}.${level}`);
  return filtered;
}

export function PermissionMatrix({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <>
      <p style={{ fontSize: 11, color: 'var(--admin-text-faint)', marginBottom: 12 }}>
        For each page, choose an access level. <span style={{ color: '#448AFF' }}>View</span> = read-only. <span style={{ color: '#FFB300' }}>Edit</span> = make changes (includes view). <span style={{ color: '#00E676' }}>Publish</span> = push live (includes edit + view).
      </p>
      {PERMISSION_SECTIONS.map(({ group, items }) => (
        <div key={group} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--admin-text-faint)', marginBottom: 6 }}>{group}</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {items.map(({ key, label }) => {
              const current = getLevel(value, key);
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', width: 120, flexShrink: 0 }}>{label}</span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button onClick={() => onChange(setLevel(value, key, current === 'view' ? null : 'view'))} style={levelBtnStyle(current === 'view', '#448AFF')}>view</button>
                    <button onClick={() => onChange(setLevel(value, key, current === 'edit' ? null : 'edit'))} style={levelBtnStyle(current === 'edit', '#FFB300')}>edit</button>
                    <button onClick={() => onChange(setLevel(value, key, current === 'publish' ? null : 'publish'))} style={levelBtnStyle(current === 'publish', '#00E676')}>publish</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function levelBtnStyle(active: boolean, color: string): React.CSSProperties {
  return {
    padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
    background: active ? `${color}20` : 'var(--admin-bg)',
    color: active ? color : 'var(--admin-text-faint)',
    border: `1px solid ${active ? `${color}40` : 'var(--admin-border)'}`,
  };
}
