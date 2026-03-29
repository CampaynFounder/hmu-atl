'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useClerk } from '@clerk/nextjs';

const navSections = [
  {
    label: 'MONITOR',
    items: [
      { href: '/admin', label: 'Live Ops', icon: '⚡' },
      { href: '/admin/money', label: 'Revenue', icon: '💰' },
    ],
  },
  {
    label: 'ACT',
    items: [
      { href: '/admin/disputes', label: 'Disputes', icon: '⚖️' },
      { href: '/admin/users', label: 'Users', icon: '👥' },
    ],
  },
  {
    label: 'GROW',
    items: [
      { href: '/admin/marketing', label: 'Outreach', icon: '📣' },
      { href: '/admin/messages', label: 'Messages', icon: '💬', badge: true },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const { signOut } = useClerk();

  useEffect(() => {
    const fetchUnread = () => {
      fetch('/api/admin/messages/unread')
        .then(r => r.json())
        .then(d => setUnreadMessages(d.unread ?? 0))
        .catch(() => {});
    };
    fetchUnread();
    const i = setInterval(fetchUnread, 30000);
    return () => clearInterval(i);
  }, []);

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-sm tracking-wide">HMU ADMIN</span>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-neutral-400 hover:text-white p-1"
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-neutral-900 border-r border-neutral-800
          flex flex-col transition-transform duration-200
          lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="p-6 border-b border-neutral-800">
          <h1 className="text-lg font-bold tracking-wide">HMU ADMIN</h1>
          <p className="text-xs text-neutral-500 mt-1">Operations Portal</p>
        </div>

        <nav className="flex-1 p-4 space-y-5 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="px-3 mb-2 text-[10px] font-bold tracking-[3px] text-neutral-600">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${isActive(item.href)
                        ? 'bg-white/10 text-white'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'}
                    `}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {(item as { badge?: boolean }).badge && unreadMessages > 0 && (
                      <span className="bg-[#00E676] text-black text-[9px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                        {unreadMessages}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-neutral-800 space-y-1">
          <Link
            href="/driver/home"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <span>🚗</span>
            Driver Dashboard
          </Link>
          <button
            onClick={() => signOut({ redirectUrl: '/' })}
            className="w-full text-left px-3 py-2 rounded-lg text-xs text-red-400/70 hover:text-red-400 hover:bg-white/5 transition-colors"
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Mobile spacer */}
      <div className="lg:hidden h-14" />
    </>
  );
}
