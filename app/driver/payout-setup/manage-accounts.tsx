'use client';

import { useState, useEffect } from 'react';

interface ExternalAccount {
  id: string;
  type: string;
  last4: string;
  bankName?: string;
  brand?: string;
  isDefault: boolean;
  status?: string;
}

export default function ManageAccounts({ onUpdate }: { onUpdate: () => void }) {
  const [accounts, setAccounts] = useState<ExternalAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/driver/payout-setup/bank');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const openStripeDashboard = async () => {
    setOpening(true);
    setError(null);
    try {
      const res = await fetch('/api/driver/payout-setup/update', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to open Stripe');
      }
    } catch {
      setError('Network error');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div style={{
      background: '#141414',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '20px',
      padding: '24px 20px',
      marginBottom: '16px',
    }}>
      <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Payout Accounts</div>

      {error && (
        <div style={{
          background: 'rgba(255,68,68,0.1)',
          border: '1px solid rgba(255,68,68,0.25)',
          borderRadius: '12px',
          padding: '10px 14px',
          fontSize: '13px',
          color: '#FF5252',
          marginBottom: '12px',
        }}>
          {error}
        </div>
      )}

      {/* Current accounts */}
      {loading ? (
        <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Loading accounts...</div>
      ) : accounts.length === 0 ? (
        <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
          No payout accounts linked.
        </div>
      ) : (
        <div style={{ marginBottom: '16px' }}>
          {accounts.map((acct) => (
            <div key={acct.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '14px 16px', background: '#1a1a1a', borderRadius: '14px',
              marginBottom: '8px',
              border: acct.isDefault ? '1px solid rgba(0,230,118,0.2)' : '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontSize: '22px' }}>{acct.type === 'card' ? '💳' : '🏦'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>
                  {acct.bankName || acct.brand || (acct.type === 'card' ? 'Debit Card' : 'Bank Account')}
                </div>
                <div style={{ fontSize: '12px', color: '#888', fontFamily: 'var(--font-mono, Space Mono, monospace)' }}>
                  •••• {acct.last4}
                  {acct.isDefault && (
                    <span style={{ color: '#00E676', marginLeft: '8px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px' }}>
                      DEFAULT
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Update / Add via Stripe Dashboard */}
      <button
        type="button"
        onClick={openStripeDashboard}
        disabled={opening}
        style={{
          display: 'block',
          width: '100%',
          padding: '14px',
          borderRadius: '100px',
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'transparent',
          color: '#bbb',
          fontSize: '14px',
          fontWeight: 600,
          cursor: opening ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-body, DM Sans, sans-serif)',
          opacity: opening ? 0.5 : 1,
          marginBottom: '8px',
        }}
      >
        {opening ? 'Opening Stripe...' : accounts.length > 0 ? 'Change Payout Account' : 'Add Payout Account'}
      </button>

      <p style={{ fontSize: '11px', color: '#555', textAlign: 'center', lineHeight: 1.4 }}>
        Opens Stripe where you can add, change, or remove bank accounts and debit cards.
      </p>
    </div>
  );
}
