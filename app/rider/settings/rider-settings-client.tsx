'use client';

import { useState, useEffect } from 'react';
import { UserProfile } from '@clerk/nextjs';
import Link from 'next/link';
import { ChevronLeft, Shield, CreditCard, MessageCircle } from 'lucide-react';

const TABS = [
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'payment', label: 'Payment', icon: CreditCard },
  { id: 'support', label: 'Support', icon: MessageCircle },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function RiderSettingsClient() {
  const [activeTab, setActiveTab] = useState<TabId>('security');

  // Check URL for tab param on mount (without useSearchParams)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as TabId | null;
    if (tab && ['security', 'payment', 'support'].includes(tab)) {
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
          {activeTab === 'support' && <SupportTab />}
        </div>
      </div>
    </>
  );
}

function SecurityTab() {
  return (
    <div style={{ borderRadius: '20px', overflow: 'hidden' }}>
      <UserProfile
        appearance={{
          baseTheme: undefined,
          variables: {
            colorBackground: '#141414',
            colorText: '#ffffff',
            colorTextSecondary: '#888888',
            colorPrimary: '#00E676',
            colorInputBackground: '#1a1a1a',
            colorInputText: '#ffffff',
            borderRadius: '12px',
          },
          elements: {
            rootBox: { width: '100%' },
            card: { boxShadow: 'none', border: '1px solid rgba(255,255,255,0.08)' },
            headerTitle: { color: '#ffffff' },
            headerSubtitle: { color: '#888888' },
            profileSectionTitle: { color: '#888888' },
            profileSectionContent: { color: '#ffffff' },
            formButtonPrimary: { backgroundColor: '#00E676', color: '#080808' },
            navbarButton: { color: '#ffffff', fontWeight: 600 },
            navbarButtonIcon: { color: '#00E676' },
            navbarButton__active: { color: '#00E676', borderColor: '#00E676' },
            badge: { backgroundColor: '#00E676', color: '#080808' },
            profileSectionPrimaryButton: { color: '#00E676' },
            menuButton: { color: '#ffffff' },
            menuItem: { color: '#ffffff' },
            accordionTriggerButton: { color: '#ffffff' },
            navbarMobileMenuRow: { color: '#ffffff' },
            navbarMobileMenuButton: { color: '#ffffff' },
            pageScrollBox: { color: '#ffffff' },
            page: { color: '#ffffff' },
            breadcrumbs: { color: '#ffffff' },
            breadcrumbsItem: { color: '#ffffff' },
            breadcrumbsItemDivider: { color: '#888' },
          },
        }}
      />
    </div>
  );
}

function PaymentTab() {
  const [methods, setMethods] = useState<Array<{
    id: string; brand: string | null; last4: string; expMonth: number | null; expYear: number | null; isDefault: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch saved payment methods on mount
  useState(() => {
    fetch('/api/rider/payment-methods')
      .then(r => r.json())
      .then(data => { if (data.methods) setMethods(data.methods); })
      .catch(() => {})
      .finally(() => setLoading(false));
  });

  async function handleAddMethod() {
    setAdding(true);
    setError(null);
    try {
      // Create a Stripe Checkout session in setup mode
      const res = await fetch('/api/rider/payment-methods/checkout', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start payment setup');
        setAdding(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError('Network error');
      setAdding(false);
    }
  }

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

      <button
        type="button"
        onClick={handleAddMethod}
        disabled={adding}
        style={{
          display: 'block', width: '100%', padding: '16px', borderRadius: '100px',
          border: 'none', background: '#00E676', color: '#080808',
          fontWeight: 700, fontSize: '15px', cursor: adding ? 'not-allowed' : 'pointer',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          opacity: adding ? 0.5 : 1,
        }}
      >
        {adding ? 'Opening Stripe...' : methods.length > 0 ? 'Add Another Method' : 'Link Payment Method'}
      </button>

      <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#555' }}>
        Secure payment via Stripe. Apple Pay, Google Pay, and cards supported.
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
