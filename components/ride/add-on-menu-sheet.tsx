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

const C = { green: '#00E676', black: '#080808', card: '#141414', card2: '#1a1a1a', white: '#fff', gray: '#888', grayLight: '#aaa', red: '#FF5252', orange: '#FF9100' };

export default function AddOnMenuSheet({ rideId, open, onClose, agreedPrice, addOns, onAdded, onRemoved }: Props) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reserve, setReserve] = useState(0);
  const [isCash, setIsCash] = useState(false);
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
        setReserve(data.reserve ?? 0);
        setIsCash(data.isCash ?? false);
      })
      .catch(() => setError('Failed to load menu'))
      .finally(() => setLoading(false));
  }, [open, rideId]);

  const activeAddOns = addOns.filter(a => !['removed', 'rejected'].includes(a.status));
  const confirmedTotal = addOns.filter(a => a.status === 'confirmed' || a.status === 'adjusted').reduce((s, a) => s + Number(a.subtotal || 0), 0);
  const safePrice = Number(agreedPrice || 0);
  const remaining = Math.max(0, reserve - confirmedTotal);

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
      if (!res.ok) { setError(data.message || data.error || 'Failed to add'); return; }
      onAdded({
        id: data.addOn.id, name: data.addOn.name,
        unitPrice: Number(data.addOn.unit_price ?? item.price),
        quantity: Number(data.addOn.quantity ?? 1),
        subtotal: Number(data.addOn.subtotal ?? item.price),
        status: 'pending_driver', addedBy: 'rider',
      }, data.total);
    } catch { setError('Network error'); }
    finally { setAdding(null); }
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
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      onRemoved(addOn.id, data.total);
    } catch { setError('Network error'); }
    finally { setRemoving(null); }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 }} />

      {/* Sheet — fixed layout: header + scrollable body + fixed footer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: C.card, borderRadius: '20px 20px 0 0',
        zIndex: 101, display: 'flex', flexDirection: 'column',
        maxHeight: '85vh',
        animation: 'addOnSlideUp 0.25s ease-out',
      }}>
        <style>{`@keyframes addOnSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* ── Fixed header ── */}
        <div style={{
          padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.white }}>Driver Menu</div>
            <div style={{ fontSize: 11, color: C.gray }}>
              {activeAddOns.length > 0
                ? `${activeAddOns.reduce((s, a) => s + (a.quantity || 1), 0)} item${activeAddOns.reduce((s, a) => s + (a.quantity || 1), 0) > 1 ? 's' : ''} selected`
                : 'Add extras to your ride'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.white, fontSize: 16, cursor: 'pointer', fontWeight: 700, flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', minHeight: 0 }}>
          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.2)',
              borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: C.red,
            }}>{error}</div>
          )}

          {/* Your selections — grouped by name */}
          {activeAddOns.length > 0 && (() => {
            const groups: { name: string; totalQty: number; totalSub: number; status: string; ids: string[] }[] = [];
            for (const a of activeAddOns) {
              const existing = groups.find(g => g.name === a.name && g.status === a.status);
              if (existing) {
                existing.totalQty += (a.quantity || 1);
                existing.totalSub += Number(a.subtotal || 0);
                existing.ids.push(a.id);
              } else {
                groups.push({ name: a.name, totalQty: a.quantity || 1, totalSub: Number(a.subtotal || 0), status: a.status, ids: [a.id] });
              }
            }
            return (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: C.gray, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>
                  Your Selections
                </div>
                {groups.map(g => {
                  const isPending = g.status === 'pending_driver';
                  const isConfirmed = g.status === 'confirmed';
                  const isRemovalPending = g.status === 'removal_pending';
                  const canRemove = (isPending || isConfirmed);
                  const lastId = g.ids[g.ids.length - 1];

                  return (
                    <div key={g.ids.join(',')} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      opacity: isRemovalPending ? 0.4 : 1,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, color: C.white }}>{g.name}</span>
                        {g.totalQty > 1 && <span style={{ fontSize: 11, color: C.orange, marginLeft: 4 }}>x{g.totalQty}</span>}
                        <span style={{ fontSize: 11, color: isPending ? C.orange : isConfirmed ? C.green : C.gray, marginLeft: 6 }}>
                          {isPending ? '(pending)' : isConfirmed ? '✓' : isRemovalPending ? '(removing...)' : ''}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: isConfirmed ? C.green : C.gray, fontWeight: 600, flexShrink: 0 }}>
                        ${g.totalSub.toFixed(2)}
                      </span>
                      {canRemove && (
                        <button
                          onClick={() => handleRemove({ id: lastId, name: g.name, unitPrice: 0, quantity: 1, subtotal: g.totalSub / g.totalQty, status: g.status, addedBy: 'rider' })}
                          style={{
                            background: 'none', border: 'none', color: C.red,
                            fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '2px 6px', flexShrink: 0,
                          }}
                        >
                          {removing === lastId ? '...' : '✕'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Budget indicator */}
          {!isCash && reserve > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 0 10px', fontSize: 11, color: C.gray,
            }}>
              <span>Extras budget</span>
              <span style={{ color: remaining > 0 ? C.green : C.orange, fontWeight: 600 }}>
                ${remaining.toFixed(2)} left
              </span>
            </div>
          )}

          {/* Loading */}
          {loading && <div style={{ textAlign: 'center', padding: '30px 0', color: C.gray, fontSize: 13 }}>Loading menu...</div>}

          {/* Empty */}
          {!loading && menu.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: C.gray, fontSize: 13 }}>This driver has no menu items</div>
          )}

          {/* Available items — compact rows */}
          {!loading && menu.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: C.gray, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>
                Available
              </div>
              {menu.map(item => {
                const isAdding = adding === item.id;
                const existingCount = activeAddOns.filter(a => a.name === item.name).reduce((s, a) => s + a.quantity, 0);
                const noReserve = !isCash && reserve === 0;
                const overBudget = !isCash && reserve > 0 && Number(item.price) > remaining;
                const disabled = isAdding || noReserve || overBudget;

                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <span style={{ fontSize: 18, flexShrink: 0, width: 24, textAlign: 'center' }}>{item.icon || '+'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.white }}>
                        {item.name}
                        {existingCount > 0 && <span style={{ fontSize: 10, color: C.orange, marginLeft: 4 }}>({existingCount})</span>}
                      </div>
                      <div style={{ fontSize: 11, color: C.gray }}>
                        ${Number(item.price).toFixed(2)}
                        {item.pricing_type === 'per_unit' && item.unit_label ? `/${item.unit_label}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAdd(item)}
                      disabled={disabled}
                      style={{
                        background: disabled ? 'rgba(255,255,255,0.06)' : C.green,
                        color: disabled ? C.gray : C.black,
                        border: 'none', borderRadius: 100, padding: '6px 14px',
                        fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
                        flexShrink: 0, minWidth: 44,
                      }}
                    >
                      {isAdding ? '...' : 'Add'}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* ── Fixed footer ── */}
        <div style={{
          padding: '12px 20px 24px', borderTop: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0, background: C.card,
        }}>
          {/* Total */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
          }}>
            <span style={{ fontSize: 13, color: C.grayLight }}>Ride total</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: C.green }}>
              ${(safePrice + confirmedTotal).toFixed(2)}
            </span>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '12px', borderRadius: 100,
                border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                color: C.grayLight, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '12px', borderRadius: 100,
                border: 'none', background: C.green, color: C.black,
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {activeAddOns.length > 0 ? 'Request Extras' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
