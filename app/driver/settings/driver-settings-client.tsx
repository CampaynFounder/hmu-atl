'use client';

import { useState, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import UpgradeOverlay from '@/components/driver/upgrade-overlay';
import CashPackCard from '@/components/driver/cash-pack-card';
import Link from 'next/link';
import { ChevronLeft, Shield, Zap, Clock, MessageCircle, DollarSign, UtensilsCrossed, Star, Plus, Trash2, BarChart3 } from 'lucide-react';
import RatingsInfo from '@/components/shared/ratings-info';

interface Props {
  tier: string;
}

const TABS = [
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'ratings', label: 'Ratings', icon: Star },
  { id: 'cash', label: 'Cash Rides', icon: DollarSign },
  { id: 'hmu-first', label: 'HMU First', icon: Zap },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'history', label: 'Ride History', icon: Clock },
  { id: 'support', label: 'Support', icon: MessageCircle },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function DriverSettingsClient({ tier }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('security');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as TabId | null;
    if (tab && ['security', 'menu', 'ratings', 'cash', 'hmu-first', 'analytics', 'history', 'support'].includes(tab)) {
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
        .menu-name-input { font-size: 14px; font-weight: 600; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.08); outline: none; color: #fff; padding: 2px 0; margin-bottom: 2px; width: 100%; font-family: var(--font-body, 'DM Sans', sans-serif); }
        .menu-name-input::placeholder { color: #fff; }
        .menu-name-input:focus { border-bottom-color: #00E676; }
        .menu-name-input:focus::placeholder { color: #555; }
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
          {activeTab === 'menu' && <MenuTab tier={tier} />}
          {activeTab === 'ratings' && <RatingsTab />}
          {activeTab === 'cash' && <CashPackCard />}
          {activeTab === 'hmu-first' && <HmuFirstTab tier={tier} />}
          {activeTab === 'analytics' && <AnalyticsTab tier={tier} />}
          {activeTab === 'history' && <HistoryTab />}
          {activeTab === 'support' && <SupportTab />}
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
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div>
      {/* Hero + CTA — always visible without scrolling */}
      <div className="upgrade-card">
        <div className="upgrade-badge">HMU First</div>
        <div className="upgrade-title">KEEP MORE. GET PAID FASTER.</div>
        <div className="upgrade-price">$9.99</div>
        <div className="upgrade-price-sub">per month — cancel anytime</div>

        {isFirst ? (
          <div className="current-plan" style={{ marginTop: 8 }}>You&apos;re on HMU First</div>
        ) : (
          <button className="upgrade-btn" style={{ marginTop: 8 }} onClick={() => setShowUpgrade(true)}>
            Upgrade Now — $9.99/mo
          </button>
        )}

        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            display: 'block', width: '100%', marginTop: 14, padding: '10px',
            background: 'none', border: 'none', color: 'var(--green)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          {showDetails ? 'Hide details' : 'See what you get ↓'}
        </button>
      </div>

      {/* Details — expandable */}
      {showDetails && (
        <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
          <div className="perk-list" style={{ marginBottom: 20 }}>
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
        </div>
      )}

      {!isFirst && (
        <UpgradeOverlay
          open={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          onUpgraded={() => window.location.reload()}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
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

function RatingsTab() {
  return (
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 28, marginBottom: 4 }}>
        How Ratings Work
      </div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        Both drivers and riders rate each other after every ride.
      </div>
      <RatingsInfo />
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
// API returns raw DB rows — use loose types
interface MenuApiResponse {
  menu: Record<string, unknown>[];
  catalog: Record<string, unknown>[];
  counts: { total: number; custom: number };
  tier: string;
  limits: { maxItems: number | null; maxCustom: number | null };
}

interface ActiveItem {
  id: string;
  name: string;
  icon: string;
  price: number;
  pricing_type: string;
  unit_label: string | null;
  item_id: string | null; // null = custom
}

// Quick-add presets riders commonly need
const QUICK_LABELS = [
  { label: 'Extra Stop', icon: '📍', pricing_type: 'per_unit', unit_label: 'stop', default_price: 3 },
  { label: 'Wait Time', icon: '⏱', pricing_type: 'per_minute', unit_label: 'min', default_price: 2 },
  { label: 'Late Night', icon: '🌙', pricing_type: 'flat', unit_label: null, default_price: 5 },
  { label: '420 Friendly', icon: '🌿', pricing_type: 'flat', unit_label: null, default_price: 5 },
  { label: 'Round Trip', icon: '🔄', pricing_type: 'flat', unit_label: null, default_price: 10 },
  { label: 'Airport', icon: '✈️', pricing_type: 'flat', unit_label: null, default_price: 5 },
  { label: 'Pet Friendly', icon: '🐾', pricing_type: 'flat', unit_label: null, default_price: 5 },
  { label: 'Luggage', icon: '🧳', pricing_type: 'per_unit', unit_label: 'bag', default_price: 3 },
  { label: 'Large Vehicle', icon: '🚙', pricing_type: 'flat', unit_label: null, default_price: 10 },
  { label: 'Grocery Run', icon: '🛒', pricing_type: 'flat', unit_label: null, default_price: 8 },
];

const PRICING_LABELS: Record<string, string> = {
  flat: 'Flat',
  per_mile: '/ mile',
  per_minute: '/ min',
  per_stop: '/ stop',
  per_unit: '/ unit',
};

function MenuTab({ tier }: { tier: string }) {
  const [items, setItems] = useState<ActiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  // Add/edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [pricingType, setPricingType] = useState('flat');
  const [unitLabel, setUnitLabel] = useState('');
  const [error, setError] = useState('');

  const fetchMenu = () => {
    fetch('/api/driver/service-menu')
      .then(r => r.json())
      .then((d: MenuApiResponse) => {
        const mapped: ActiveItem[] = (d.menu || []).map((m) => ({
          id: String(m.id),
          name: (m.custom_name as string) || (m.name as string) || 'Service',
          icon: (m.custom_icon as string) || (m.icon as string) || '💲',
          price: Number(m.price || 0),
          pricing_type: (m.pricing_type as string) || 'flat',
          unit_label: (m.unit_label as string) || null,
          item_id: (m.item_id as string) || null,
        }));
        setItems(mapped);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchMenu(); }, []);

  const clearForm = () => {
    setEditingId(null); setName(''); setPrice(''); setPricingType('flat'); setUnitLabel(''); setError('');
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name required'); return; }
    if (!price) { setError('Price required'); return; }
    const p = parseFloat(price);
    if (isNaN(p) || p <= 0) { setError('Enter a valid price'); return; }
    setError('');
    setSaving(true);
    try {
      if (editingId) {
        // Update existing
        const res = await fetch('/api/driver/service-menu', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            menu_item_id: editingId,
            custom_name: name.trim(),
            price: p,
          }),
        });
        if (res.ok) { clearForm(); fetchMenu(); }
        else { const r = await res.json(); setError(r.error || 'Failed to update'); }
      } else {
        // Add new
        const res = await fetch('/api/driver/service-menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            custom_name: name.trim(),
            price: p,
            pricing_type: pricingType,
            unit_label: ['per_unit', 'per_minute'].includes(pricingType) ? unitLabel.trim() || null : null,
          }),
        });
        const result = await res.json();
        if (res.status === 403 || result.error === 'upgrade_required') {
          setShowUpgrade(true);
        } else if (res.ok) { clearForm(); fetchMenu(); }
        else { setError(result.error || 'Failed to add'); }
      }
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  const handleEdit = (item: ActiveItem) => {
    setEditingId(item.id);
    setName(item.name);
    setPrice(String(item.price));
    setPricingType(item.pricing_type);
    setUnitLabel(item.unit_label || '');
    setError('');
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (itemId: string) => {
    setDeleting(itemId);
    // Optimistically remove from UI immediately
    setItems(prev => prev.filter(i => i.id !== itemId));
    try {
      const res = await fetch('/api/driver/service-menu', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_item_id: itemId, permanent: true }),
      });
      if (!res.ok) {
        // Revert on failure
        fetchMenu();
      }
    } catch {
      fetchMenu(); // Revert on error
    }
    finally { setDeleting(null); }
  };

  const handleQuickAdd = (preset: typeof QUICK_LABELS[0]) => {
    setName(preset.label);
    setPrice(String(preset.default_price));
    setPricingType(preset.pricing_type);
    setUnitLabel(preset.unit_label || '');
  };

  const isFirst = tier === 'hmu_first';
  const maxItems = isFirst ? Infinity : 5;

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: '14px' }}>Loading menu...</div>;
  }

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 28, marginBottom: 4 }}>
          Service Menu
        </div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
          Add services you offer. Riders can order from your menu during a ride.
        </div>
        <span style={{
          display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: 1,
          padding: '4px 12px', borderRadius: 100,
          background: items.length >= maxItems && !isFirst ? 'rgba(255,179,0,0.1)' : isFirst ? 'rgba(0,230,118,0.1)' : 'rgba(255,255,255,0.05)',
          color: items.length >= maxItems && !isFirst ? '#FFB300' : isFirst ? '#00E676' : '#888',
          border: `1px solid ${items.length >= maxItems && !isFirst ? 'rgba(255,179,0,0.2)' : isFirst ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.08)'}`,
        }}>
          {isFirst ? 'UNLIMITED ITEMS' : items.length >= maxItems ? `${maxItems}/${maxItems} — UPGRADE FOR MORE` : `${items.length} / ${maxItems} ITEMS`}
        </span>
      </div>

      {/* Quick Labels */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
          Quick Add
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_LABELS.map(q => (
            <button
              key={q.label}
              onClick={() => handleQuickAdd(q)}
              style={{
                padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600,
                border: '1px solid rgba(255,255,255,0.1)', background: '#1a1a1a', color: '#bbb',
                cursor: 'pointer', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <span>{q.icon}</span> {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Add Form */}
      <div style={{
        background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: 16, marginBottom: 20,
      }}>
        <input
          type="text"
          placeholder="Service name (e.g. Extra Stop, Late Night)"
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          style={{
            width: '100%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 15, outline: 'none',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)", marginBottom: 10,
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '0 12px' }}>
            <span style={{ color: '#555', fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: 14 }}>$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={price}
              onChange={e => { setPrice(e.target.value); setError(''); }}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#fff', fontSize: 15, padding: '12px 8px',
                fontFamily: "var(--font-mono, 'Space Mono', monospace)",
              }}
            />
          </div>
          <select
            value={pricingType}
            onChange={e => setPricingType(e.target.value)}
            style={{
              background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '10px 12px', color: '#bbb', fontSize: 13,
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)", outline: 'none',
            }}
          >
            <option value="flat">Flat</option>
            <option value="per_unit">Per Unit</option>
            <option value="per_minute">Per Min</option>
          </select>
        </div>
        {['per_unit', 'per_minute'].includes(pricingType) && (
          <input
            type="text"
            placeholder="Unit label (e.g. stop, min, bag)"
            value={unitLabel}
            onChange={e => setUnitLabel(e.target.value)}
            style={{
              width: '100%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)", marginBottom: 10,
            }}
          />
        )}
        {error && <div style={{ fontSize: 13, color: '#FF5252', marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          {editingId && (
            <button
              onClick={clearForm}
              style={{
                padding: 14, borderRadius: 100, flex: 1,
                background: 'transparent', color: '#888',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2, padding: 14, borderRadius: 100,
              background: editingId ? '#448AFF' : '#00E676',
              color: editingId ? '#fff' : '#080808', border: 'none',
              fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving...' : editingId ? 'Update Item' : 'Add to Menu'}
          </button>
        </div>
      </div>

      {/* Active Items */}
      {items.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
            Your Menu ({items.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => (
              <div
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#141414', border: '1px solid rgba(0,230,118,0.15)',
                  borderRadius: 14, padding: '12px 16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      ${item.price.toFixed(2)} {PRICING_LABELS[item.pricing_type] || item.pricing_type}
                      {item.unit_label ? ` / ${item.unit_label}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleEdit(item)}
                    style={{
                      background: 'rgba(68,138,255,0.1)', border: '1px solid rgba(68,138,255,0.2)',
                      borderRadius: 8, width: 32, height: 32, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      color: '#448AFF', cursor: 'pointer', fontSize: 14,
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={deleting === item.id}
                    style={{
                      background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.2)',
                      borderRadius: 8, width: 32, height: 32, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      color: '#FF5252', cursor: 'pointer', opacity: deleting === item.id ? 0.4 : 1,
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#555', fontSize: 14 }}>
          No menu items yet. Tap a quick label or add your own above.
        </div>
      )}

      {/* Upgrade Overlay */}
      {showUpgrade && (
        <UpgradeOverlay
          open={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          onUpgraded={() => { setShowUpgrade(false); fetchMenu(); }}
        />
      )}
    </div>
  );
}

// ── Analytics Tab ──
function AnalyticsTab({ tier }: { tier: string }) {
  const isHmuFirst = tier === 'hmu_first';
  const [data, setData] = useState<{
    rides: { id: string; date: string; pickup: string | null; dropoff: string | null; amount: number; distanceMiles: number | null; durationMinutes: number | null; ratePerMile: number | null; ratePerMinute: number | null }[];
    aggregate: { avgRatePerMile: number; avgRatePerMinute: number; totalMiles: number; totalMinutes: number; totalRides: number; totalEarned: number };
    comparison: { area: string; yourAvgPerMile: number; areaAvgPerMile: number; percentile: number; yourAvgPerMinute: number; areaAvgPerMinute: number } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/driver/analytics')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#888' }}>
        Loading your analytics...
      </div>
    );
  }

  if (!data || data.aggregate.totalRides === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No ride data yet</div>
        <div style={{ fontSize: 13, color: '#888' }}>Complete some rides and your analytics will show up here</div>
      </div>
    );
  }

  const agg = data.aggregate;
  const comp = data.comparison;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Aggregate stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
      }}>
        <StatCard label="Total Rides" value={String(agg.totalRides)} />
        <StatCard label="Total Earned" value={`$${agg.totalEarned.toFixed(0)}`} color="#00E676" />
        <StatCard label="Total Miles" value={`${agg.totalMiles.toFixed(0)} mi`} />
        <StatCard label="Total Time" value={`${Math.round(agg.totalMinutes / 60)}h ${agg.totalMinutes % 60}m`} />
        <StatCard label="Avg $/mile" value={`$${agg.avgRatePerMile.toFixed(2)}`} color="#00E676" />
        <StatCard label="Avg $/min" value={`$${agg.avgRatePerMinute.toFixed(2)}`} color="#00E676" />
      </div>

      {/* Area comparison — HMU First only */}
      {comp && comp.percentile > 0 && (
        isHmuFirst ? (
          <div style={{
            background: '#141414', borderRadius: 16, padding: 16,
            border: '1px solid rgba(0,230,118,0.15)',
          }}>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', marginBottom: 8, fontWeight: 600 }}>
              How you compare — {comp.area}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#00E676', fontFamily: "'Space Mono', monospace" }}>
                  Top {Math.max(1, 100 - comp.percentile)}%
                </div>
                <div style={{ fontSize: 12, color: '#bbb' }}>of drivers in {comp.area}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: '#bbb' }}>Your avg: <span style={{ color: '#fff', fontWeight: 600 }}>${comp.yourAvgPerMile.toFixed(2)}/mi</span></div>
                <div style={{ fontSize: 13, color: '#bbb' }}>Area avg: <span style={{ color: '#fff' }}>${comp.areaAvgPerMile.toFixed(2)}/mi</span></div>
              </div>
            </div>
            {/* Percentile bar */}
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: 'linear-gradient(90deg, #00E676, #69F0AE)',
                width: `${Math.min(100, comp.percentile)}%`,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        ) : (
          <div style={{
            background: '#141414', borderRadius: 16, padding: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0, backdropFilter: 'blur(6px)',
              background: 'rgba(0,0,0,0.6)', zIndex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: 20, textAlign: 'center',
            }}>
              <Zap className="h-6 w-6" style={{ color: '#00E676', marginBottom: 8 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                See how you compare
              </div>
              <div style={{ fontSize: 12, color: '#bbb', marginBottom: 12 }}>
                HMU First members see their ranking vs other drivers in their area
              </div>
              <Link
                href="/driver/settings?tab=hmu-first"
                style={{
                  padding: '8px 20px', borderRadius: 100,
                  background: '#00E676', color: '#080808',
                  fontSize: 13, fontWeight: 700, textDecoration: 'none',
                }}
              >
                Upgrade to HMU First
              </Link>
            </div>
            {/* Blurred preview behind the overlay */}
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', marginBottom: 8, fontWeight: 600 }}>
              How you compare — {comp.area}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#00E676', fontFamily: "'Space Mono', monospace" }}>
                Top ??%
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: '#bbb' }}>Your avg: $?.??/mi</div>
                <div style={{ fontSize: 13, color: '#bbb' }}>Area avg: $?.??/mi</div>
              </div>
            </div>
          </div>
        )
      )}

      {/* Recent rides with analytics */}
      {data.rides.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', marginBottom: 8, fontWeight: 600 }}>
            Recent Rides
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.rides.slice(0, 10).map((ride) => (
              <Link
                key={ride.id}
                href={`/ride/${ride.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 12,
                  background: '#141414', border: '1px solid rgba(255,255,255,0.06)',
                  textDecoration: 'none', color: '#fff',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ride.dropoff || ride.pickup || 'Ride'}
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {ride.date ? new Date(ride.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                    {ride.distanceMiles != null && ` · ${ride.distanceMiles.toFixed(1)} mi`}
                    {ride.durationMinutes != null && ` · ${ride.durationMinutes} min`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#00E676' }}>${ride.amount.toFixed(2)}</div>
                  {ride.ratePerMile != null && (
                    <div style={{ fontSize: 11, color: '#888' }}>${ride.ratePerMile.toFixed(2)}/mi</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: '#141414', borderRadius: 14, padding: '14px 12px',
      border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center',
    }}>
      <div style={{
        fontSize: 20, fontWeight: 700, color: color || '#fff',
        fontFamily: "'Space Mono', monospace",
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
