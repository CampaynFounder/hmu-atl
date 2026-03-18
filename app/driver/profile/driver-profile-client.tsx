'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { VideoRecorder } from '@/components/onboarding/video-recorder';

interface ProfileData {
  handle: string;
  displayName: string;
  firstName: string;
  lastName: string;
  gender: string;
  pronouns: string;
  lgbtqFriendly: boolean;
  areas: string[];
  pricing: Record<string, unknown>;
  schedule: Record<string, unknown>;
  videoUrl: string;
  vehiclePhotoUrl: string;
  acceptDirectBookings: boolean;
  minRiderChillScore: number;
  requireOgStatus: boolean;
}

interface UserData {
  tier: string;
  chillScore: number;
  completedRides: number;
}

interface Props {
  profile: ProfileData;
  user: UserData;
}

const ATLANTA_AREAS = [
  'Midtown', 'Buckhead', 'Downtown', 'East Atlanta', 'West End',
  'Decatur', 'College Park', 'Sandy Springs', 'Marietta', 'Stone Mountain',
  'Dunwoody', 'Brookhaven', 'Smyrna', 'Kennesaw', 'Alpharetta',
  'Roswell', 'Lawrenceville', 'Norcross', 'Duluth', 'Conyers',
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

export default function DriverProfileClient({ profile, user }: Props) {
  const [data, setData] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [showVideoEditor, setShowVideoEditor] = useState(!profile.videoUrl);
  const [videoSaved, setVideoSaved] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const save = useCallback(async (patch: Partial<ProfileData>) => {
    setSaving(true);
    setSaved('');
    try {
      const apiPatch: Record<string, unknown> = {};
      if ('areas' in patch) apiPatch.areas = patch.areas;
      if ('pricing' in patch) apiPatch.pricing = patch.pricing;
      if ('schedule' in patch) apiPatch.schedule = patch.schedule;
      if ('lgbtqFriendly' in patch) apiPatch.lgbtq_friendly = patch.lgbtqFriendly;
      if ('acceptDirectBookings' in patch) apiPatch.accept_direct_bookings = patch.acceptDirectBookings;
      if ('minRiderChillScore' in patch) apiPatch.min_rider_chill_score = patch.minRiderChillScore;
      if ('requireOgStatus' in patch) apiPatch.require_og_status = patch.requireOgStatus;

      if ('acceptDirectBookings' in patch || 'minRiderChillScore' in patch || 'requireOgStatus' in patch) {
        await fetch('/api/drivers/booking-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accept_direct_bookings: patch.acceptDirectBookings ?? data.acceptDirectBookings,
            min_rider_chill_score: patch.minRiderChillScore ?? data.minRiderChillScore,
            require_og_status: patch.requireOgStatus ?? data.requireOgStatus,
          }),
        });
      } else {
        await fetch('/api/users/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_type: 'driver', ...apiPatch }),
        });
      }
      setSaved('Saved');
      setTimeout(() => setSaved(''), 2000);
    } catch {
      setSaved('Error saving');
    } finally {
      setSaving(false);
    }
  }, [data]);

  const update = (patch: Partial<ProfileData>) => {
    const next = { ...data, ...patch };
    setData(next);
    save(patch);
  };

  const toggleArea = (area: string) => {
    const next = data.areas.includes(area)
      ? data.areas.filter((a) => a !== area)
      : [...data.areas, area];
    update({ areas: next });
  };

  const toggleDay = (day: string) => {
    const sched = { ...data.schedule };
    const current = sched[day] as { available?: boolean } | undefined;
    sched[day] = { ...current, available: !(current?.available) };
    update({ schedule: sched });
  };

  const updatePricing = (key: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    update({ pricing: { ...data.pricing, [key]: num } });
  };

  const handleVideoSaved = async (url: string) => {
    // Upload API auto-saves video_url to driver_profiles
    setData((d) => ({ ...d, videoUrl: url }));
    setShowVideoEditor(false);
    setVideoSaved(true);
    setTimeout(() => setVideoSaved(false), 3000);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append('video', file, file.name);
      formData.append('profile_type', 'driver');
      formData.append('media_type', 'photo');

      const res = await fetch('/api/upload/video', { method: 'POST', body: formData });

      if (res.ok) {
        const result = await res.json();
        // Upload API auto-saves to vehicle_info.photo_url
        setData((d) => ({ ...d, vehiclePhotoUrl: result.url }));
        setSaved('Photo saved');
        setTimeout(() => setSaved(''), 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        setSaved(err.error || 'Upload failed');
        setTimeout(() => setSaved(''), 3000);
      }
    } catch {
      setSaved('Upload failed');
      setTimeout(() => setSaved(''), 3000);
    } finally {
      setPhotoUploading(false);
    }
  };

  const shareUrl = `atl.hmucashride.com/d/${data.handle}`;

  return (
    <>
      <style>{`
        :root { --green: #00E676; --black: #080808; --card: #141414; --card2: #1a1a1a; --border: rgba(255,255,255,0.08); --gray: #888; --gray-light: #bbb; }
        .dp { background: var(--black); color: #fff; min-height: 100svh; font-family: var(--font-body, 'DM Sans', sans-serif); padding: 72px 20px 40px; }
        .dp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
        .dp-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 32px; }
        .dp-back { font-size: 14px; color: var(--green); text-decoration: none; font-weight: 600; }
        .dp-stats { display: flex; gap: 12px; margin-bottom: 28px; }
        .dp-stat { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; flex: 1; text-align: center; }
        .dp-stat-val { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 28px; color: var(--green); }
        .dp-stat-label { font-size: 11px; color: var(--gray); text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
        .dp-section { background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 20px; margin-bottom: 16px; }
        .dp-section-title { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; color: var(--gray); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 14px; }
        .dp-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .dp-row:last-child { border-bottom: none; }
        .dp-row-left { flex: 1; padding-right: 12px; }
        .dp-row-label { font-size: 15px; font-weight: 600; }
        .dp-row-sub { font-size: 12px; color: var(--gray); margin-top: 2px; line-height: 1.4; }
        .dp-row-value { font-size: 14px; color: var(--gray-light); }
        .toggle { width: 48px; height: 28px; border-radius: 100px; border: none; cursor: pointer; position: relative; transition: background 0.2s; flex-shrink: 0; }
        .toggle.on { background: var(--green); }
        .toggle.off { background: #2a2a2a; }
        .toggle-thumb { position: absolute; top: 4px; width: 20px; height: 20px; background: #fff; border-radius: 50%; transition: left 0.2s; }
        .toggle.on .toggle-thumb { left: 24px; }
        .toggle.off .toggle-thumb { left: 4px; }
        .score-input { background: #1f1f1f; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; color: #fff; font-size: 14px; width: 70px; text-align: center; outline: none; font-family: var(--font-mono, monospace); }
        .score-input:focus { border-color: var(--green); }
        .price-input { background: #1f1f1f; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; color: var(--green); font-size: 16px; width: 80px; text-align: center; outline: none; font-family: var(--font-display, 'Bebas Neue', sans-serif); }
        .price-input:focus { border-color: var(--green); }
        .area-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .area-chip { background: #1f1f1f; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px 14px; font-size: 13px; color: var(--gray-light); cursor: pointer; transition: all 0.15s; }
        .area-chip.selected { background: rgba(0,230,118,0.12); border-color: rgba(0,230,118,0.3); color: var(--green); }
        .day-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .day-btn { background: #1f1f1f; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 4px; text-align: center; cursor: pointer; transition: all 0.15s; }
        .day-btn.active { background: rgba(0,230,118,0.1); border-color: rgba(0,230,118,0.3); }
        .day-btn-label { font-size: 10px; color: var(--gray); text-transform: uppercase; letter-spacing: 1px; }
        .day-btn-dot { width: 6px; height: 6px; border-radius: 50%; background: #333; margin: 6px auto 0; }
        .day-btn.active .day-btn-dot { background: var(--green); }
        .save-status { font-size: 12px; color: var(--green); text-align: right; min-height: 18px; margin-top: 4px; }
        .link-pill { background: var(--card2); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; font-family: var(--font-mono, monospace); font-size: 13px; color: var(--green); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 12px; }
        .badge { display: inline-block; background: var(--green); color: var(--black); font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 100px; letter-spacing: 1px; text-transform: uppercase; margin-left: 8px; }

        /* Video section */
        .media-saved { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; background: rgba(0,230,118,0.1); border: 1px solid rgba(0,230,118,0.25); border-radius: 12px; color: var(--green); font-size: 14px; font-weight: 600; margin-bottom: 12px; }
        .media-preview { position: relative; border-radius: 16px; overflow: hidden; margin-bottom: 12px; }
        .media-preview video, .media-preview img { width: 100%; aspect-ratio: 9/16; max-height: 280px; object-fit: cover; border-radius: 16px; background: #000; display: block; }
        .media-actions { display: flex; gap: 8px; }
        .media-btn { flex: 1; padding: 12px; border-radius: 100px; font-size: 14px; font-weight: 600; cursor: pointer; text-align: center; font-family: var(--font-body, 'DM Sans', sans-serif); transition: all 0.15s; }
        .media-btn:hover { transform: scale(1.02); }
        .media-btn--outline { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #fff; }
        .media-btn--green { background: var(--green); border: none; color: var(--black); }
        .media-btn--red { background: transparent; border: 1px solid rgba(255,80,80,0.3); color: #FF5252; }

        /* Dark theme overrides for VideoRecorder */
        .video-editor-wrap { color: #fff; }
        .video-editor-wrap .text-muted-foreground { color: var(--gray) !important; }
        .video-editor-wrap button[class*="border-purple"] { border-color: var(--green) !important; background: rgba(0,230,118,0.08) !important; }
        .video-editor-wrap button[class*="border-purple"] div[class*="bg-purple"] { background: var(--green) !important; }
        .video-editor-wrap button[class*="border-gray"], .video-editor-wrap button[class*="border-2 border-gray"] { border-color: rgba(255,255,255,0.15) !important; background: var(--card2) !important; }
        .video-editor-wrap div[class*="bg-gray-200"] { background: #333 !important; color: var(--gray-light) !important; }
        .video-editor-wrap div[class*="bg-amber-50"] { background: rgba(255,179,0,0.08) !important; border-color: rgba(255,179,0,0.2) !important; }
        .video-editor-wrap p[class*="text-amber-800"] { color: #FFB300 !important; }
        .video-editor-wrap p[class*="text-amber-700"] { color: #FFA000 !important; }
        .video-editor-wrap div[class*="border-dashed"] { border-color: rgba(255,255,255,0.15) !important; background: var(--card2) !important; }
        .video-editor-wrap label[class*="from-purple"] { background: var(--green) !important; color: var(--black) !important; }
        .video-editor-wrap button[class*="from-red"] { background: var(--green) !important; }
        .video-editor-wrap button[class*="from-green"] { background: var(--green) !important; color: var(--black) !important; }
        .video-editor-wrap div[class*="bg-red-50"] { background: rgba(255,68,68,0.1) !important; color: #FF5252 !important; }
        .video-editor-wrap button[class*="border-gray-300"] { border-color: rgba(255,255,255,0.15) !important; color: var(--gray-light) !important; }
        .video-editor-wrap button[class*="border-gray-300"]:hover { background: rgba(255,255,255,0.05) !important; }

        /* Photo section */
        .photo-upload-zone { border: 2px dashed rgba(255,255,255,0.12); border-radius: 16px; padding: 32px 20px; text-align: center; cursor: pointer; transition: all 0.15s; }
        .photo-upload-zone:hover { border-color: rgba(0,230,118,0.3); background: rgba(0,230,118,0.03); }
        .photo-upload-icon { font-size: 36px; margin-bottom: 8px; opacity: 0.5; }
        .photo-upload-text { font-size: 14px; color: var(--gray-light); font-weight: 500; }
        .photo-upload-sub { font-size: 12px; color: var(--gray); margin-top: 4px; }
      `}</style>

      <div className="dp">
        <div className="dp-header">
          <h1 className="dp-title">
            {data.displayName}
            {user.tier === 'hmu_first' && <span className="badge">HMU First</span>}
          </h1>
          <Link href="/driver/home" className="dp-back">Back</Link>
        </div>

        {/* Stats */}
        <div className="dp-stats">
          <div className="dp-stat">
            <div className="dp-stat-val">{user.chillScore.toFixed(0)}%</div>
            <div className="dp-stat-label">Chill Score</div>
          </div>
          <div className="dp-stat">
            <div className="dp-stat-val">{user.completedRides}</div>
            <div className="dp-stat-label">Rides</div>
          </div>
          <div className="dp-stat">
            <div className="dp-stat-val">{user.tier === 'hmu_first' ? '12%' : '10-25%'}</div>
            <div className="dp-stat-label">Fee Rate</div>
          </div>
        </div>

        {/* Share Link */}
        <div className="dp-section">
          <div className="dp-section-title">Your HMU Link</div>
          <div className="link-pill">{shareUrl}</div>
        </div>

        {/* Booking Settings */}
        <div className="dp-section">
          <div className="dp-section-title">Booking Settings</div>

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">Accept direct bookings</div>
              <div className="dp-row-sub">Riders with your link can request you</div>
            </div>
            <button
              className={`toggle ${data.acceptDirectBookings ? 'on' : 'off'}`}
              onClick={() => update({ acceptDirectBookings: !data.acceptDirectBookings })}
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">Min Chill Score</div>
              <div className="dp-row-sub">Only riders at or above this score</div>
            </div>
            <input
              type="number"
              className="score-input"
              value={data.minRiderChillScore}
              min={0}
              max={100}
              onChange={(e) => setData((d) => ({ ...d, minRiderChillScore: Number(e.target.value) }))}
              onBlur={(e) => update({ minRiderChillScore: Math.min(100, Math.max(0, Number(e.target.value))) })}
            />
          </div>

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">OG Riders only</div>
              <div className="dp-row-sub">Require 10+ rides, zero disputes</div>
            </div>
            <button
              className={`toggle ${data.requireOgStatus ? 'on' : 'off'}`}
              onClick={() => update({ requireOgStatus: !data.requireOgStatus })}
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">LGBTQ+ friendly</div>
              <div className="dp-row-sub">Show badge on your profile</div>
            </div>
            <button
              className={`toggle ${data.lgbtqFriendly ? 'on' : 'off'}`}
              onClick={() => update({ lgbtqFriendly: !data.lgbtqFriendly })}
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          <div className="save-status">{saving ? 'Saving...' : saved}</div>
        </div>

        {/* Pricing */}
        <div className="dp-section">
          <div className="dp-section-title">Pricing</div>
          <div className="dp-row">
            <div className="dp-row-left"><div className="dp-row-label">Minimum ride</div></div>
            <input type="number" className="price-input" defaultValue={Number(data.pricing.minimum ?? 0)} onBlur={(e) => updatePricing('minimum', e.target.value)} placeholder="$" />
          </div>
          <div className="dp-row">
            <div className="dp-row-left"><div className="dp-row-label">Base rate (30 min)</div></div>
            <input type="number" className="price-input" defaultValue={Number(data.pricing.base_rate ?? 0)} onBlur={(e) => updatePricing('base_rate', e.target.value)} placeholder="$" />
          </div>
          <div className="dp-row">
            <div className="dp-row-left"><div className="dp-row-label">1 hour</div></div>
            <input type="number" className="price-input" defaultValue={Number(data.pricing.hourly ?? 0)} onBlur={(e) => updatePricing('hourly', e.target.value)} placeholder="$" />
          </div>
          <div className="dp-row">
            <div className="dp-row-left"><div className="dp-row-label">Out of town / hr</div></div>
            <input type="number" className="price-input" defaultValue={Number(data.pricing.out_of_town ?? 0)} onBlur={(e) => updatePricing('out_of_town', e.target.value)} placeholder="$" />
          </div>
        </div>

        {/* Areas */}
        <div className="dp-section">
          <div className="dp-section-title">Areas You Serve</div>
          <div className="area-chips">
            {ATLANTA_AREAS.map((area) => (
              <button key={area} className={`area-chip${data.areas.includes(area) ? ' selected' : ''}`} onClick={() => toggleArea(area)}>
                {area}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div className="dp-section">
          <div className="dp-section-title">Availability</div>
          <div className="day-grid">
            {DAYS.map((day) => {
              const isActive = (data.schedule[day] as { available?: boolean } | undefined)?.available ?? false;
              return (
                <button key={day} className={`day-btn${isActive ? ' active' : ''}`} onClick={() => toggleDay(day)}>
                  <div className="day-btn-label">{DAY_LABELS[day]}</div>
                  <div className="day-btn-dot" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Video Intro */}
        <div className="dp-section">
          <div className="dp-section-title">Video Intro</div>
          <p className="dp-row-sub" style={{ marginBottom: '14px' }}>
            Plays on your HMU link so riders know who&apos;s pulling up
          </p>

          {videoSaved && (
            <div className="media-saved">Saved — your video is live on your HMU link</div>
          )}

          {data.videoUrl && !showVideoEditor ? (
            <>
              <div className="media-preview">
                <video
                  src={data.videoUrl}
                  loop
                  muted
                  playsInline
                  autoPlay
                />
              </div>
              <div className="media-actions">
                <button className="media-btn media-btn--outline" onClick={() => setShowVideoEditor(true)}>
                  Record New
                </button>
                <button className="media-btn media-btn--outline" onClick={() => setShowVideoEditor(true)}>
                  Upload New
                </button>
              </div>
            </>
          ) : (
            <div className="video-editor-wrap">
              <VideoRecorder
                key={showVideoEditor ? 'editing' : 'initial'}
                onVideoRecorded={(url) => handleVideoSaved(url)}
                existingVideoUrl={undefined}
                profileType="driver"
              />
              {data.videoUrl && (
                <button
                  className="media-btn media-btn--outline"
                  style={{ width: '100%', marginTop: '10px' }}
                  onClick={() => setShowVideoEditor(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>

        {/* Cover Photo / Ad */}
        <div className="dp-section">
          <div className="dp-section-title">Cover Photo / Ad</div>
          <p className="dp-row-sub" style={{ marginBottom: '14px' }}>
            Shows on your HMU link — use a vehicle photo, promo flyer, or ad
          </p>

          {data.vehiclePhotoUrl ? (
            <>
              <div className="media-preview">
                <img src={data.vehiclePhotoUrl} alt="Cover" style={{ aspectRatio: '4/3' }} />
              </div>
              <div className="media-actions">
                <button
                  className="media-btn media-btn--outline"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                >
                  {photoUploading ? 'Uploading...' : 'Change Photo'}
                </button>
              </div>
            </>
          ) : (
            <div className="photo-upload-zone" onClick={() => photoInputRef.current?.click()}>
              <div className="photo-upload-icon">{'\uD83D\uDCF7'}</div>
              <div className="photo-upload-text">
                {photoUploading ? 'Uploading...' : 'Tap to upload a photo'}
              </div>
              <div className="photo-upload-sub">
                Vehicle photo, promo card, or advertisement
              </div>
            </div>
          )}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            style={{ display: 'none' }}
          />
        </div>

        {/* Profile Info */}
        <div className="dp-section">
          <div className="dp-section-title">Profile Info</div>
          <div className="dp-row">
            <div className="dp-row-left"><div className="dp-row-label">Name</div></div>
            <div className="dp-row-value">{data.firstName} {data.lastName}</div>
          </div>
          <div className="dp-row">
            <div className="dp-row-left"><div className="dp-row-label">Gender</div></div>
            <div className="dp-row-value">{data.gender || '\u2014'}</div>
          </div>
          <div className="dp-row">
            <div className="dp-row-left"><div className="dp-row-label">Pronouns</div></div>
            <div className="dp-row-value">{data.pronouns || '\u2014'}</div>
          </div>
          <div className="dp-row">
            <div className="dp-row-left"><div className="dp-row-label">Handle</div></div>
            <div className="dp-row-value">@{data.handle}</div>
          </div>
        </div>
      </div>
    </>
  );
}
