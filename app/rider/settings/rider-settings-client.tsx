'use client';

import { useState, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ChevronLeft, Shield, CreditCard, Clock, MessageCircle, LogOut } from 'lucide-react';
import AuthManagement from '@/components/shared/auth-management';

const InlinePaymentForm = dynamic(() => import('@/components/payments/inline-payment-form'), { ssr: false });

const TABS = [
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'payment', label: 'Payment', icon: CreditCard },
  { id: 'history', label: 'Ride History', icon: Clock },
  { id: 'support', label: 'Support', icon: MessageCircle },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function RiderSettingsClient() {
  const [activeTab, setActiveTab] = useState<TabId>('security');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as TabId | null;
    if (tab && ['security', 'payment', 'history', 'support'].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  return (
    <>
      <style>{`
        .tab-bar { display: flex; gap: 4px; padding: 16px 20px 0; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .tab-bar::-webkit-scrollbar { display: none; }
        .tab-btn { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 100px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; font-family: var(--font-body, 'DM Sans', sans-serif); transition: all 0.15s; flex-shrink: 0; }
        .tab-btn--active { background: #00E676; color: #080808; }
        .tab-btn--inactive { background: #141414; color: #bbb; border: 1px solid rgba(255,255,255,0.08); }
        .tab-btn--inactive:hover { background: #1a1a1a; }
      `}</style>

      <div
        style={{
          background: '#080808',
          minHeight: '100svh',
          color: '#fff',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          paddingTop: '56px',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link
            href="/rider/profile"
            style={{
              color: '#00E676',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            <ChevronLeft style={{ width: '16px', height: '16px' }} /> Profile
          </Link>
          <div
            style={{
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: '28px',
              flex: 1,
              textAlign: 'center',
              paddingRight: '60px',
            }}
          >
            HMU Settings
          </div>
        </div>

        {/* Tab bar */}
        <div className="tab-bar">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'tab-btn--active' : 'tab-btn--inactive'}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon style={{ width: '16px', height: '16px' }} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{ padding: '20px' }}>
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'payment' && <PaymentTab />}
          {activeTab === 'history' && <RiderHistoryTab />}
          {activeTab === 'support' && <SupportTab />}
        </div>
      </div>
    </>
  );
}

function SecurityTab() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <AuthManagement />

      {/* Email (read-only — managed by Clerk) */}
      {email && (
        <div style={{
          background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px', padding: '20px', marginBottom: '12px',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Email</div>
          <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.4 }}>{email}</div>
        </div>
      )}

      {/* Sign out */}
      <button
        onClick={() => signOut({ redirectUrl: '/rider/home' })}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '14px 20px',
          borderRadius: '100px', border: '1px solid rgba(255,82,82,0.2)',
          background: 'transparent', color: '#FF5252', fontSize: '14px',
          fontWeight: 600, cursor: 'pointer', textAlign: 'center',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          marginTop: '8px',
        }}
      >
        <LogOut style={{ width: 16, height: 16 }} />
        Sign Out
      </button>
    </div>
  );
}

