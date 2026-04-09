'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';

// Add new videos here — order matters (first = shown first)
const SHOWCASE_VIDEOS = [
  { src: '/videos/sample-hmu-1.mp4' },
  // { src: '/videos/sample-hmu-2.mp4' },
  // { src: '/videos/sample-hmu-3.mp4' },
];

export default function ShowcaseCarousel() {
  const [current, setCurrent] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef(0);

  const count = SHOWCASE_VIDEOS.length;
  const video = SHOWCASE_VIDEOS[current];

  const goTo = useCallback((idx: number) => {
    setCurrent(((idx % count) + count) % count);
  }, [count]);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);

  // Auto-advance to next video when one ends (or loop if only 1)
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    el.load();
    el.play().catch(() => {});

    const onEnded = () => {
      if (count > 1) {
        next();
      } else {
        // Single video — restart loop
        el.currentTime = 0;
        el.play().catch(() => {});
      }
    };
    el.addEventListener('ended', onEnded);
    return () => el.removeEventListener('ended', onEnded);
  }, [current, count, next]);

  // Swipe to navigate (multi-video only)
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (count <= 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      goTo(dx < 0 ? current + 1 : current - 1);
    }
  };

  return (
    <>
      <style>{`
        .showcase-wrap {
          position: relative;
          border-radius: 20px;
          overflow: hidden;
          margin-bottom: 20px;
          background: #0a0a0a;
          border: 1px solid rgba(255,255,255,0.08);
          aspect-ratio: 9 / 16;
          max-height: 420px;
        }
        .showcase-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .showcase-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 40%);
        }
        .showcase-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #00E676;
          font-size: 10px;
          font-weight: 800;
          padding: 5px 10px;
          border-radius: 100px;
          letter-spacing: 1px;
          text-transform: uppercase;
          font-family: var(--font-mono, 'Space Mono', monospace);
          pointer-events: none;
        }
        .showcase-cta {
          position: absolute;
          bottom: 14px;
          right: 14px;
          display: inline-block;
          text-align: center;
          padding: 8px 16px;
          border-radius: 100px;
          background: #00E676;
          color: #080808;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
          font-family: var(--font-body, 'DM Sans', sans-serif);
          z-index: 2;
          animation: showcasePulse 2.5s ease-in-out infinite;
          box-shadow: 0 0 12px rgba(0,230,118,0.4);
        }
        .showcase-cta:active {
          transform: scale(0.95);
        }
        @keyframes showcasePulse {
          0%, 100% { box-shadow: 0 0 8px rgba(0,230,118,0.3); }
          50% { box-shadow: 0 0 18px rgba(0,230,118,0.6); }
        }
        .showcase-dots {
          position: absolute;
          bottom: 72px;
          left: 0;
          right: 0;
          display: flex;
          justify-content: center;
          gap: 6px;
          pointer-events: none;
        }
        .showcase-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(255,255,255,0.3);
          transition: background 0.2s, transform 0.2s;
        }
        .showcase-dot.active {
          background: #00E676;
          transform: scale(1.3);
        }
      `}</style>

      <div
        className="showcase-wrap"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <video
          ref={videoRef}
          className="showcase-video"
          src={video.src}
          playsInline
          muted
          autoPlay
          preload="auto"
        />
        <div className="showcase-overlay" />
        <div className="showcase-badge">HMU</div>

        {count > 1 && (
          <div className="showcase-dots">
            {SHOWCASE_VIDEOS.map((_, i) => (
              <div key={i} className={`showcase-dot${i === current ? ' active' : ''}`} />
            ))}
          </div>
        )}

        <Link href="/sign-up?type=driver" className="showcase-cta">
          Make My HMU Link
        </Link>
      </div>
    </>
  );
}
