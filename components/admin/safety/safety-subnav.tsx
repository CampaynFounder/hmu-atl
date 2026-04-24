'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { href: string; label: string }[] = [
  { href: '/admin/safety', label: 'Queue' },
  { href: '/admin/safety/archive', label: 'Archive' },
  { href: '/admin/safety/test', label: 'Test' },
];

export default function SafetySubNav() {
  const pathname = usePathname();
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              borderRadius: 10, textDecoration: 'none',
              background: active ? 'var(--admin-bg-active)' : 'transparent',
              color: active ? 'var(--admin-text)' : 'var(--admin-text-secondary)',
              border: '1px solid',
              borderColor: active ? 'var(--admin-border)' : 'transparent',
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
