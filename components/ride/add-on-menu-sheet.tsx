'use client';

import { useState, useEffect } from 'react';

interface MenuItem {
  id: string;
  name: string;
  icon: string | null;
  price: number;
  pricing_type: string;
  unit_label: string | null;
  category: string;
}

interface Props {
  rideId: string;
  open: boolean;
  onClose: () => void;
  onAdded: (addOn: { id: string; name: string; unitPrice: number; quantity: number; subtotal: number; status: string; addedBy: string }, total: number) => void;
}

const COLORS = {
  green: '#00E676',
  black: '#080808',
  card: '#141414',
  card2: '#1a1a1a',
  white: '#FFFFFF',
  gray: '#888888',
  grayLight: '#AAAAAA',
  red: '#FF5252',
};

const FONTS = {
  display: "'Bebas Neue', sans-serif",
  body: "'DM Sans', sans-serif",
  mono: "'Space Mono', monospace",
};

export default function AddOnMenuSheet({ rideId, open, onClose, onAdded }: Props) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch(`/api/rides/${rideId}/menu`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setMenu(data.menu || []);
        setRemaining(data.remaining ?? 0);
      })
      .catch(() => setError('Failed to load menu'))
      .finally(() => setLoading(false));
  }, [open, rideId]);

  const handleAdd = async (item: MenuItem) => {
    if (adding) return;
    setAdding(item.id);
    setError(null);

    try {
      const res = await fetch(`/api/rides/${rideId}/add-ons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_item_id: item.id, quantity: 1 }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'add_on_limit') {
          setError(data.message);
          setRemaining(data.remaining ?? 0);
        } else {
          setError(data.error || 'Failed to add');
        }
        return;
      }

      // Update remaining
      setRemaining(prev => Math.max(0, prev - Number(item.price)));

      onAdded({
        id: data.addOn.id,
        name: data.addOn.name,
        unitPrice: Number(data.addOn.unit_price ?? item.price),
        quantity: Number(data.addOn.quantity ?? 1),
        subtotal: Number(data.addOn.subtotal ?? item.price),
        status: 'pre_selected',
        addedBy: 'rider',
      }, data.total);
    } catch {
      setError('Network error');
    } finally {
      setAdding(null);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 100, transition: 'opacity 0.2s',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: COLORS.card, borderRadius: '20px 20px 0 0',
        maxHeight: '70vh', overflowY: 'auto',
        zIndex: 101, padding: '20px 20px 32px',
        animation: 'slideUp 0.25s ease-out',
      }}>
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>

        {/* Handle + Header */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: FONTS.display, fontSize: 24, color: COLORS.white }}>
              Driver Menu
            </div>
            <div style={{ fontSize: 12, color: COLORS.gray }}>
              Add extras to your ride
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%',
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: COLORS.grayLight, fontSize: 18, cursor: 'pointer',
            }}
          >
            &times;
          </button>
        </div>

        {/* Budget remaining */}
        {remaining > 0 && (
          <div style={{
            background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)',
            borderRadius: 12, padding: '10px 14px', marginBottom: 16,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: COLORS.grayLight }}>Available for extras</span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 14, fontWeight: 700, color: COLORS.green }}>
              ${remaining.toFixed(2)}
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.2)',
            borderRadius: 12, padding: '10px 14px', marginBottom: 16,
            fontSize: 13, color: COLORS.red,
          }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: COLORS.gray, fontSize: 14 }}>
            Loading menu...
          </div>
        )}

        {/* Empty */}
        {!loading && menu.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: COLORS.gray, fontSize: 14 }}>
            This driver has no menu items
          </div>
        )}

        {/* Menu items */}
        {!loading && menu.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {menu.map(item => {
              const isAdding = adding === item.id;
              const canAfford = remaining >= Number(item.price);

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: COLORS.card2, border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 14, padding: '12px 14px',
                    opacity: !canAfford && remaining > 0 ? 0.4 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon || '+'}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: COLORS.white, fontWeight: 500 }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.gray, fontFamily: FONTS.mono }}>
                        ${Number(item.price).toFixed(2)}
                        {item.pricing_type === 'per_unit' && item.unit_label ? `/${item.unit_label}` : ''}
                        {item.pricing_type === 'per_minute' ? '/min' : ''}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAdd(item)}
                    disabled={isAdding || (!canAfford && remaining > 0)}
                    style={{
                      background: isAdding ? 'rgba(0,230,118,0.15)' : COLORS.green,
                      color: isAdding ? COLORS.green : COLORS.black,
                      border: 'none', borderRadius: 100,
                      padding: '8px 18px', fontSize: 13, fontWeight: 700,
                      cursor: isAdding || (!canAfford && remaining > 0) ? 'not-allowed' : 'pointer',
                      fontFamily: FONTS.body,
                      opacity: !canAfford && remaining > 0 ? 0.5 : 1,
                      minWidth: 70, textAlign: 'center',
                    }}
                  >
                    {isAdding ? '...' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
