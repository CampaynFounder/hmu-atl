'use client';

import { useState, useCallback } from 'react';

interface Settings {
  acceptDirectBookings: boolean;
  minRiderChillScore: number;
  requireOgStatus: boolean;
  handle: string;
}

interface Props {
  initial: Settings;
}

export default function BookingSettingsPanel({ initial }: Props) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/d/${settings.handle}`
    : `https://atl.hmucashride.com/d/${settings.handle}`;

  const save = useCallback(async (patch: Partial<Settings>) => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/drivers/booking-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accept_direct_bookings: patch.acceptDirectBookings,
          min_rider_chill_score: patch.minRiderChillScore,
          require_og_status: patch.requireOgStatus,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, []);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    save(next);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  };

  const shareLink = () => {
    if (navigator.share) {
      navigator.share({ title: 'Book me on HMU ATL', url: shareUrl });
    } else {
      copyLink();
    }
  };

  return (
    <div className="bsp">
      <style>{`
        .bsp { background: #141414; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 24px 20px; display: flex; flex-direction: column; gap: 0; }
        .bsp-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 28px; margin-bottom: 20px; }
        .bsp-row { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .bsp-row:last-of-type { border-bottom: none; }
        .bsp-row-left { flex: 1; padding-right: 16px; }
        .bsp-row-label { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
        .bsp-row-sub { font-size: 12px; color: #888; line-height: 1.4; }
        .toggle { width: 48px; height: 28px; border-radius: 100px; border: none; cursor: pointer; position: relative; transition: background 0.2s; flex-shrink: 0; }
        .toggle.on { background: #00E676; }
        .toggle.off { background: #2a2a2a; }
        .toggle-thumb { position: absolute; top: 4px; width: 20px; height: 20px; background: #fff; border-radius: 50%; transition: left 0.2s; }
        .toggle.on .toggle-thumb { left: 24px; }
        .toggle.off .toggle-thumb { left: 4px; }
        .score-input { background: #1f1f1f; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; color: #fff; font-size: 14px; width: 70px; text-align: center; outline: none; font-family: var(--font-mono, monospace); }
        .score-input:focus { border-color: #00E676; }
        .share-section { margin-top: 20px; }
        .share-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 3px; font-family: var(--font-mono, monospace); margin-bottom: 10px; }
        .share-link-box { display: flex; align-items: center; gap: 10px; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 16px; }
        .share-link-text { flex: 1; font-family: var(--font-mono, monospace); font-size: 13px; color: #bbb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .share-btn { background: rgba(0,230,118,0.12); border: 1px solid rgba(0,230,118,0.25); border-radius: 8px; color: #00E676; font-size: 12px; font-weight: 600; padding: 6px 12px; cursor: pointer; white-space: nowrap; font-family: var(--font-body, 'DM Sans', sans-serif); transition: background 0.15s; }
        .share-btn:hover { background: rgba(0,230,118,0.2); }
        .share-btn-row { display: flex; gap: 8px; margin-top: 10px; }
        .share-btn-full { flex: 1; background: #00E676; color: #080808; border: none; border-radius: 100px; padding: 14px; font-weight: 700; font-size: 15px; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); transition: transform 0.15s; }
        .share-btn-full:hover { transform: scale(1.02); }
        .save-indicator { font-size: 12px; color: #00E676; text-align: right; min-height: 18px; margin-top: 8px; }
      `}</style>

      <div className="bsp-title">Direct Bookings</div>

      {/* Accept toggle */}
      <div className="bsp-row">
        <div className="bsp-row-left">
          <div className="bsp-row-label">Accept direct bookings</div>
          <div className="bsp-row-sub">Riders with your link can request you directly</div>
        </div>
        <button
          className={`toggle ${settings.acceptDirectBookings ? 'on' : 'off'}`}
          onClick={() => update({ acceptDirectBookings: !settings.acceptDirectBookings })}
          aria-label="Toggle direct bookings"
        >
          <div className="toggle-thumb" />
        </button>
      </div>

      {/* Min chill score */}
      <div className="bsp-row">
        <div className="bsp-row-left">
          <div className="bsp-row-label">Min Chill Score</div>
          <div className="bsp-row-sub">Only riders at or above this score can book. Set 0 for any.</div>
        </div>
        <input
          type="number"
          className="score-input"
          value={settings.minRiderChillScore}
          min={0}
          max={100}
          onBlur={(e) => update({ minRiderChillScore: Math.min(100, Math.max(0, Number(e.target.value))) })}
          onChange={(e) => setSettings((s) => ({ ...s, minRiderChillScore: Number(e.target.value) }))}
        />
      </div>

      {/* OG only */}
      <div className="bsp-row">
        <div className="bsp-row-left">
          <div className="bsp-row-label">OG Riders only</div>
          <div className="bsp-row-sub">Require 10+ rides and zero open disputes</div>
        </div>
        <button
          className={`toggle ${settings.requireOgStatus ? 'on' : 'off'}`}
          onClick={() => update({ requireOgStatus: !settings.requireOgStatus })}
          aria-label="Toggle OG only"
        >
          <div className="toggle-thumb" />
        </button>
      </div>

      <div className="save-indicator">{saving ? 'Saving...' : saved ? 'Saved ✓' : ''}</div>

      {/* Share link */}
      <div className="share-section">
        <div className="share-label">Your booking link</div>
        <div className="share-link-box">
          <span className="share-link-text">{shareUrl}</span>
          <button className="share-btn" onClick={copyLink}>
            {copyDone ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="share-btn-row">
          <button className="share-btn-full" onClick={shareLink}>
            Share My Link
          </button>
        </div>
      </div>
    </div>
  );
}
