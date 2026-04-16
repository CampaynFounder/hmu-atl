'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useAdminAuth } from './admin-auth-context';

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 29 * 60 * 1000; // Warning at 29 minutes

export function SessionTimeout() {
  const { admin } = useAdminAuth();
  const { signOut } = useClerk();
  const [showWarning, setShowWarning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Super admins are exempt
  if (admin?.isSuper) return null;

  const resetTimers = useCallback(() => {
    setShowWarning(false);
    if (warningRef.current) clearTimeout(warningRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    warningRef.current = setTimeout(() => {
      setShowWarning(true);
    }, WARNING_MS);

    timeoutRef.current = setTimeout(() => {
      signOut({ redirectUrl: '/admin/login' });
    }, TIMEOUT_MS);
  }, [signOut]);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    const handler = () => resetTimers();

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetTimers();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (warningRef.current) clearTimeout(warningRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [resetTimers]);

  if (!showWarning) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      padding: '12px 20px', borderRadius: 10,
      background: '#FFB300', color: '#000',
      fontSize: 13, fontWeight: 600,
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span>Session expiring in 1 minute</span>
      <button
        onClick={resetTimers}
        style={{
          padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
          background: '#000', color: '#FFB300', border: 'none', cursor: 'pointer',
        }}
      >
        Stay Active
      </button>
    </div>
  );
}
