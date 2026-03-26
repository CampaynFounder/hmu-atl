'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { VideoRecorder } from '@/components/onboarding/video-recorder';

const InlinePaymentForm = dynamic(() => import('@/components/payments/inline-payment-form'), { ssr: false });

interface ProfileData {
  displayName: string;
  firstName: string;
  lastName: string;
  handle: string | null;
  avatarUrl: string | null;
  videoUrl: string | null;
  lgbtqFriendly: boolean;
  chillScore: number;
  completedRides: number;
  ogStatus: boolean;
  hasPaymentMethod: boolean;
  paymentBrand: string | null;
  paymentLast4: string | null;
}

interface Props {
  profile: ProfileData;
}

export default function RiderProfileClient({ profile }: Props) {
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [videoUrl, setVideoUrl] = useState(profile.videoUrl);
  const [uploading, setUploading] = useState<'avatar' | 'video' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showVideoEditor, setShowVideoEditor] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File, type: 'avatar') {
    setUploading(type);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('profile_type', 'rider');
      formData.append('media_type', 'photo');
      formData.append('save_to_profile', 'true');

      const res = await fetch('/api/upload/video', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error || 'Upload failed'); return; }

      setAvatarUrl(data.url);
    } catch {
      setUploadError('Upload failed');
    } finally {
      setUploading(null);
    }
  }

  function handlePaymentSuccess() {
    setShowPaymentForm(false);
    window.location.reload();
  }

  return (
    <div style={{
      background: '#080808', color: '#fff', minHeight: '100svh',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)", padding: '72px 20px 40px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: '32px', margin: 0 }}>
          My Profile
        </h1>
        <Link href="/rider/home" style={{ fontSize: '14px', color: '#00E676', textDecoration: 'none', fontWeight: 600 }}>
          Back
        </Link>
      </div>

      {/* Avatar + Name Hero */}
      <div style={{
        background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, padding: '24px 20px', marginBottom: 16, textAlign: 'center',
      }}>
        {/* Avatar */}
        <div
          onClick={() => avatarRef.current?.click()}
          style={{
            width: 96, height: 96, borderRadius: '50%', margin: '0 auto 16px',
            overflow: 'hidden', cursor: 'pointer', position: 'relative',
            border: '3px solid rgba(0,230,118,0.3)',
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%', background: '#1a1a1a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, color: '#555',
            }}>
              {profile.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {uploading === 'avatar' && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: '#fff',
            }}>
              ...
            </div>
          )}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(0,0,0,0.7)', padding: '4px 0',
            fontSize: 10, color: '#bbb', textAlign: 'center',
          }}>
            {avatarUrl ? 'Change' : 'Add Photo'}
          </div>
        </div>
        <input
          ref={avatarRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f, 'avatar');
            e.target.value = '';
          }}
        />

        <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 36, lineHeight: 1 }}>
          {profile.displayName}
        </div>
        {profile.handle && (
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>@{profile.handle}</div>
        )}

        {/* Badges */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {profile.ogStatus && (
            <span style={{
              background: 'rgba(0,230,118,0.12)', color: '#00E676',
              fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 100,
              letterSpacing: 1, textTransform: 'uppercase',
            }}>
              OG Rider
            </span>
          )}
          {profile.lgbtqFriendly && (
            <span style={{
              background: 'rgba(168,85,247,0.15)', color: '#A855F7',
              fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 100,
              letterSpacing: 1, textTransform: 'uppercase',
            }}>
              LGBTQ+
            </span>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: 22, fontWeight: 700, color: '#00E676' }}>
              {profile.chillScore.toFixed(0)}%
            </div>
            <div style={{ fontSize: 10, color: '#888', letterSpacing: 1, textTransform: 'uppercase' }}>Chill</div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: 22, fontWeight: 700 }}>
              {profile.completedRides}
            </div>
            <div style={{ fontSize: 10, color: '#888', letterSpacing: 1, textTransform: 'uppercase' }}>Rides</div>
          </div>
        </div>
      </div>

      {/* Video Intro */}
      <div style={{
        background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, padding: 20, marginBottom: 16,
      }}>
        <div style={{
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          fontSize: 10, color: '#888', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14,
        }}>
          Video Intro
        </div>

        {videoUrl && !showVideoEditor ? (
          <>
            <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
              <video
                src={videoUrl}
                controls
                playsInline
                style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'contain', background: '#000' }}
              />
            </div>
            <button
              onClick={() => setShowVideoEditor(true)}
              style={{
                width: '100%', padding: 12, borderRadius: 100,
                border: '1px solid rgba(0,230,118,0.3)', background: 'transparent',
                color: '#00E676', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Change Video
            </button>
          </>
        ) : (
          <>
            {!showVideoEditor && (
              <div style={{ fontSize: 13, color: '#888', marginBottom: 12, lineHeight: 1.4 }}>
                Add a video so drivers know who they&apos;re picking up. Builds trust.
              </div>
            )}
            <VideoRecorder
              onVideoRecorded={(url) => {
                setVideoUrl(url);
                setShowVideoEditor(false);
              }}
              existingVideoUrl={videoUrl || undefined}
              profileType="rider"
              onUploadStateChange={(uploading) => setUploading(uploading ? 'video' : null)}
            />
            {showVideoEditor && (
              <button
                onClick={() => setShowVideoEditor(false)}
                style={{
                  width: '100%', padding: 12, borderRadius: 100, marginTop: 8,
                  border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
                  color: '#888', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                }}
              >
                Cancel
              </button>
            )}
          </>
        )}
      </div>

      {uploadError && (
        <div style={{
          fontSize: 13, color: '#FF5252', padding: '10px 14px', marginBottom: 12,
          background: 'rgba(255,68,68,0.08)', borderRadius: 10,
        }}>
          {uploadError}
        </div>
      )}

      {/* Payment Method */}
      {showPaymentForm ? (
        <div style={{ marginBottom: 16 }}>
          <InlinePaymentForm
            onSuccess={handlePaymentSuccess}
            onCancel={() => setShowPaymentForm(false)}
          />
        </div>
      ) : (
      <div style={{
        background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, padding: 20, marginBottom: 16,
      }}>
        <div style={{
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          fontSize: 10, color: '#888', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14,
        }}>
          Payment
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Payment Method</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {profile.hasPaymentMethod
                ? `${(profile.paymentBrand || 'Card').charAt(0).toUpperCase() + (profile.paymentBrand || 'card').slice(1)} ending in ${profile.paymentLast4}`
                : 'Required before you can book rides'}
            </div>
          </div>
          <button
            onClick={() => setShowPaymentForm(true)}
            style={{
              background: profile.hasPaymentMethod ? 'none' : '#00E676',
              border: profile.hasPaymentMethod ? '1px solid rgba(0,230,118,0.3)' : 'none',
              color: profile.hasPaymentMethod ? '#00E676' : '#080808',
              fontSize: 12, fontWeight: profile.hasPaymentMethod ? 600 : 700,
              padding: profile.hasPaymentMethod ? '6px 14px' : '8px 16px',
              borderRadius: 100, cursor: 'pointer',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          >
            {profile.hasPaymentMethod ? 'Update' : 'Link Payment Method'}
          </button>
        </div>
      </div>
      )}

      {/* Settings Link */}
      <Link
        href="/rider/settings"
        style={{
          display: 'block', background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: '18px 20px', marginBottom: 16, textDecoration: 'none', color: '#fff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Settings</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Security, payment methods, and support</div>
          </div>
          <div style={{ fontSize: 14, color: '#00E676', fontWeight: 600 }}>{'\u203A'}</div>
        </div>
      </Link>
    </div>
  );
}
