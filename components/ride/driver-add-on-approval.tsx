'use client';

import { useState } from 'react';

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
  addOns: AddOn[];
  agreedPrice: number;
  onUpdated: (addOns: AddOn[], total: number) => void;
}

const C = { green: '#00E676', black: '#080808', card: '#141414', white: '#fff', gray: '#888', grayLight: '#aaa', red: '#FF5252', orange: '#FF9100' };

export default function DriverAddOnApproval({ rideId, addOns, agreedPrice, onUpdated }: Props) {
  const [acting, setActing] = useState<string | null>(null);
  const [actingAll, setActingAll] = useState(false);

  const pendingItems = addOns.filter(a => a.status === 'pending_driver');
  const confirmedItems = addOns.filter(a => a.status === 'confirmed' || a.status === 'adjusted');
  const removalPending = addOns.filter(a => a.status === 'removal_pending');
  const confirmedTotal = confirmedItems.reduce((s, a) => s + Number(a.subtotal || 0), 0);

  // Group items by name+status for compact display
  function groupItems(items: AddOn[]) {
    const groups: { name: string; totalQty: number; totalSub: number; ids: string[]; lastId: string }[] = [];
    for (const a of items) {
      const existing = groups.find(g => g.name === a.name);
      if (existing) {
        existing.totalQty += (a.quantity || 1);
        existing.totalSub += Number(a.subtotal || 0);
        existing.ids.push(a.id);
        existing.lastId = a.id;
      } else {
        groups.push({ name: a.name, totalQty: a.quantity || 1, totalSub: Number(a.subtotal || 0), ids: [a.id], lastId: a.id });
      }
    }
    return groups;
  }

  const pendingGroups = groupItems(pendingItems);
  const confirmedGroups = groupItems(confirmedItems);
  const removalGroups = groupItems(removalPending);

  const hasActionItems = pendingItems.length > 0 || removalPending.length > 0;
  if (!hasActionItems && confirmedItems.length === 0) return null;

  async function handleAction(addOnId: string, action: string) {
    setActing(addOnId + action);
    try {
      const res = await fetch(`/api/rides/${rideId}/add-ons`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add_on_id: addOnId, action }),
      });
      const data = await res.json();
      if (res.ok && data.addOns) onUpdated(data.addOns, data.total);
    } catch { /* handled by parent */ }
    setActing(null);
  }

  async function handleApproveAll() {
    setActingAll(true);
    try {
      const res = await fetch(`/api/rides/${rideId}/add-ons`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_all' }),
      });
      const data = await res.json();
      if (res.ok && data.addOns) onUpdated(data.addOns, data.total);
    } catch { /* */ }
    setActingAll(false);
  }

  async function handleDriverRemove(addOnId: string) {
    setActing(addOnId + 'driverRemove');
    try {
      const res = await fetch(`/api/rides/${rideId}/add-ons`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add_on_id: addOnId, action: 'reject' }),
      });
      const data = await res.json();
      if (res.ok && data.addOns) onUpdated(data.addOns, data.total);
    } catch { /* */ }
    setActing(null);
  }

  return (
    <div style={{
      background: C.card, border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16, padding: '14px 16px', marginBottom: 8,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.white }}>
          Rider Extras
          {pendingItems.length > 0 && (
            <span style={{ fontSize: 11, color: C.orange, marginLeft: 6, fontWeight: 400 }}>
              {pendingItems.length} pending
            </span>
          )}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.green }}>
          +${confirmedTotal.toFixed(2)}
        </div>
      </div>

      {/* Pending items — need approval (grouped) */}
      {pendingGroups.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: C.orange, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Awaiting your approval
          </div>
          {pendingGroups.map(g => (
            <div key={g.ids.join(',')} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, color: C.white }}>{g.name}</span>
                {g.totalQty > 1 && <span style={{ fontSize: 11, color: C.orange, marginLeft: 4 }}>x{g.totalQty}</span>}
              </div>
              <span style={{ fontSize: 12, color: C.grayLight, fontWeight: 600, flexShrink: 0 }}>
                ${g.totalSub.toFixed(2)}
              </span>
              <button
                onClick={() => handleAction(g.lastId, 'confirm')}
                disabled={acting === g.lastId + 'confirm'}
                style={{
                  background: C.green, color: C.black, border: 'none', borderRadius: 100,
                  padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                }}
              >
                {acting === g.lastId + 'confirm' ? '...' : '✓'}
              </button>
              <button
                onClick={() => handleAction(g.lastId, 'reject')}
                disabled={acting === g.lastId + 'reject'}
                style={{
                  background: 'rgba(255,82,82,0.15)', color: C.red, border: 'none', borderRadius: 100,
                  padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                }}
              >
                {acting === g.lastId + 'reject' ? '...' : '✕'}
              </button>
            </div>
          ))}
          {/* Approve all */}
          {pendingItems.length > 1 && (
            <button
              onClick={handleApproveAll}
              disabled={actingAll}
              style={{
                width: '100%', marginTop: 8, padding: '8px', borderRadius: 100,
                background: 'rgba(0,230,118,0.12)', border: '1px solid rgba(0,230,118,0.25)',
                color: C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {actingAll ? 'Approving...' : `Approve All ${pendingItems.length} Items`}
            </button>
          )}
        </div>
      )}

      {/* Removal requests — grouped */}
      {removalGroups.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: C.red, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Removal requests
          </div>
          {removalGroups.map(g => (
            <div key={g.ids.join(',')} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: C.grayLight, textDecoration: 'line-through' }}>{g.name}</span>
                {g.totalQty > 1 && <span style={{ fontSize: 11, color: C.gray, marginLeft: 4 }}>x{g.totalQty}</span>}
              </div>
              <span style={{ fontSize: 12, color: C.gray, flexShrink: 0 }}>${g.totalSub.toFixed(2)}</span>
              <button
                onClick={() => handleAction(g.lastId, 'confirm_removal')}
                disabled={acting === g.lastId + 'confirm_removal'}
                style={{
                  background: 'rgba(255,82,82,0.15)', color: C.red, border: 'none', borderRadius: 100,
                  padding: '4px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                }}
              >
                {acting === g.lastId + 'confirm_removal' ? '...' : 'Remove'}
              </button>
              <button
                onClick={() => handleAction(g.lastId, 'reject_removal')}
                disabled={acting === g.lastId + 'reject_removal'}
                style={{
                  background: 'rgba(255,255,255,0.06)', color: C.grayLight, border: 'none', borderRadius: 100,
                  padding: '4px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                }}
              >
                {acting === g.lastId + 'reject_removal' ? '...' : 'Keep'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Confirmed items — grouped, driver can remove */}
      {confirmedGroups.length > 0 && (
        <div>
          {(pendingGroups.length > 0 || removalGroups.length > 0) && (
            <div style={{ fontSize: 10, color: C.gray, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Confirmed
            </div>
          )}
          {confirmedGroups.map(g => (
            <div key={g.ids.join(',')} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}>
              <span style={{ fontSize: 12, color: C.green, flexShrink: 0 }}>✓</span>
              <span style={{ flex: 1, fontSize: 12, color: C.grayLight }}>
                {g.name}
                {g.totalQty > 1 && <span style={{ color: C.orange, marginLeft: 4 }}>x{g.totalQty}</span>}
              </span>
              <span style={{ fontSize: 12, color: C.green, fontWeight: 600, flexShrink: 0 }}>
                ${g.totalSub.toFixed(2)}
              </span>
              <button
                onClick={() => handleDriverRemove(g.lastId)}
                disabled={acting === g.lastId + 'driverRemove'}
                style={{
                  background: 'none', border: 'none', color: C.gray, fontSize: 10, cursor: 'pointer',
                  padding: '2px 4px', flexShrink: 0,
                }}
              >
                {acting === g.lastId + 'driverRemove' ? '...' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Total line */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 8, marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 12, color: C.gray }}>Ride + extras</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.white }}>
          ${(Number(agreedPrice || 0) + confirmedTotal).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
