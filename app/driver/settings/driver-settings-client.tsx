'use client';

import { useState, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import UpgradeOverlay from '@/components/driver/upgrade-overlay';
import CashPackCard from '@/components/driver/cash-pack-card';
import Link from 'next/link';
import { ChevronLeft, Shield, Zap, Clock, MessageCircle, DollarSign, UtensilsCrossed, Plus, Trash2 } from 'lucide-react';

interface Props {
  tier: string;
}

const TABS = [
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'cash', label: 'Cash Rides', icon: DollarSign },
  { id: 'hmu-first', label: 'HMU First', icon: Zap },
  { id: 'history', label: 'Ride History', icon: Clock },
  { id: 'support', label: 'Support', icon: MessageCircle },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function DriverSettingsClient({ tier }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('security');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as TabId | null;
    if (tab && ['security', 'cash', 'hmu-first', 'history', 'support', 'menu'].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  return (
    <>
      <style>{`
        :root { --green: #00E676; --black: #080808; --card: #141414; --card2: #1a1a1a; --border: rgba(255,255,255,0.08); --gray: #888; --gray-light: #bbb; }
        .settings-page { background: var(--black); min-height: 100svh; color: #fff; font-family: var(--font-body, 'DM Sans', sans-serif); padding-top: 56px; }
        .settings-header { padding: 16px 20px 0; display: flex; align-items: center; gap: 8px; }
        .settings-back { color: var(--green); text-decoration: none; display: flex; align-items: center; gap: 2px; font-size: 14px; font-weight: 600; }
        .settings-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 28px; flex: 1; text-align: center; padding-right: 60px; }

        .tab-bar { display: flex; gap: 4px; padding: 16px 20px 0; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .tab-bar::-webkit-scrollbar { display: none; }
        .tab-btn { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 100px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; font-family: var(--font-body, 'DM Sans', sans-serif); transition: all 0.15s; flex-shrink: 0; }
        .tab-btn--active { background: var(--green); color: var(--black); }
        .tab-btn--inactive { background: var(--card); color: var(--gray-light); border: 1px solid var(--border); }
        .tab-btn--inactive:hover { background: var(--card2); }

        .tab-content { padding: 20px; }

        /* Security tab - Clerk overrides */
        .clerk-wrap { border-radius: 20px; overflow: hidden; }
        .clerk-wrap .cl-rootBox { width: 100% !important; }
        .clerk-wrap .cl-card { background: var(--card) !important; border: 1px solid var(--border) !important; box-shadow: none !important; }
        .clerk-wrap .cl-navbarMobileMenuRow { color: #fff !important; }
        .clerk-wrap .cl-navbarMobileMenuButton { color: #fff !important; }
        .clerk-wrap .cl-headerTitle { color: #fff !important; }
        .clerk-wrap .cl-breadcrumbs { color: #fff !important; }
        .clerk-wrap .cl-breadcrumbsItem { color: #fff !important; }
        .clerk-wrap .cl-breadcrumbsItem button { color: #fff !important; }
        .clerk-wrap .cl-breadcrumbsItemDivider { color: #888 !important; }
        .clerk-wrap [class*="navbarMobileMenu"] { color: #fff !important; }
        .clerk-wrap [class*="Account"] { color: #fff !important; }
        .clerk-wrap .cl-navbar button { color: #fff !important; }

        /* HMU First tab */
        .upgrade-card { background: linear-gradient(135deg, rgba(0,230,118,0.08), rgba(0,230,118,0.02)); border: 1px solid rgba(0,230,118,0.2); border-radius: 20px; padding: 24px 20px; margin-bottom: 20px; }
        .upgrade-badge { display: inline-block; background: var(--green); color: var(--black); font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 100px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
        .upgrade-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 32px; line-height: 1; margin-bottom: 8px; }
        .upgrade-price { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 48px; color: var(--green); line-height: 1; margin-bottom: 4px; }
        .upgrade-price-sub { font-size: 13px; color: var(--gray); margin-bottom: 20px; }
        .perk-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
        .perk-row { display: flex; gap: 12px; align-items: flex-start; }
        .perk-icon { color: var(--green); font-size: 16px; flex-shrink: 0; margin-top: 2px; }
        .perk-text { font-size: 14px; color: var(--gray-light); line-height: 1.4; }
        .perk-text strong { color: #fff; }
        .compare-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 24px; }
        .compare-table th { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; color: var(--gray); letter-spacing: 2px; text-transform: uppercase; padding: 0 0 10px; text-align: left; }
        .compare-table th:nth-child(2), .compare-table th:nth-child(3) { text-align: center; }
        .compare-table td { padding: 10px 0; font-size: 13px; color: var(--gray-light); border-bottom: 1px solid var(--border); }
        .compare-table td:nth-child(2), .compare-table td:nth-child(3) { text-align: center; font-weight: 600; }
        .compare-table td:nth-child(3) { color: var(--green); }
        .upgrade-btn { display: block; width: 100%; padding: 16px; border-radius: 100px; border: none; background: var(--green); color: var(--black); font-weight: 700; font-size: 16px; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); transition: all 0.15s; }
        .upgrade-btn:hover { transform: scale(1.02); box-shadow: 0 0 24px rgba(0,230,118,0.25); }
        .upgrade-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .current-plan { text-align: center; padding: 16px; background: rgba(0,230,118,0.08); border: 1px solid rgba(0,230,118,0.2); border-radius: 12px; color: var(--green); font-weight: 600; font-size: 14px; }

        /* History tab */
        .history-empty { text-align: center; padding: 60px 20px; }
        .history-empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.4; }
        .history-empty-text { font-size: 15px; color: var(--gray); }

        /* Support tab */
        .support-section { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin-bottom: 12px; }
        .support-title { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
        .support-sub { font-size: 13px; color: var(--gray); line-height: 1.4; }
        .support-btn { display: inline-block; margin-top: 12px; padding: 10px 20px; border-radius: 100px; border: 1px solid var(--border); color: var(--gray-light); font-size: 13px; font-weight: 600; cursor: pointer; background: transparent; font-family: var(--font-body, 'DM Sans', sans-serif); transition: all 0.15s; text-decoration: none; }
        .support-btn:hover { background: var(--card2); color: #fff; }

        /* Menu tab */
        .menu-header { margin-bottom: 20px; }
        .menu-header-title { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 11px; color: var(--gray); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
        .menu-header-sub { font-size: 13px; color: var(--gray); line-height: 1.4; }
        .menu-limit { display: inline-block; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 100px; margin-top: 8px; }
        .menu-limit--free { background: rgba(255,255,255,0.06); color: var(--gray-light); }
        .menu-limit--first { background: rgba(0,230,118,0.12); color: var(--green); }
        .menu-grid { display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px; }
        .menu-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; transition: border-color 0.15s; }
        .menu-card--active { border-color: rgba(0,230,118,0.3); }
        .menu-card-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
        .menu-card-info { flex: 1; min-width: 0; }
        .menu-card-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
        .menu-card-type { font-size: 11px; color: var(--gray); text-transform: uppercase; letter-spacing: 0.5px; }
        .menu-card-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
        .menu-price-input-wrap { display: flex; align-items: center; gap: 0; background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; height: 32px; }
        .menu-price-prefix { padding: 0 6px 0 8px; font-family: var(--font-mono, 'Space Mono', monospace); font-size: 13px; color: var(--gray); }
        .menu-price-input { width: 60px; background: transparent; border: none; outline: none; color: #fff; font-family: var(--font-mono, 'Space Mono', monospace); font-size: 13px; text-align: right; padding: 0 8px 0 0; height: 100%; }
        .menu-price-input::placeholder { color: #555; }
        .menu-toggle { position: relative; width: 44px; height: 24px; border-radius: 12px; border: none; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
        .menu-toggle--on { background: var(--green); }
        .menu-toggle--off { background: #333; }
        .menu-toggle-knob { position: absolute; top: 2px; width: 20px; height: 20px; border-radius: 10px; background: #fff; transition: left 0.2s; }
        .menu-toggle--on .menu-toggle-knob { left: 22px; }
        .menu-toggle--off .menu-toggle-knob { left: 2px; }
        .menu-section-divider { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 11px; color: var(--gray); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px; }
        .menu-add-btn { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 12px; border-radius: 12px; border: 1px dashed rgba(255,255,255,0.12); background: transparent; color: var(--gray-light); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); transition: all 0.15s; }
        .menu-add-btn:hover { background: var(--card); border-color: rgba(0,230,118,0.3); color: var(--green); }
        .menu-custom-form { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px; }
        .menu-input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: rgba(255,255,255,0.04); color: #fff; font-size: 14px; font-family: var(--font-body, 'DM Sans', sans-serif); outline: none; }
        .menu-input:focus { border-color: rgba(0,230,118,0.4); }
        .menu-input::placeholder { color: #555; }
        .menu-select { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: #fff; font-size: 14px; font-family: var(--font-body, 'DM Sans', sans-serif); outline: none; appearance: none; }
        .menu-form-actions { display: flex; gap: 8px; }
        .menu-form-save { flex: 1; padding: 10px; border-radius: 100px; border: none; background: var(--green); color: var(--black); font-weight: 700; font-size: 14px; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); }
        .menu-form-save:disabled { opacity: 0.5; cursor: not-allowed; }
        .menu-form-cancel { padding: 10px 16px; border-radius: 100px; border: 1px solid var(--border); background: transparent; color: var(--gray-light); font-size: 14px; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); }
        .menu-delete-btn { background: transparent; border: none; color: #555; cursor: pointer; padding: 4px; transition: color 0.15s; }
        .menu-delete-btn:hover { color: #FF5252; }
      `}</style>

      <div className="settings-page">
        <div className="settings-header">
          <Link href="/driver/profile" className="settings-back">
            <ChevronLeft className="h-4 w-4" /> Profile
          </Link>
          <div className="settings-title">HMU Settings</div>
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
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="tab-content">
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'cash' && <CashPackCard />}
          {activeTab === 'hmu-first' && <HmuFirstTab tier={tier} />}
          {activeTab === 'history' && <HistoryTab />}
          {activeTab === 'support' && <SupportTab />}
          {activeTab === 'menu' && <MenuTab tier={tier} />}
        </div>
      </div>
    </>
  );
}

function SecurityTab() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const phone = user?.primaryPhoneNumber?.phoneNumber;
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Phone */}
      <div className="support-section">
        <div className="support-title">Phone Number</div>
        <div className="support-sub">{phone || 'Not set'}</div>
      </div>

      {/* Email */}
      {email && (
        <div className="support-section">
          <div className="support-title">Email</div>
          <div className="support-sub">{email}</div>
        </div>
      )}

      {/* Passkeys */}
      <div className="support-section">
        <div className="support-title">Passkeys</div>
        {user?.passkeys && user.passkeys.length > 0 ? (
          <div className="support-sub">{user.passkeys.length} passkey{user.passkeys.length > 1 ? 's' : ''} configured</div>
        ) : (
          <div className="support-sub">Sign in faster with Face ID, Touch ID, or your device</div>
        )}
        <button
          onClick={async () => {
            try {
              await user?.createPasskey();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Could not create passkey';
              if (!msg.includes('canceled') && !msg.includes('abort')) alert(msg);
            }
          }}
          style={{
            marginTop: 10, padding: '10px 20px', borderRadius: 100,
            border: '1px solid rgba(0,230,118,0.3)', background: 'rgba(0,230,118,0.08)',
            color: '#00E676', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          {user?.passkeys && user.passkeys.length > 0 ? 'Add Another Passkey' : 'Add Passkey'}
        </button>
      </div>

      {/* Sign out */}
      <button
        onClick={() => signOut({ redirectUrl: '/driver' })}
        className="support-btn"
        style={{
          display: 'block', width: '100%', textAlign: 'center',
          color: '#FF5252', borderColor: 'rgba(255,82,82,0.2)',
          marginTop: '8px',
        }}
      >
        Sign Out
      </button>
    </div>
  );
}

