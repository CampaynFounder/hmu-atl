'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useAbly } from '@/hooks/use-ably';
import { useMarket } from './market-context';
import { useSidebar } from './sidebar-context';
import { useAdminTheme } from './theme-context';
import { useAdminAuth } from './admin-auth-context';

type BadgeColor = 'green' | 'red' | 'amber';
type NavItem = { href: string; label: string; icon: string; permission?: string; badgeCategory?: string; badgeColor?: BadgeColor };

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'MONITOR',
    items: [
      { href: '/admin', label: 'Live Ops', icon: '⚡', permission: 'monitor.liveops' },
      { href: '/admin/growth', label: 'Growth', icon: '📈', permission: 'monitor.liveops' },
      { href: '/admin/money', label: 'Revenue', icon: '💰', permission: 'monitor.revenue' },
      { href: '/admin/pricing', label: 'Pricing', icon: '⚙️', permission: 'monitor.pricing' },
      { href: '/admin/schedule', label: 'Schedules', icon: '📅', permission: 'monitor.schedules' },
    ],
  },
  {
    label: 'ACT',
    items: [
      { href: '/admin/support', label: 'Support', icon: '🎫', permission: 'act.support', badgeCategory: 'support', badgeColor: 'amber' },
      { href: '/admin/notifications', label: 'Notifications', icon: '🔔', permission: 'act.notifications' },
      { href: '/admin/disputes', label: 'Disputes', icon: '⚖️', permission: 'act.disputes', badgeCategory: 'disputes', badgeColor: 'red' },
      { href: '/admin/safety', label: 'Safety', icon: '🛡️', badgeCategory: 'safety', badgeColor: 'red' },
      { href: '/admin/users', label: 'Users', icon: '👥', permission: 'act.users', badgeCategory: 'users', badgeColor: 'green' },
      { href: '/admin/ride-requests', label: 'Ride Requests', icon: '🚖' },
      { href: '/admin/hmus', label: 'HMUs', icon: '📣' },
      { href: '/admin/suspect-usage', label: 'Suspect Usage', icon: '🚨', permission: 'act.suspect' },
    ],
  },
  {
    label: 'GROW',
    items: [
      { href: '/admin/marketing', label: 'Outreach', icon: '📣', permission: 'grow.outreach' },
      { href: '/admin/messages', label: 'Messages', icon: '💬', permission: 'grow.messages', badgeCategory: 'messages', badgeColor: 'green' },
      { href: '/admin/leads', label: 'Leads', icon: '📧', permission: 'grow.leads', badgeCategory: 'leads', badgeColor: 'green' },
      { href: '/admin/content', label: 'Content', icon: '🎬', permission: 'grow.content' },
      { href: '/admin/funnel', label: 'Funnel CMS', icon: '📝', permission: 'grow.funnel' },
      { href: '/admin/driver-playbook/fb-groups', label: 'Playbook FB Groups', icon: '👥' },
      { href: '/admin/conversation-agent', label: 'Conversation Agent', icon: '💬' },
      { href: '/admin/chat-booking', label: 'Chat Booking', icon: '🤖' },
    ],
  },
  {
    label: 'RAISE',
    items: [
      { href: '/admin/data-room', label: 'Data Room', icon: '🔒', permission: 'raise.dataroom' },
      { href: '/admin/pitch-videos', label: 'Pitch Videos', icon: '📱', permission: 'raise.pitch' },
      { href: '/admin/videos', label: 'Videos', icon: '🎥', permission: 'raise.videos' },
      { href: '/admin/docs', label: 'Tech Docs', icon: '📄', permission: 'raise.docs' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { href: '/admin/roles', label: 'Roles', icon: '🔑', permission: 'admin.roles' },
      { href: '/admin/markets', label: 'Markets', icon: '🌎' },
      { href: '/admin/feature-flags', label: 'Feature Flags', icon: '🚩' },
      { href: '/admin/hmu-config', label: 'HMU Config', icon: '📣' },
      { href: '/admin/onboarding-config', label: 'Onboarding Config', icon: '🛂' },
      { href: '/admin/realtime-notifications', label: 'Realtime Banners', icon: '⚡' },
      { href: '/admin/maintenance', label: 'Maintenance', icon: '🚧' },
      { href: '/admin/voip-debug', label: 'VoIP Debug', icon: '📡' },
      { href: '/admin/audit', label: 'Audit Log', icon: '📋', permission: 'admin.audit' },
    ],
  },
];

const BADGE_COLORS: Record<BadgeColor, string> = {
  green: 'bg-[#00E676]',
  red: 'bg-[#FF5252]',
  amber: 'bg-[#FFB300]',
};