function PaymentTab() {
  const [methods, setMethods] = useState<Array<{
    id: string; brand: string | null; last4: string; expMonth: number | null; expYear: number | null; isDefault: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch saved payment methods on mount
  useState(() => {
    fetch('/api/rider/payment-methods')
      .then(r => r.json())
      .then(data => { if (data.methods) setMethods(data.methods); })
      .catch(() => {})
      .finally(() => setLoading(false));
  });

  async function handleSetDefault(id: string) {
    await fetch(`/api/rider/payment-methods/${id}/default`, { method: 'PATCH' });
    setMethods(prev => prev.map(m => ({ ...m, isDefault: m.id === id })));
  }

  async function handleDelete(id: string) {
    await fetch(`/api/rider/payment-methods/${id}`, { method: 'DELETE' });
    setMethods(prev => prev.filter(m => m.id !== id));
  }

  const brandIcons: Record<string, string> = {
    visa: '💳', mastercard: '💳', amex: '💳', discover: '💳',
    apple_pay: '🍎', google_pay: '📱', cashapp: '💸',
  };

  return (
    <div>
      {/* Saved methods */}
      <div style={{
        background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px', padding: '20px', marginBottom: '12px',
      }}>
        <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
          Payment Methods
        </div>
        <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.4, marginBottom: '16px' }}>
          Used when you book rides
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#888', fontSize: '14px' }}>
            Loading...
          </div>
        ) : methods.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px', opacity: 0.4 }}>{'\uD83D\uDCB3'}</div>
            <div style={{ fontSize: '14px', color: '#888' }}>No payment methods linked yet</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {methods.map(m => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: '#1a1a1a', border: m.isDefault ? '1px solid rgba(0,230,118,0.3)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px', padding: '14px 16px',
              }}>
                <span style={{ fontSize: '20px' }}>{brandIcons[m.brand || ''] || '💳'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>
                    {(m.brand || 'Card').charAt(0).toUpperCase() + (m.brand || 'card').slice(1)} ending in {m.last4}
                  </div>
                  {m.expMonth && m.expYear && (
                    <div style={{ fontSize: '12px', color: '#888', fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                      Expires {m.expMonth}/{m.expYear}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {m.isDefault ? (
                    <span style={{ fontSize: '11px', color: '#00E676', fontWeight: 600, padding: '4px 8px', background: 'rgba(0,230,118,0.1)', borderRadius: '100px' }}>
                      Default
                    </span>
                  ) : (
                    <button onClick={() => handleSetDefault(m.id)} style={{
                      fontSize: '11px', color: '#888', background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '100px', padding: '4px 8px', cursor: 'pointer',
                      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                    }}>
                      Set default
                    </button>
                  )}
                  <button onClick={() => handleDelete(m.id)} style={{
                    fontSize: '11px', color: '#FF5252', background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                    fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                  }}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add method */}
      {error && (
        <div style={{ fontSize: '13px', color: '#FF5252', marginBottom: '12px', padding: '10px 14px', background: 'rgba(255,68,68,0.08)', borderRadius: '10px' }}>
          {error}
        </div>
      )}

      {showAddForm ? (
        <InlinePaymentForm
          onSuccess={() => { setShowAddForm(false); window.location.reload(); }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          style={{
            display: 'block', width: '100%', padding: '16px', borderRadius: '100px',
            border: 'none', background: '#00E676', color: '#080808',
            fontWeight: 700, fontSize: '15px', cursor: 'pointer',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          {methods.length > 0 ? 'Add Another Method' : 'Link Payment Method'}
        </button>
      )}
    </div>
  );
}

interface RideHistory {
  id: string;
  status: string;
  driver_name: string | null;
  amount: number;
  final_agreed_price: number | null;
  driver_rating: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  destination: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

const RATING_DISPLAY: Record<string, { label: string; emoji: string; color: string }> = {
  chill: { label: 'CHILL', emoji: '\u2705', color: '#00E676' },
  cool_af: { label: 'Cool AF', emoji: '\uD83D\uDE0E', color: '#448AFF' },
  kinda_creepy: { label: 'Kinda Creepy', emoji: '\uD83D\uDC40', color: '#FFD740' },
  weirdo: { label: 'WEIRDO', emoji: '\uD83D\uDEA9', color: '#FF5252' },
};

function RiderHistoryTab() {
  const [rides, setRides] = useState<RideHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/rides/history')
      .then(r => r.json())
      .then(data => { if (data.rides) setRides(data.rides); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: '14px' }}>
        Loading rides...
      </div>
    );
  }

  if (rides.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.4 }}>{'\uD83D\uDE97'}</div>
        <div style={{ fontSize: '15px', color: '#888' }}>
          No rides yet. Your completed rides will show here.
        </div>
      </div>
    );
  }

  const totalSpent = rides
    .filter(r => ['ended', 'completed'].includes(r.status))
    .reduce((sum, r) => sum + Number(r.final_agreed_price || r.amount || 0), 0);
  const completedCount = rides.filter(r => ['ended', 'completed'].includes(r.status)).length;

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <div style={{
          flex: 1, background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px', padding: '14px', textAlign: 'center',
        }}>
          <div style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: '24px', fontWeight: 700, color: '#00E676' }}>
            {completedCount}
          </div>
          <div style={{ fontSize: '11px', color: '#888', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '2px' }}>Rides</div>
        </div>
        <div style={{
          flex: 1, background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px', padding: '14px', textAlign: 'center',
        }}>
          <div style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: '24px', fontWeight: 700, color: '#00E676' }}>
            ${totalSpent.toFixed(2)}
          </div>
          <div style={{ fontSize: '11px', color: '#888', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '2px' }}>Spent</div>
        </div>
      </div>

      {/* Ride list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rides.map(ride => {
          const price = Number(ride.final_agreed_price || ride.amount || 0);
          const ratingInfo = ride.driver_rating ? RATING_DISPLAY[ride.driver_rating] : null;
          const destination = ride.destination || ride.dropoff_address || 'Ride';
          const date = new Date(ride.created_at);
          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

          return (
            <Link
              key={ride.id}
              href={`/ride/${ride.id}`}
              style={{
                background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px', padding: '16px', textDecoration: 'none', color: '#fff',
                display: 'block',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>{destination}</div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                    {ride.driver_name || 'Driver'} &middot; {dateStr} {timeStr}
                  </div>
                </div>
                <div style={{
                  fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                  fontSize: '18px', fontWeight: 700, color: '#00E676',
                }}>
                  ${price.toFixed(2)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '11px', padding: '3px 10px', borderRadius: '100px',
                  background: ride.status === 'completed' ? 'rgba(0,230,118,0.1)' : ride.status === 'cancelled' ? 'rgba(255,82,82,0.1)' : 'rgba(255,255,255,0.05)',
                  color: ride.status === 'completed' ? '#00E676' : ride.status === 'cancelled' ? '#FF5252' : '#888',
                  fontWeight: 600,
                }}>
                  {ride.status.toUpperCase()}
                </span>
                {ratingInfo && (
                  <span style={{ fontSize: '12px', color: ratingInfo.color }}>
                    {ratingInfo.emoji} {ratingInfo.label}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SupportTab() {
  return (
    <div>
      <div
        style={{
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
          Chat with Support
        </div>
        <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.4 }}>
          Get help with rides, payments, disputes, or anything else.
        </div>
        <button
          style={{
            display: 'inline-block',
            marginTop: '12px',
            padding: '10px 20px',
            borderRadius: '100px',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#bbb',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            background: 'transparent',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            transition: 'all 0.15s',
          }}
        >
          Start Chat
        </button>
      </div>

      <div
        style={{
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
          Report an Issue
        </div>
        <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.4 }}>
          Something wrong with a ride, payment, or driver? Let us know.
        </div>
        <button
          style={{
            display: 'inline-block',
            marginTop: '12px',
            padding: '10px 20px',
            borderRadius: '100px',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#bbb',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            background: 'transparent',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            transition: 'all 0.15s',
          }}
        >
          Report Issue
        </button>
      </div>

      <div
        style={{
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
          FAQ
        </div>
        <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.4 }}>
          Common questions about rides, payments, ratings, and how HMU works.
        </div>
        <a
          href="https://atl.hmucashride.com"
          style={{
            display: 'inline-block',
            marginTop: '12px',
            padding: '10px 20px',
            borderRadius: '100px',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#bbb',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            background: 'transparent',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            transition: 'all 0.15s',
            textDecoration: 'none',
          }}
        >
          View FAQ
        </a>
      </div>

      <div
        style={{
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
          Email Us
        </div>
        <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.4 }}>
          support@hmucashride.com
        </div>
        <a
          href="mailto:support@hmucashride.com"
          style={{
            display: 'inline-block',
            marginTop: '12px',
            padding: '10px 20px',
            borderRadius: '100px',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#bbb',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            background: 'transparent',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            transition: 'all 0.15s',
            textDecoration: 'none',
          }}
        >
          Send Email
        </a>
      </div>
    </div>
  );
}
