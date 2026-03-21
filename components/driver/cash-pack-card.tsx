'use client';

import { useState, useEffect } from 'react';

interface CashBalance {
  freeRemaining: number;
  packBalance: number;
  total: number;
  unlimited: boolean;
}

export default function CashPackCard() {
  const [balance, setBalance] = useState<CashBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/driver/cash-packs')
      .then(r => r.json())
      .then(data => { if (!data.error) setBalance(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handlePurchase(pack: '10' | '25') {
    setPurchasing(pack);
    setError(null);
    try {
      const res = await fetch('/api/driver/cash-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(`+${pack === '10' ? 10 : 25} cash rides added!`);
        // Refresh balance
        const balRes = await fetch('/api/driver/cash-packs');
        if (balRes.ok) setBalance(await balRes.json());
        setTimeout(() => setSuccess(null), 3000);
      } else if (data.clientSecret) {
        // Need to collect payment first — for now redirect to profile
        setError('Please add a payment method in your profile first.');
      } else {
        setError(data.error || 'Purchase failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setPurchasing(null);
    }
  }

  if (loading || !balance) return null;
  if (balance.unlimited) return null; // HMU First — don't show

  return (
    <div style={{
      background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20, padding: '20px', marginBottom: 16,
    }}>
      <div style={{
        fontFamily: "var(--font-mono, 'Space Mono', monospace)",
        fontSize: 10, color: '#888', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10,
      }}>
        Cash Rides
      </div>

      {/* Balance display */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{
          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
          fontSize: 36, color: balance.total > 0 ? '#4CAF50' : '#FF5252', lineHeight: 1,
        }}>
          {balance.total}
        </span>
        <span style={{ fontSize: 13, color: '#888' }}>
          rides remaining
        </span>
      </div>

      <div style={{ fontSize: 11, color: '#555', marginBottom: 16 }}>
        {balance.freeRemaining > 0 && `${balance.freeRemaining} free (resets monthly)`}
        {balance.freeRemaining > 0 && balance.packBalance > 0 && ' + '}
        {balance.packBalance > 0 && `${balance.packBalance} from packs`}
      </div>

      {success && (
        <div style={{
          fontSize: 13, color: '#4CAF50', fontWeight: 600,
          padding: '8px 12px', background: 'rgba(76,175,80,0.08)',
          borderRadius: 10, marginBottom: 12, textAlign: 'center',
        }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{
          fontSize: 12, color: '#FF5252',
          padding: '8px 12px', background: 'rgba(255,68,68,0.08)',
          borderRadius: 10, marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {/* Purchase packs */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => handlePurchase('10')}
          disabled={!!purchasing}
          style={{
            flex: 1, padding: '14px 8px', borderRadius: 14,
            border: '1px solid rgba(76,175,80,0.3)', background: 'rgba(76,175,80,0.06)',
            cursor: purchasing ? 'not-allowed' : 'pointer',
            opacity: purchasing === '25' ? 0.5 : 1,
            textAlign: 'center',
          }}
        >
          <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 20, color: '#4CAF50' }}>
            10 Rides
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2 }}>$4.99</div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>$0.50 / ride</div>
        </button>
        <button
          onClick={() => handlePurchase('25')}
          disabled={!!purchasing}
          style={{
            flex: 1, padding: '14px 8px', borderRadius: 14,
            border: '2px solid rgba(76,175,80,0.5)', background: 'rgba(76,175,80,0.1)',
            cursor: purchasing ? 'not-allowed' : 'pointer',
            opacity: purchasing === '10' ? 0.5 : 1,
            textAlign: 'center', position: 'relative',
          }}
        >
          <div style={{
            position: 'absolute', top: -8, right: 10,
            background: '#4CAF50', color: '#000', fontSize: 9, fontWeight: 800,
            padding: '2px 8px', borderRadius: 100, letterSpacing: 1,
          }}>
            BEST VALUE
          </div>
          <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 20, color: '#4CAF50' }}>
            25 Rides
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2 }}>$9.99</div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>$0.40 / ride</div>
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#555', textAlign: 'center', marginTop: 10 }}>
        Packs never expire. HMU First gets unlimited cash rides.
      </div>
    </div>
  );
}
