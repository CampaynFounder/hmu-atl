'use client';

import Link from 'next/link';

interface Props {
  payoutSetupComplete: boolean;
  last4: string | null;
  accountType: string | null;
  bankName: string | null;
  tier: string;
}

export default function PayoutSection({ payoutSetupComplete, last4, accountType, bankName, tier }: Props) {
  return (
    <>
      <style>{`
        .po-section { background: var(--card, #141414); border: 1px solid var(--border, rgba(255,255,255,0.08)); border-radius: 20px; padding: 20px; margin-bottom: 16px; }
        .po-section-title { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; color: var(--gray, #888); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 14px; }

        /* Not set up banner */
        .po-banner { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: rgba(255,179,0,0.08); border: 1px solid rgba(255,179,0,0.2); border-radius: 14px; text-decoration: none; transition: all 0.15s; -webkit-tap-highlight-color: transparent; }
        .po-banner:hover { background: rgba(255,179,0,0.12); }
        .po-banner:active { transform: scale(0.98); }
        .po-banner-icon { font-size: 22px; flex-shrink: 0; }
        .po-banner-text { flex: 1; font-size: 14px; color: #FFB300; font-weight: 600; line-height: 1.4; }
        .po-banner-arrow { color: #FFB300; font-size: 18px; flex-shrink: 0; }

        /* Set up state */
        .po-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .po-row:last-child { border-bottom: none; }
        .po-row-left { flex: 1; padding-right: 12px; }
        .po-row-label { font-size: 15px; font-weight: 600; color: #fff; }
        .po-row-sub { font-size: 12px; color: var(--gray, #888); margin-top: 2px; line-height: 1.4; }
        .po-row-value { font-size: 14px; color: var(--gray-light, #bbb); display: flex; align-items: center; gap: 6px; }
        .po-row-icon { font-size: 18px; }

        .po-account { display: flex; align-items: center; gap: 10px; }
        .po-account-icon { font-size: 20px; }
        .po-account-detail { font-size: 14px; color: var(--gray-light, #bbb); }
        .po-account-detail span { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 13px; }

        .po-change-link { display: block; margin-top: 14px; text-align: center; font-size: 13px; color: var(--green, #00E676); text-decoration: none; font-weight: 600; padding: 10px; border: 1px solid rgba(0,230,118,0.2); border-radius: 100px; transition: all 0.15s; }
        .po-change-link:hover { background: rgba(0,230,118,0.06); }
        .po-change-link:active { transform: scale(0.97); }
      `}</style>

      <div className="po-section">
        <div className="po-section-title">Payouts</div>

        {!payoutSetupComplete ? (
          <Link href="/driver/payout-setup" className="po-banner">
            <div className="po-banner-icon">{'\u26A0\uFE0F'}</div>
            <div className="po-banner-text">
              Set up your payout account to start earning
            </div>
            <div className="po-banner-arrow">{'\u2192'}</div>
          </Link>
        ) : (
          <>
            <div className="po-row">
              <div className="po-row-left">
                <div className="po-row-label">Payout method</div>
              </div>
              <div className="po-row-value">
                <div className="po-account">
                  <span className="po-account-icon">
                    {accountType === 'card' ? '\uD83D\uDCB3' : '\uD83C\uDFE6'}
                  </span>
                  <span className="po-account-detail">
                    {bankName || (accountType === 'card' ? 'Debit card' : 'Bank')} ending in <span>{last4}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="po-row">
              <div className="po-row-left">
                <div className="po-row-label">Payout timing</div>
                <div className="po-row-sub">
                  {tier === 'hmu_first'
                    ? 'Paid instantly after each ride'
                    : 'Batch payout every morning at 6am'}
                </div>
              </div>
              <div className="po-row-value">
                {tier === 'hmu_first' ? 'Instant \u26A1' : 'Next morning \uD83C\uDF05'}
              </div>
            </div>

            <Link href="/driver/payout-setup" className="po-change-link">
              Change payout method
            </Link>
          </>
        )}
      </div>
    </>
  );
}
