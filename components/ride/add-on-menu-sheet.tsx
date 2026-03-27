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

interface AddOn {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  status: string;
  addedBy: string;
}

interface Props {
  rideId: string;
  open: boolean;
  onClose: () => void;
  agreedPrice: number;
  addOns: AddOn[];
  onAdded: (addOn: AddOn, total: number) => void;
  onRemoved: (addOnId: string, total: number) => void;
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
  orange: '#FF9100',
};

const FONTS = {
  display: "'Bebas Neue', sans-serif",
  body: "'DM Sans', sans-serif",
  mono: "'Space Mono', monospace",
};

export default function AddOnMenuSheet({ rideId, open, onClose, agreedPrice, addOns, onAdded, onRemoved }: Props) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
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
      })
      .catch(() => setError('Failed to load menu'))
      .finally(() => setLoading(false));
  }, [open, rideId]);

  const activeAddOns = addOns.filter(a => a.status !== 'removed' && a.status !== 'disputed');
  const extrasTotal = activeAddOns.reduce((sum, a) => sum + a.subtotal, 0);
  const rideTotal = agreedPrice + extrasTotal;

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
        setError(data.message || data.error || 'Failed to add');
        return;
      }

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

  const handleRemove = async (addOn: AddOn) => {
    if (removing) return;
    setRemoving(addOn.id);
    setError(null);

    try {
      const res = await fetch(`/api/rides/${rideId}/add-ons`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add_on_id: addOn.id, action: 'remove' }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to remove');
        return;
      }

      onRemoved(addOn.id, data.total);
    } catch {
      setError('Network error');
    } finally {
      setRemoving(null);
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
        maxHeight: '80vh', overflowY: 'auto',
        zIndex: 101, padding: '20px 20px 32px',
        animation: 'slideUp 0.25s ease-out',
      }}>
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Header */}
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

        {/* ── Your Order ── */}
        <div style={{
          background: COLORS.card2, border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, padding: '14px 16px', marginBottom: 16,
        }}>
          {/* Base fare */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8 }}>
            <span style={{ fontSize: 13, color: COLORS.grayLight }}>Base ride</span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 14, fontWeight: 700, color: COLORS.white }}>
              ${agreedPrice.toFixed(2)}
            </span>
          </div>

          {/* Active add-ons */}
          {activeAddOns.length > 0 && (
            <>
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                paddingTop: 8, marginTop: 0,
              }}>
                <div style={{
                  fontSize: 10, color: COLORS.gray, textTransform: 'uppercase',
                  letterSpacing: 1.5, fontFamily: FONTS.mono, marginBottom: 6,
                }}>
                  Extras
                </div>
                {activeAddOns.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '5px 0', gap: 8,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: COLORS.white }}>
                        {a.name}
                      </span>
                      {a.quantity > 1 && (
                        <span style={{
                          fontSize: 11, color: COLORS.orange, fontFamily: FONTS.mono,
                          marginLeft: 6,
                        }}>
                          &times;{a.quantity}
                        </span>
                      )}
                    </div>
                    <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.green, flexShrink: 0 }}>
                      ${a.subtotal.toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleRemove(a)}
                      disabled={removing === a.id}
                      style={{
                        background: 'rgba(255,82,82,0.12)', border: 'none',
                        borderRadius: 8, padding: '4px 10px',
                        color: COLORS.red, fontSize: 11, fontWeight: 700,
                        cursor: removing === a.id ? 'not-allowed' : 'pointer',
                        fontFamily: FONTS.body, flexShrink: 0,
                        opacity: removing === a.id ? 0.5 : 1,
                      }}
                    >
                      {removing === a.id ? '...' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>

              {/* Extras subtotal */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                paddingTop: 8, marginTop: 4,
                borderTop: '1px dashed rgba(255,255,255,0.06)',
                fontSize: 12, color: COLORS.gray,
              }}>
                <span>Extras subtotal</span>
                <span style={{ fontFamily: FONTS.mono, color: COLORS.green }}>
                  +${extrasTotal.toFixed(2)}
                </span>
              </div>
            </>
          )}

          {activeAddOns.length === 0 && (
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: 8, textAlign: 'center',
              fontSize: 12, color: COLORS.gray,
            }}>
              No extras added yet
            </div>
          )}

          {/* Total */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 10, marginTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.1)',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.white }}>
              Ride total
            </span>
            <span style={{
              fontFamily: FONTS.mono, fontSize: 20, fontWeight: 700,
              color: COLORS.green,
            }}>
              ${rideTotal.toFixed(2)}
            </span>
          </div>
        </div>

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

        {/* Empty menu */}
        {!loading && menu.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: COLORS.gray, fontSize: 14 }}>
            This driver has no menu items
          </div>
        )}

        {/* ── Available Menu Items ── */}
        {!loading && menu.length > 0 && (
          <>
            <div style={{
              fontSize: 10, color: COLORS.gray, textTransform: 'uppercase',
              letterSpacing: 1.5, fontFamily: FONTS.mono, marginBottom: 10,
            }}>
              Available
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {menu.map(item => {
                const isAdding = adding === item.id;
                // Count how many of this item are already added
                const existingCount = activeAddOns.filter(a => a.name === item.name).reduce((sum, a) => sum + a.quantity, 0);

                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: COLORS.card2, border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 14, padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon || '+'}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: COLORS.white, fontWeight: 500 }}>
                          {item.name}
                          {existingCount > 0 && (
                            <span style={{
                              fontSize: 11, color: COLORS.orange, fontFamily: FONTS.mono,
                              marginLeft: 6, fontWeight: 700,
                            }}>
                              ({existingCount} added)
                            </span>
                          )}
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
                      disabled={isAdding}
                      style={{
                        background: isAdding ? 'rgba(0,230,118,0.15)' : COLORS.green,
                        color: isAdding ? COLORS.green : COLORS.black,
                        border: 'none', borderRadius: 100,
                        padding: '8px 18px', fontSize: 13, fontWeight: 700,
                        cursor: isAdding ? 'not-allowed' : 'pointer',
                        fontFamily: FONTS.body,
                        minWidth: 60, textAlign: 'center',
                      }}
                    >
                      {isAdding ? '...' : existingCount > 0 ? '+1' : 'Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Done button */}
        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 20,
            padding: '14px', borderRadius: 100,
            background: COLORS.green, border: 'none',
            color: COLORS.black, fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: FONTS.body,
          }}
        >
          Done — ${rideTotal.toFixed(2)} total
        </button>
      </div>
    </>
  );
}
