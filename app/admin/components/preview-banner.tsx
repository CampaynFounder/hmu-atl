'use client';

import { useState } from 'react';
import { useAdminAuth } from './admin-auth-context';

export function PreviewBanner() {
  const { admin } = useAdminAuth();
  const [exiting, setExiting] = useState(false);

  if (!admin?.isPreview) return null;

  const exit = async () => {
    setExiting(true);
    try {
      await fetch('/api/admin/preview-role', { method: 'DELETE' });
      // Hard reload so the layout re-fetches without the cookie and every
      // permission-gated component re-renders against the real identity.
      window.location.href = '/admin';
    } catch {
      setExiting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        // Above the sidebar (z-50) and the mobile top bar (z-50) so the
        // exit affordance is always reachable.
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        background: 'linear-gradient(90deg, #FFB300 0%, #FF8F00 100%)',
        color: '#000',
        fontSize: 12,
        fontWeight: 600,
        borderBottom: '1px solid rgba(0,0,0,0.15)',
        height: 36,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14 }}>👁</span>
        <span>
          Previewing as{' '}
          <span style={{ background: 'rgba(0,0,0,0.15)', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace' }}>
            {admin.previewRoleLabel || admin.roleSlug || 'role'}
          </span>
        </span>
        <span style={{ opacity: 0.75, fontWeight: 500 }}>
          Read-only — sidebar, search, and pages reflect this role&apos;s permissions
        </span>
      </div>
      <button
        onClick={exit}
        disabled={exiting}
        style={{
          padding: '4px 14px',
          borderRadius: 6,
          background: '#000',
          color: '#FFB300',
          fontSize: 11,
          fontWeight: 700,
          border: 'none',
          cursor: exiting ? 'wait' : 'pointer',
          opacity: exiting ? 0.6 : 1,
          letterSpacing: 0.5,
        }}
      >
        {exiting ? 'EXITING…' : 'EXIT PREVIEW'}
      </button>
    </div>
  );
}