export function AdminSidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const { theme, toggle: toggleTheme } = useAdminTheme();
  const { hasPermission, admin } = useAdminAuth();
  // When the preview banner is showing, both the desktop sidebar and the
  // mobile top bar need to start 36px lower so nothing is hidden behind it.
  const topOffset = admin?.isPreview ? 36 : 0;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const { markets, selectedMarketId, setSelectedMarketId } = useMarket();
  const { signOut } = useClerk();

  // Hydrate collapsed-sections from localStorage. Safe to run after mount
  // because the pre-hydration paint shows all sections expanded (matches
  // initial state), so no layout shift and no hydration mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('admin_sidebar_collapsed_sections');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (parsed && typeof parsed === 'object') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCollapsedSections(parsed);
      }
    } catch { /* ignore parse error */ }
  }, []);

  const toggleSection = useCallback((label: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem('admin_sidebar_collapsed_sections', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Filter nav sections by permissions. Default-deny: items without a
  // `permission` slug are super-only (treated as un-RBAC'd routes that haven't
  // been mapped to the matrix yet — see rbac_unmapped_routes_followup memory
  // for the proper rollout). When a super admin is previewing a lower role
  // their effective `is_super` flips to false, so they correctly see only
  // what that role would see.
  const filteredSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.permission) return hasPermission(`${item.permission}.view`);
        return admin?.isSuper ?? false;
      }),
    }))
    .filter((section) => section.items.length > 0);

  const fetchCounts = useCallback(() => {
    fetch('/api/admin/action-items/counts')
      .then(r => r.ok ? r.json() : {})
      .then(d => setBadgeCounts(d))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const handleAdminEvent = useCallback((msg: { name: string }) => {
    if (
      msg.name === 'sms_inbound' ||
      msg.name === 'message_read' ||
      msg.name === 'action_item_created' ||
      msg.name === 'action_item_resolved'
    ) {
      fetchCounts();
    }
    if (msg.name === 'safety_alert' || msg.name === 'safety_event_resolved') {
      fetchCounts();
    }
  }, [fetchCounts]);

  useAbly({ channelName: 'admin:feed', onMessage: handleAdminEvent });

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  // Close mobile nav on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div
        className="lg:hidden fixed left-0 right-0 z-50 px-4 py-3 flex items-center justify-between"
        style={{ top: topOffset, background: 'var(--admin-bg-elevated)', borderBottom: '1px solid var(--admin-border)' }}
      >
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-1 -ml-1"
          style={{ color: 'var(--admin-text-secondary)' }}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
        <span className="font-bold text-sm tracking-wide uppercase" style={{ color: 'var(--admin-text)' }}>{admin?.roleLabel || 'HMU Admin'}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="text-xs p-1 rounded"
            style={{ color: 'var(--admin-text-muted)' }}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <span className="text-xs truncate max-w-[100px]" style={{ color: 'var(--admin-text-muted)' }}>
            {filteredSections.flatMap(s => s.items).find(i => isActive(i.href))?.label || ''}
          </span>
        </div>
      </div>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 backdrop-blur-sm"
          style={{ background: theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed left-0 z-50
          flex flex-col transition-all duration-200 ease-in-out
          ${collapsed ? 'lg:w-16' : 'lg:w-64'}
          w-64
          lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          top: topOffset,
          height: `calc(100% - ${topOffset}px)`,
          background: 'var(--admin-bg-elevated)',
          borderRight: '1px solid var(--admin-border)',
        }}
      >
        {/* Header */}
        <div className={collapsed ? 'lg:p-3' : 'p-6'} style={{ borderBottom: '1px solid var(--admin-border)' }}>
          {/* Full header — hidden when collapsed on desktop */}
          <div className={collapsed ? 'lg:hidden' : ''}>
            <h1 className="text-lg font-bold tracking-wide uppercase">{admin?.roleLabel || 'HMU Admin'}</h1>
            <div className="text-[10px] font-semibold tracking-[2px] mt-0.5" style={{ color: 'var(--admin-text-faint)' }}>HMU ADMIN</div>
            {markets.length > 0 && (
              <select
                value={selectedMarketId || ''}
                onChange={(e) => setSelectedMarketId(e.target.value || null)}
                style={{
                  marginTop: 8, width: '100%', padding: '6px 10px',
                  background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', borderRadius: 8,
                  color: 'var(--admin-text)', fontSize: 12, fontWeight: 600,
                  appearance: 'none', cursor: 'pointer',
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23666\'/%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                }}
              >
                {markets.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.status.toUpperCase()}) — {m.driverCount}D / {m.riderCount}R
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Collapsed header — icon only, visible only when collapsed on desktop */}
          <div className={collapsed ? 'hidden lg:flex items-center justify-center' : 'hidden'}>
            <span className="text-lg font-bold">H</span>
          </div>
        </div>

        {/* Nav */}
        <nav className={`flex-1 overflow-y-auto ${collapsed ? 'lg:p-2 p-4' : 'p-4'} space-y-5`}>
          {filteredSections.map((section) => {
            // When sidebar is in icon-only desktop mode, section collapse is
            // irrelevant — items stay visible. On mobile / expanded desktop,
            // section collapse hides the items.
            const isSectionCollapsed = !!collapsedSections[section.label];
            const hideItems = isSectionCollapsed && !collapsed;
            // Unread badge sum for this section — surfaces under the collapsed
            // label so admins know work is stacking up even when folded away.
            const sectionBadge = section.items.reduce(
              (sum, item) => sum + (item.badgeCategory ? (badgeCounts[item.badgeCategory] ?? 0) : 0),
              0,
            );
            return (
              <div key={section.label}>
                {/* Section label — collapsible trigger. Hidden when sidebar is fully collapsed on desktop. */}
                <button
                  type="button"
                  onClick={() => toggleSection(section.label)}
                  className={`group w-full flex items-center justify-between px-3 py-2.5 mb-1 rounded-lg transition-colors active:bg-white/5 hover:bg-white/5 ${collapsed ? 'lg:hidden' : ''}`}
                  aria-expanded={!isSectionCollapsed}
                  style={{ color: 'var(--admin-text-secondary)' }}
                >
                  <span className="text-xs lg:text-[11px] font-bold tracking-[2.5px]">
                    {section.label}
                  </span>
                  <span className="flex items-center gap-2">
                    {isSectionCollapsed && sectionBadge > 0 && (
                      <span className="bg-[#00E676] text-black text-[10px] font-bold min-w-[20px] h-[20px] rounded-full flex items-center justify-center px-1.5">
                        {sectionBadge}
                      </span>
                    )}
                    <span
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-base transition-transform duration-150"
                      style={{
                        transform: isSectionCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        background: 'rgba(255,255,255,0.06)',
                      }}
                      aria-hidden
                    >
                      ▾
                    </span>
                  </span>
                </button>
                {/* Collapsed sidebar divider — visible only when sidebar is fully collapsed */}
                <div className={collapsed ? 'hidden lg:block mb-2 mx-2' : 'hidden'} style={{ borderTop: '1px solid var(--admin-border)' }} />

                <div className={`space-y-0.5 ${hideItems ? 'hidden' : ''}`}>
                  {section.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      title={collapsed ? item.label : undefined}
                      className={`
                        flex items-center rounded-lg text-sm font-medium transition-colors relative
                        ${collapsed ? 'lg:justify-center lg:px-0 lg:py-2.5 gap-0 px-3 py-2.5 gap-3' : 'gap-3 px-3 py-2.5'}
                      `}
                      style={{
                        background: isActive(item.href) ? 'var(--admin-bg-active)' : undefined,
                        color: isActive(item.href) ? 'var(--admin-text)' : 'var(--admin-text-secondary)',
                      }}
                    >
                      <span className={`text-base ${collapsed ? 'lg:text-lg' : ''}`}>{item.icon}</span>
                      <span className={`flex-1 ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                      {item.badgeCategory && (badgeCounts[item.badgeCategory] ?? 0) > 0 && (
                        <span className={`
                          ${BADGE_COLORS[item.badgeColor || 'green']} text-black text-[9px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1
                          ${collapsed ? 'lg:absolute lg:-top-0.5 lg:-right-0.5 lg:min-w-[14px] lg:h-[14px] lg:text-[7px]' : ''}
                        `}>
                          {badgeCounts[item.badgeCategory]}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={`space-y-1 ${collapsed ? 'lg:p-2 p-4' : 'p-4'}`} style={{ borderTop: '1px solid var(--admin-border)' }}>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={collapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
            className={`
              w-full flex items-center rounded-lg text-xs transition-colors
              ${collapsed ? 'lg:justify-center lg:px-0 lg:py-2 gap-0 px-3 py-2 gap-2' : 'gap-2 px-3 py-2'}
            `}
            style={{ color: 'var(--admin-text-secondary)' }}
          >
            <span>{theme === 'dark' ? '☀' : '☾'}</span>
            <span className={collapsed ? 'lg:hidden' : ''}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          <Link
            href="/driver/home"
            onClick={() => setMobileOpen(false)}
            title={collapsed ? 'Driver Dashboard' : undefined}
            className={`
              flex items-center rounded-lg text-xs transition-colors
              ${collapsed ? 'lg:justify-center lg:px-0 lg:py-2 gap-0 px-3 py-2 gap-2' : 'gap-2 px-3 py-2'}
            `}
            style={{ color: 'var(--admin-text-secondary)' }}
          >
            <span>🚗</span>
            <span className={collapsed ? 'lg:hidden' : ''}>Driver Dashboard</span>
          </Link>
          <button
            onClick={() => signOut({ redirectUrl: '/' })}
            title={collapsed ? 'Log Out' : undefined}
            className={`
              w-full text-left rounded-lg text-xs transition-colors
              ${collapsed ? 'lg:text-center lg:px-0 lg:py-2 px-3 py-2' : 'px-3 py-2'}
            `}
            style={{ color: 'var(--admin-danger)' }}
          >
            <span className={collapsed ? 'lg:hidden' : ''}>Log Out</span>
            <span className={collapsed ? 'hidden lg:inline' : 'hidden'}>✕</span>
          </button>

          {/* Collapse toggle — desktop only */}
          <button
            onClick={toggle}
            className="hidden lg:flex w-full items-center justify-center gap-2 px-3 py-2 mt-1 rounded-lg text-xs transition-colors"
            style={{ color: 'var(--admin-text-muted)' }}
          >
            <span style={{ transform: collapsed ? 'rotate(180deg)' : undefined, transition: 'transform 200ms' }}>
              ◀
            </span>
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Mobile spacer handled by AdminMain pt-16 */}
    </>
  );
}
