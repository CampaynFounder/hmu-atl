'use client';

import Link from 'next/link';

interface ProfileData {
  displayName: string;
  firstName: string;
  lastName: string;
  lgbtqFriendly: boolean;
  hasPaymentMethod: boolean;
}

interface Props {
  profile: ProfileData;
}

export default function RiderProfileClient({ profile }: Props) {
  return (
    <div
      style={{
        background: '#080808',
        color: '#fff',
        minHeight: '100svh',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        padding: '72px 20px 40px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1
          style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: '32px',
            margin: 0,
          }}
        >
          {profile.displayName}
        </h1>
        <Link
          href="/rider/home"
          style={{
            fontSize: '14px',
            color: '#00E676',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Back
        </Link>
      </div>

      {/* Display Name */}
      <div
        style={{
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          padding: '20px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono, 'Space Mono', monospace)",
            fontSize: '10px',
            color: '#888',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            marginBottom: '14px',
          }}
        >
          Public Identity
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>Display Name</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
              How other users see you
            </div>
          </div>
          <div style={{ fontSize: '14px', color: '#bbb' }}>@{profile.displayName}</div>
        </div>
      </div>

      {/* Legal Name */}
      <div
        style={{
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          padding: '20px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono, 'Space Mono', monospace)",
            fontSize: '10px',
            color: '#888',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            marginBottom: '14px',
          }}
        >
          Legal Identity
        </div>
        <div
          style={{
            fontSize: '12px',
            color: '#888',
            marginBottom: '12px',
            lineHeight: 1.4,
          }}
        >
          Private — used for verification only. Drivers never see this.
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 0',
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 600 }}>Legal Name</div>
          <div style={{ fontSize: '14px', color: '#bbb' }}>
            {profile.firstName && profile.lastName
              ? `${profile.firstName} ${profile.lastName}`
              : '\u2014'}
          </div>
        </div>
      </div>

      {/* LGBTQ+ Friendly */}
      <div
        style={{
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          padding: '20px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono, 'Space Mono', monospace)",
            fontSize: '10px',
            color: '#888',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            marginBottom: '14px',
          }}
        >
          Badges
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 0',
          }}
        >
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>LGBTQ+ Friendly</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
              Shows on your profile for drivers to see
            </div>
          </div>
          <div
            style={{
              display: 'inline-block',
              background: profile.lgbtqFriendly ? 'rgba(0,230,118,0.12)' : '#1f1f1f',
              border: profile.lgbtqFriendly
                ? '1px solid rgba(0,230,118,0.3)'
                : '1px solid rgba(255,255,255,0.1)',
              color: profile.lgbtqFriendly ? '#00E676' : '#888',
              fontSize: '12px',
              fontWeight: 700,
              padding: '6px 14px',
              borderRadius: '100px',
            }}
          >
            {profile.lgbtqFriendly ? 'Active' : 'Off'}
          </div>
        </div>
      </div>

      {/* Payment Method */}
      <div
        style={{
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          padding: '20px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono, 'Space Mono', monospace)",
            fontSize: '10px',
            color: '#888',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            marginBottom: '14px',
          }}
        >
          Payment
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 0',
          }}
        >
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>Payment Method</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
              {profile.hasPaymentMethod
                ? 'Payment method linked'
                : 'Add a payment method to book rides'}
            </div>
          </div>
          {profile.hasPaymentMethod ? (
            <div
              style={{
                display: 'inline-block',
                background: 'rgba(0,230,118,0.12)',
                border: '1px solid rgba(0,230,118,0.3)',
                color: '#00E676',
                fontSize: '12px',
                fontWeight: 700,
                padding: '6px 14px',
                borderRadius: '100px',
              }}
            >
              Linked
            </div>
          ) : (
            <Link
              href="/rider/settings?tab=payment"
              style={{
                display: 'inline-block',
                background: '#00E676',
                color: '#080808',
                fontSize: '12px',
                fontWeight: 700,
                padding: '8px 16px',
                borderRadius: '100px',
                textDecoration: 'none',
              }}
            >
              Add Payment
            </Link>
          )}
        </div>
      </div>

      {/* Settings Link */}
      <Link
        href="/rider/settings"
        style={{
          display: 'block',
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          padding: '18px 20px',
          marginBottom: '16px',
          textDecoration: 'none',
          color: '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>Settings</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
              Security, payment methods, and support
            </div>
          </div>
          <div style={{ fontSize: '14px', color: '#00E676', fontWeight: 600 }}>
            {'\u203A'}
          </div>
        </div>
      </Link>
    </div>
  );
}