function HmuFirstTab({ tier }: { tier: string }) {
  const isFirst = tier === 'hmu_first';
  const [showUpgrade, setShowUpgrade] = useState(false);

  return (
    <div>
      <div className="upgrade-card">
        <div className="upgrade-badge">HMU First</div>
        <div className="upgrade-title">KEEP MORE. GET PAID FASTER.</div>
        <div className="upgrade-price">$9.99</div>
        <div className="upgrade-price-sub">per month</div>

        <div className="perk-list">
          <div className="perk-row">
            <span className="perk-icon">{'\u26A1'}</span>
            <div className="perk-text"><strong>Instant payouts</strong> after every ride — no waiting until 6am</div>
          </div>
          <div className="perk-row">
            <span className="perk-icon">{'\u2705'}</span>
            <div className="perk-text"><strong>12% flat fee</strong> instead of 10-25% progressive</div>
          </div>
          <div className="perk-row">
            <span className="perk-icon">{'\uD83D\uDCB0'}</span>
            <div className="perk-text"><strong>$25/day cap</strong> vs $40 — hit your cap faster, keep more</div>
          </div>
          <div className="perk-row">
            <span className="perk-icon">{'\uD83D\uDD1D'}</span>
            <div className="perk-text"><strong>Priority placement</strong> in rider&apos;s driver feed</div>
          </div>
          <div className="perk-row">
            <span className="perk-icon">{'\uD83D\uDCAC'}</span>
            <div className="perk-text"><strong>Read rider comments</strong> before accepting</div>
          </div>
          <div className="perk-row">
            <span className="perk-icon">{'\uD83C\uDFC5'}</span>
            <div className="perk-text"><strong>HMU First badge</strong> on your profile</div>
          </div>
        </div>
      </div>

      <table className="compare-table">
        <thead>
          <tr>
            <th>Feature</th>
            <th>Free</th>
            <th>HMU First</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Platform fee</td><td>10-25%</td><td>12% flat</td></tr>
          <tr><td>Daily cap</td><td>$40</td><td>$25</td></tr>
          <tr><td>Weekly cap</td><td>$150</td><td>$100</td></tr>
          <tr><td>Payout timing</td><td>6am next day</td><td>Instant</td></tr>
          <tr><td>Read comments</td><td>No</td><td>Yes</td></tr>
          <tr><td>Priority in feed</td><td>No</td><td>Yes</td></tr>
        </tbody>
      </table>

      {isFirst ? (
        <div className="current-plan">You&apos;re on HMU First</div>
      ) : (
        <>
          <button className="upgrade-btn" onClick={() => setShowUpgrade(true)}>
            Upgrade Now — $9.99/mo
          </button>
          <UpgradeOverlay
            open={showUpgrade}
            onClose={() => setShowUpgrade(false)}
            onUpgraded={() => window.location.reload()}
          />
        </>
      )}
    </div>
  );
}

