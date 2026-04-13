'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useAbly } from '@/hooks/use-ably';
import { useMarket } from './market-context';
import { useSidebar } from './sidebar-context';

const navSections = [
  {
    label: 'MONITOR',
    items: [
      { href: '/admin', label: 'Live Ops', icon: '⚡' },
      { href: '/admin/money', label: 'Revenue', icon: '💰' },
      { href: '/admin/pricing', label: 'Pricing', icon: '⚙️' },
      { href: '/admin/schedule', label: 'Schedules', icon: '📅' },
    ],
  },
  {
    label: 'ACT',
    items: [
      { href: '/admin/support', label: 'Support', icon: '🎫' },
      { href: '/admin/notifications', label: 'Notifications', icon: '🔔' },
      { href: '/admin/disputes', label: 'Disputes', icon: '⚖️' },
      { href: '/admin/users', label: 'Users', icon: '👥' },
      { href: '/admin/suspect-usage', label: 'Suspect Usage', icon: '🚨' },
    ],
  },
  {
    label: 'GROW',
    items: [
      { href: '/admin/marketing', label: 'Outreach', icon: '📣' },
      { href: '/admin/messages', label: 'Messages', icon: '💬', badge: true },
      { href: '/admin/leads', label: 'Leads', icon: '📧' },
      { href: '/admin/content', label: 'Content', icon: '🎬' },
    ],
  },
  {
    label: 'RAISE',
    items: [
      { href: '/admin/data-room', label: 'Data Room', icon: '🔒' },
      { href: '/admin/pitch-videos', label: 'Pitch Videos', icon: '📱' },
      { href: '/admin/videos', label: 'Videos', icon: '🎥' },
      { href: '/admin/docs', label: 'Tech Docs', icon: '📄' },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const { markets, selectedMarketId, setSelectedMarketId } = useMarket();
  const { signOut } = useClerk();

  const fetchUnread = useCallback(() => {
    fetch('/api/admin/messages/unread')
      .then(r => r.json())
      .then(d => setUnreadMessages(d.unread ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchUnread(); }, [fetchUnread]);

  const handleAdminEvent = useCallback((msg: { name: string }) => {
    if (msg.name === 'sms_inbound') fetchUnread();
  }, [fetchUnread]);

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
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-neutral-400 hover:text-white p-1 -ml-1"
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
        <span className="font-bold text-sm tracking-wide">HMU ADMIN</span>
        {/* Current page indicator */}
        <span className="text-xs text-neutral-500 truncate max-w-[120px]">
          {navSections.flatMap(s => s.items).find(i => isActive(i.href))?.label || ''}
        </span>
      </div>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full bg-neutral-900 border-r border-neutral-800
          flex flex-col transition-all duration-200 ease-in-out
          ${collapsed ? 'lg:w-16' : 'lg:w-64'}
          w-64
          lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header */}
        <div className={`border-b border-neutral-800 ${collapsed ? 'lg:p-3' : 'p-6'}`}>
          {/* Full header — hidden when collapsed on desktop */}
          <div className={collapsed ? 'lg:hidden' : ''}>
            <h1 className="text-lg font-bold tracking-wide">HMU ADMIN</h1>
            {markets.length > 0 && (
              <select
                value={selectedMarketId || ''}
                onChange={(e) => setSelectedMarketId(e.target.value || null)}
                style={{
                  marginTop: 8, width: '100%', padding: '6px 10px',
                  background: '#1a1a1a', border: '1px solid #333', borderRadius: 8,
                  color: '#fff', fontSize: 12, fontWeight: 600,
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
          {navSections.map((section) => (
            <div key={section.label}>
              {/* Section label — hidden when collapsed */}
              <p className={`px-3 mb-2 text-[10px] font-bold tracking-[3px] text-neutral-600 ${collapsed ? 'lg:hidden' : ''}`}>
                {section.label}
              </p>
              {/* Collapsed divider — visible only when collapsed */}
              <div className={collapsed ? 'hidden lg:block mb-2 mx-2 border-t border-neutral-800' : 'hidden'} />

              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={`
                      flex items-center rounded-lg text-sm font-medium transition-colors relative
                      ${collapsed ? 'lg:justify-center lg:px-0 lg:py-2.5 gap-0 px-3 py-2.5 gap-3' : 'gap-3 px-3 py-2.5'}
                      ${isActive(item.href)
                        ? 'bg-white/10 text-white'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'}
                    `}
                  >
                    <span className={`text-base ${collapsed ? 'lg:text-lg' : ''}`}>{item.icon}</span>
                    <span className={`flex-1 ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                    {(item as { badge?: boolean }).badge && unreadMessages > 0 && (
                      <span className={`
                        bg-[#00E676] text-black text-[9px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1
                        ${collapsed ? 'lg:absolute lg:-top-0.5 lg:-right-0.5 lg:min-w-[14px] lg:h-[14px] lg:text-[7px]' : ''}
                      `}>
                        {unreadMessages}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={`border-t border-neutral-800 space-y-1 ${collapsed ? 'lg:p-2 p-4' : 'p-4'}`}>
          <Link
            href="/driver/home"
            onClick={() => setMobileOpen(false)}
            title={collapsed ? 'Driver Dashboard' : undefined}
            className={`
              flex items-center rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-white/5 transition-colors
              ${collapsed ? 'lg:justify-center lg:px-0 lg:py-2 gap-0 px-3 py-2 gap-2' : 'gap-2 px-3 py-2'}
            `}
          >
            <span>🚗</span>
            <span className={collapsed ? 'lg:hidden' : ''}>Driver Dashboard</span>
          </Link>
          <button
            onClick={() => signOut({ redirectUrl: '/' })}
            title={collapsed ? 'Log Out' : undefined}
            className={`
              w-full text-left rounded-lg text-xs text-red-400/70 hover:text-red-400 hover:bg-white/5 transition-colors
              ${collapsed ? 'lg:text-center lg:px-0 lg:py-2 px-3 py-2' : 'px-3 py-2'}
            `}
          >
            <span className={collapsed ? 'lg:hidden' : ''}>Log Out</span>
            <span className={collapsed ? 'hidden lg:inline' : 'hidden'}>✕</span>
          </button>

          {/* Collapse toggle — desktop only */}
          <button
            onClick={toggle}
            className="hidden lg:flex w-full items-center justify-center gap-2 px-3 py-2 mt-1 rounded-lg text-xs text-neutral-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <span style={{ transform: collapsed ? 'rotate(180deg)' : undefined, transition: 'transform 200ms' }}>
              ◀
            </span>
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Mobile spacer */}
      <div className="lg:hidden h-14" />
    </>
  );
}
