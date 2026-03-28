'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useClerk } from '@clerk/nextjs';

const navItems = [
  { href: '/admin', label: 'Live Ops', icon: '⚡' },
  { href: '/admin/money', label: 'Money', icon: '💰' },
  { href: '/admin/disputes', label: 'Disputes', icon: '⚖️' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/marketing', label: 'Marketing', icon: '📣' },
];

const roles = [
  { value: 'both', label: 'Both (Admin + Driver)', color: 'text-purple-400' },
  { value: 'admin', label: 'Admin Only', color: 'text-blue-400' },
  { value: 'driver', label: 'Driver', color: 'text-green-400' },
  { value: 'rider', label: 'Rider', color: 'text-yellow-400' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<string>('');
  const [switching, setSwitching] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const { signOut } = useClerk();

  useEffect(() => {
    fetch('/api/admin/switch-role')
      .then((r) => r.json())
      .then((data) => { if (data.role) setCurrentRole(data.role); })
      .catch(() => {});
  }, []);

  const handleRoleSwitch = async (role: string) => {
    setSwitching(true);
    try {
      const res = await fetch('/api/admin/switch-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setCurrentRole(role);
        setShowRolePicker(false);
        // Redirect based on new role
        if (role === 'driver') router.push('/driver/home');
        else if (role === 'rider') router.push('/rider/home');
        // admin and both stay on admin
      }
    } catch {
      // ignore
    } finally {
      setSwitching(false);
    }
  };

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  const currentRoleInfo = roles.find((r) => r.value === currentRole);

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

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
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
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-neutral-800 space-y-3">
          {/* Role Switcher */}
          {currentRole && (
            <div>
              <button
                onClick={() => setShowRolePicker(!showRolePicker)}
                className="w-full flex items-center justify-between text-xs bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 hover:border-neutral-600 transition-colors"
              >
                <span className="text-neutral-500">Role:</span>
                <span className={currentRoleInfo?.color ?? 'text-white'}>
                  {currentRoleInfo?.label ?? currentRole}
                </span>
              </button>

              {showRolePicker && (
                <div className="mt-2 bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden">
                  {roles.map((role) => (
                    <button
                      key={role.value}
                      onClick={() => handleRoleSwitch(role.value)}
                      disabled={switching || role.value === currentRole}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        role.value === currentRole
                          ? 'bg-white/5 text-white font-medium'
                          : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                      } disabled:opacity-50`}
                    >
                      <span className={role.color}>{role.label}</span>
                      {role.value === currentRole && <span className="ml-1 text-neutral-600">(current)</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <Link
            href={currentRole === 'driver' || currentRole === 'both' ? '/driver/home' : '/'}
            className="block text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            {currentRole === 'driver' || currentRole === 'both' ? 'Driver Dashboard' : 'Back to App'}
          </Link>
          <button
            onClick={() => signOut({ redirectUrl: '/' })}
            className="block text-xs text-red-400/70 hover:text-red-400 transition-colors"
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
