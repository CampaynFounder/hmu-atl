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
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountType, setAccountType] = useState<'individual' | 'company'>('individual');
  const [adding, setAdding] = useState(false);

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

  const handleAdd = async () => {
    setError(null);
    if (!routingNumber || routingNumber.length !== 9) { setError('Routing number must be 9 digits'); return; }
    if (!accountNumber || accountNumber.length < 4) { setError('Enter a valid account number'); return; }
    if (accountNumber !== confirmAccountNumber) { setError('Account numbers do not match'); return; }
    if (!accountHolderName.trim()) { setError('Enter the account holder name'); return; }

    setAdding(true);
    try {
      const res = await fetch('/api/driver/payout-setup/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routingNumber, accountNumber, accountHolderName, accountType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
      } else {
        setShowAddForm(false);
        setRoutingNumber('');
        setAccountNumber('');
        setConfirmAccountNumber('');
        setAccountHolderName('');
        fetchAccounts();
        onUpdate();
      }
    } catch {
      setError('Network error');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm('Remove this payout account?')) return;
    setDeleting(accountId);
    setError(null);
    try {
      const res = await fetch('/api/driver/payout-setup/bank', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
      } else {
        fetchAccounts();
        onUpdate();
      }
    } catch {
      setError('Network error');
    } finally {
      setDeleting(null);
    }
  };

  const s = {
    card: { background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px 20px', marginBottom: '16px' } as React.CSSProperties,
    label: { display: 'block', fontSize: '12px', color: '#888', marginBottom: '6px', fontWeight: 600 } as React.CSSProperties,
    input: { width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: '#1a1a1a', color: '#fff', fontSize: '15px', fontFamily: 'var(--font-mono, Space Mono, monospace)', outline: 'none', boxSizing: 'border-box' as const, marginBottom: '12px' } as React.CSSProperties,
    btn: { width: '100%', padding: '16px', borderRadius: '100px', border: 'none', fontWeight: 700, fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font-body, DM Sans, sans-serif)' } as React.CSSProperties,
  };

  return (
    <div style={s.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700 }}>Payout Accounts</div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{ background: 'none', border: '1px solid rgba(0,230,118,0.3)', color: '#00E676', fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 100, cursor: 'pointer', fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}
          >
            + Add Account
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.25)', borderRadius: '12px', padding: '10px 14px', fontSize: '13px', color: '#FF5252', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* Existing accounts */}
      {loading ? (
        <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Loading accounts...</div>
      ) : accounts.length === 0 && !showAddForm ? (
        <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
          No payout accounts linked. Tap "+ Add Account" to get started.
        </div>
      ) : (
        <div style={{ marginBottom: showAddForm ? '16px' : 0 }}>
          {accounts.map((acct) => (
            <div key={acct.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '14px 16px', background: '#1a1a1a', borderRadius: '14px',
              marginBottom: '8px', border: acct.isDefault ? '1px solid rgba(0,230,118,0.2)' : '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontSize: '22px' }}>{acct.type === 'card' ? '💳' : '🏦'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>
                  {acct.bankName || acct.brand || (acct.type === 'card' ? 'Debit Card' : 'Bank Account')}
                </div>
                <div style={{ fontSize: '12px', color: '#888', fontFamily: 'var(--font-mono, Space Mono, monospace)' }}>
                  •••• {acct.last4}
                  {acct.isDefault && <span style={{ color: '#00E676', marginLeft: '8px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px' }}>DEFAULT</span>}
                </div>
              </div>
              <button
                onClick={() => handleDelete(acct.id)}
                disabled={deleting === acct.id}
                style={{
                  background: 'none', border: '1px solid rgba(255,68,68,0.3)',
                  color: '#FF5252', fontSize: '11px', fontWeight: 600,
                  padding: '5px 12px', borderRadius: '100px', cursor: 'pointer',
                  fontFamily: 'var(--font-body, DM Sans, sans-serif)',
                  opacity: deleting === acct.id ? 0.4 : 1,
                }}
              >
                {deleting === acct.id ? '...' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add bank account form */}
      {showAddForm && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Add Bank Account</div>

          <label style={s.label}>Account Holder Name</label>
          <input
            type="text"
            value={accountHolderName}
            onChange={(e) => setAccountHolderName(e.target.value)}
            placeholder="Your full legal name"
            style={{ ...s.input, fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}
          />

          <label style={s.label}>Routing Number (9 digits)</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={9}
            value={routingNumber}
            onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, ''))}
            placeholder="021000021"
            style={s.input}
          />

          <label style={s.label}>Account Number</label>
          <input
            type="password"
            inputMode="numeric"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
            placeholder="••••••••"
            style={s.input}
          />

          <label style={s.label}>Confirm Account Number</label>
          <input
            type="text"
            inputMode="numeric"
            value={confirmAccountNumber}
            onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/\D/g, ''))}
            placeholder="Re-enter account number"
            style={s.input}
          />

          <label style={s.label}>Account Type</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {(['individual', 'company'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setAccountType(type)}
                style={{
                  flex: 1, padding: '12px', borderRadius: '12px', cursor: 'pointer',
                  border: accountType === type ? '2px solid #00E676' : '2px solid rgba(255,255,255,0.08)',
                  background: accountType === type ? 'rgba(0,230,118,0.06)' : '#1a1a1a',
                  color: accountType === type ? '#00E676' : '#888',
                  fontSize: '14px', fontWeight: 600, textTransform: 'capitalize',
                  fontFamily: 'var(--font-body, DM Sans, sans-serif)',
                }}
              >
                {type}
              </button>
            ))}
          </div>

          <button
            onClick={handleAdd}
            disabled={adding}
            style={{ ...s.btn, background: adding ? 'rgba(0,230,118,0.3)' : '#00E676', color: '#080808' }}
          >
            {adding ? 'Adding...' : 'Add Bank Account'}
          </button>

          <button
            onClick={() => { setShowAddForm(false); setError(null); }}
            style={{ ...s.btn, background: 'transparent', color: '#888', border: '1px solid rgba(255,255,255,0.1)', marginTop: '8px' }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
