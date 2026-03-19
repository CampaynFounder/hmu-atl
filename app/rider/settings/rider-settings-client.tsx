'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId) || 'security';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

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
          Saved Cards
        </div>
        <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.4 }}>
          Your saved payment methods for booking rides.
        </div>
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '8px', opacity: 0.4 }}>
            {'\uD83D\uDCB3'}
          </div>
          <div style={{ fontSize: '14px', color: '#888' }}>
            No payment methods saved yet
          </div>
        </div>
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
          Add Payment Method
        </div>
        <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.4, marginBottom: '16px' }}>
          Add a debit card, credit card, Apple Pay, or Google Pay to start booking rides.
        </div>
        <button
          style={{
            display: 'block',
            width: '100%',
            padding: '14px',
            borderRadius: '100px',
            border: 'none',
            background: '#00E676',
            color: '#080808',
            fontWeight: 700,
            fontSize: '15px',
            cursor: 'pointer',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            transition: 'all 0.15s',
          }}
          onClick={() => {
            // TODO: Open Stripe Checkout / Setup Session
          }}
        >
          Add Payment Method
        </button>
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