interface RideHistory {
  id: string;
  status: string;
  rider_name: string | null;
  amount: number;
  final_agreed_price: number | null;
  driver_payout_amount: number | null;
  platform_fee_amount: number | null;
  driver_rating: string | null;
  rider_rating: string | null;
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

function HistoryTab() {
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
      <div className="history-empty">
        <div className="history-empty-icon">{'\uD83D\uDCCB'}</div>
        <div className="history-empty-text">
          No rides yet. Complete your first ride and it&apos;ll show here.
        </div>
      </div>
    );
  }

  const totalEarned = rides
    .filter(r => ['ended', 'completed'].includes(r.status))
    .reduce((sum, r) => sum + (r.driver_payout_amount || Number(r.final_agreed_price || r.amount) || 0), 0);
  const completedCount = rides.filter(r => ['ended', 'completed'].includes(r.status)).length;

  return (
    <div>
      {/* Stats row */}
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
            ${totalEarned.toFixed(2)}
          </div>
          <div style={{ fontSize: '11px', color: '#888', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '2px' }}>Earned</div>
        </div>
      </div>

      {/* Ride list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rides.map(ride => {
          const price = Number(ride.final_agreed_price || ride.amount || 0);
          const payout = ride.driver_payout_amount != null ? Number(ride.driver_payout_amount) : price;
          const fee = ride.platform_fee_amount != null ? Number(ride.platform_fee_amount) : 0;
          const ratingInfo = ride.rider_rating ? RATING_DISPLAY[ride.rider_rating] : null;
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
                    {ride.rider_name || 'Rider'} &middot; {dateStr} {timeStr}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: '18px', fontWeight: 700, color: '#00E676' }}>
                    ${payout.toFixed(2)}
                  </div>
                  {fee > 0 && (
                    <div style={{ fontSize: '11px', color: '#555', fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                      -${fee.toFixed(2)} fee
                    </div>
                  )}
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
      <div className="support-section">
        <div className="support-title">Chat with Support</div>
        <div className="support-sub">Get help with payouts, disputes, account issues, or anything else.</div>
        <button className="support-btn">Start Chat</button>
      </div>

      <div className="support-section">
        <div className="support-title">Report an Issue</div>
        <div className="support-sub">Something wrong with a ride, payment, or rider? Let us know.</div>
        <button className="support-btn">Report Issue</button>
      </div>

      <div className="support-section">
        <div className="support-title">FAQ</div>
        <div className="support-sub">Common questions about payouts, fees, ratings, and how HMU works.</div>
        <a href="https://atl.hmucashride.com" className="support-btn">View FAQ</a>
      </div>

      <div className="support-section">
        <div className="support-title">Email Us</div>
        <div className="support-sub">support@hmucashride.com</div>
        <a href="mailto:support@hmucashride.com" className="support-btn">Send Email</a>
      </div>
    </div>
  );
}

/* ── Menu Tab Types ── */
interface CatalogItem {
  id: string;
  name: string;
  icon: string;
  default_price: number;
  pricing_type: string;
  unit_label: string | null;
  category: string;
}

interface MenuItem {
  menu_item_id: string;
  platform_item_id: string | null;
  name: string;
  icon: string | null;
  price: number;
  pricing_type: string;
  unit_label: string | null;
  is_custom: boolean;
  is_active: boolean;
}

interface MenuData {
  menu: MenuItem[];
  catalog: CatalogItem[];
  counts: { active: number; custom: number };
  tier: string;
  limits: { max_items: number | null; max_custom: number | null };
}

const PRICING_LABELS: Record<string, string> = {
  flat: 'Flat Rate',
  per_mile: 'Per Mile',
  per_minute: 'Per Minute',
  per_stop: 'Per Stop',
  per_unit: 'Per Unit',
};

function MenuTab({ tier }: { tier: string }) {
  const [data, setData] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customPricingType, setCustomPricingType] = useState('flat');
  const [customUnitLabel, setCustomUnitLabel] = useState('');
  const [savingCustom, setSavingCustom] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const fetchMenu = () => {
    fetch('/api/driver/service-menu')
      .then(r => r.json())
      .then((d: MenuData) => {
        setData(d);
        // Initialize price overrides from existing menu items
        const priceMap: Record<string, string> = {};
        d.menu.forEach(item => {
          if (item.platform_item_id) {
            priceMap[item.platform_item_id] = String(item.price);
          }
        });
        setPrices(priceMap);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchMenu(); }, []);

  const handleToggleOn = async (catalogItem: CatalogItem) => {
    const priceStr = prices[catalogItem.id];
    const price = priceStr ? parseFloat(priceStr) : Number(catalogItem.default_price);
    if (isNaN(price) || price <= 0) return;

    setToggling(catalogItem.id);
    try {
      const res = await fetch('/api/driver/service-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: catalogItem.id, price }),
      });
      const result = await res.json();
      if (result.upgrade_required) {
        setShowUpgrade(true);
      } else {
        fetchMenu();
      }
    } catch {
      // silent
    } finally {
      setToggling(null);
    }
  };

  const handleToggleOff = async (menuItemId: string) => {
    setToggling(menuItemId);
    try {
      await fetch('/api/driver/service-menu', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_item_id: menuItemId }),
      });
      fetchMenu();
    } catch {
      // silent
    } finally {
      setToggling(null);
    }
  };

  const handleAddCustom = async () => {
    if (!customName.trim() || !customPrice) return;
    const price = parseFloat(customPrice);
    if (isNaN(price) || price <= 0) return;

    setSavingCustom(true);
    try {
      const res = await fetch('/api/driver/service-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom: true,
          name: customName.trim(),
          price,
          pricing_type: customPricingType,
          unit_label: ['per_unit', 'per_minute'].includes(customPricingType) ? customUnitLabel.trim() || null : null,
        }),
      });
      const result = await res.json();
      if (result.upgrade_required) {
        setShowUpgrade(true);
      } else {
        setCustomName('');
        setCustomPrice('');
        setCustomPricingType('flat');
        setCustomUnitLabel('');
        setShowCustomForm(false);
        fetchMenu();
      }
    } catch {
      // silent
    } finally {
      setSavingCustom(false);
    }
  };

  const handleDeleteCustom = async (menuItemId: string) => {
    setToggling(menuItemId);
    try {
      await fetch('/api/driver/service-menu', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_item_id: menuItemId }),
      });
      fetchMenu();
    } catch {
      // silent
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: '14px' }}>
        Loading menu...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: '14px' }}>
        Failed to load menu.
      </div>
    );
  }

  const isFirst = tier === 'hmu_first';
  const activeCount = data.counts.active;
  const maxItems = data.limits.max_items;
  const menuByPlatformId = new Map(data.menu.filter(m => m.platform_item_id).map(m => [m.platform_item_id, m]));
  const customItems = data.menu.filter(m => m.is_custom);

  return (
    <div>
      {/* Header */}
      <div className="menu-header">
        <div className="menu-header-title">Service Menu</div>
        <div className="menu-header-sub">Set your prices. Riders add services from your menu.</div>
        <span className={`menu-limit ${isFirst ? 'menu-limit--first' : 'menu-limit--free'}`}>
          {isFirst ? 'Unlimited' : `${activeCount} of ${maxItems || 5} items active`}
        </span>
      </div>

      {/* Platform Items */}
      <div className="menu-grid">
        {data.catalog.map(item => {
          const existing = menuByPlatformId.get(item.id);
          const isActive = !!existing && existing.is_active;
          const isThisToggling = toggling === item.id || toggling === existing?.menu_item_id;

          return (
            <div key={item.id} className={`menu-card ${isActive ? 'menu-card--active' : ''}`}>
              <div className="menu-card-icon">{item.icon}</div>
              <div className="menu-card-info">
                <div className="menu-card-name">{item.name}</div>
                <div className="menu-card-type">{PRICING_LABELS[item.pricing_type] || item.pricing_type}</div>
              </div>
              <div className="menu-card-right">
                <button
                  className={`menu-toggle ${isActive ? 'menu-toggle--on' : 'menu-toggle--off'}`}
                  disabled={isThisToggling}
                  onClick={() => {
                    if (isActive && existing) {
                      handleToggleOff(existing.menu_item_id);
                    } else {
                      handleToggleOn(item);
                    }
                  }}
                  style={{ opacity: isThisToggling ? 0.5 : 1 }}
                >
                  <div className="menu-toggle-knob" />
                </button>
                <div className="menu-price-input-wrap">
                  <span className="menu-price-prefix">$</span>
                  <input
                    className="menu-price-input"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={Number(item.default_price).toFixed(2)}
                    value={prices[item.id] || ''}
                    onChange={e => setPrices(prev => ({ ...prev, [item.id]: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Items Section */}
      <div className="menu-section-divider">Custom Services</div>
      <div className="menu-grid">
        {customItems.map(item => (
          <div key={item.menu_item_id} className="menu-card menu-card--active">
            <div className="menu-card-icon">{item.icon || '\u2728'}</div>
            <div className="menu-card-info">
              <div className="menu-card-name">{item.name}</div>
              <div className="menu-card-type">
                {PRICING_LABELS[item.pricing_type] || item.pricing_type}
                {item.unit_label ? ` / ${item.unit_label}` : ''}
              </div>
            </div>
            <div className="menu-card-right">
              <div style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: '14px', fontWeight: 700, color: '#00E676' }}>
                ${Number(item.price).toFixed(2)}
              </div>
              <button
                className="menu-delete-btn"
                disabled={toggling === item.menu_item_id}
                onClick={() => handleDeleteCustom(item.menu_item_id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {/* Add Custom Form */}
        {showCustomForm ? (
          <div className="menu-custom-form">
            <input
              className="menu-input"
              placeholder="Service name"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <div className="menu-price-input-wrap" style={{ flex: 1, height: '42px' }}>
                <span className="menu-price-prefix">$</span>
                <input
                  className="menu-price-input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={customPrice}
                  onChange={e => setCustomPrice(e.target.value)}
                  style={{ flex: 1, width: '100%' }}
                />
              </div>
              <select
                className="menu-select"
                style={{ flex: 1 }}
                value={customPricingType}
                onChange={e => setCustomPricingType(e.target.value)}
              >
                <option value="flat">Flat Rate</option>
                <option value="per_unit">Per Unit</option>
                <option value="per_minute">Per Minute</option>
                <option value="per_mile">Per Mile</option>
                <option value="per_stop">Per Stop</option>
              </select>
            </div>
            {['per_unit', 'per_minute'].includes(customPricingType) && (
              <input
                className="menu-input"
                placeholder="Unit label (e.g. hour, item)"
                value={customUnitLabel}
                onChange={e => setCustomUnitLabel(e.target.value)}
              />
            )}
            <div className="menu-form-actions">
              <button className="menu-form-cancel" onClick={() => setShowCustomForm(false)}>
                Cancel
              </button>
              <button
                className="menu-form-save"
                disabled={savingCustom || !customName.trim() || !customPrice}
                onClick={handleAddCustom}
              >
                {savingCustom ? 'Saving...' : 'Add Service'}
              </button>
            </div>
          </div>
        ) : (
          <button className="menu-add-btn" onClick={() => setShowCustomForm(true)}>
            <Plus className="h-4 w-4" />
            Add Custom
          </button>
        )}
      </div>

      {/* Upgrade Overlay */}
      {showUpgrade && (
        <UpgradeOverlay
          open={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          onUpgraded={() => {
            setShowUpgrade(false);
            fetchMenu();
          }}
        />
      )}
    </div>
  );
}
