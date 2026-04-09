'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// Add new videos here — order matters (first = shown first)
const SHOWCASE_VIDEOS = [
  { src: '/videos/sample-hmu-1.mp4', label: 'See how HMU works' },
  // { src: '/videos/sample-hmu-2.mp4', label: 'Your HMU link page' },
  // { src: '/videos/sample-hmu-3.mp4', label: 'Getting paid' },
];

export default function ShowcaseCarousel() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef(0);

  const count = SHOWCASE_VIDEOS.length;
  const video = SHOWCASE_VIDEOS[current];

  const goTo = useCallback((idx: number) => {
    setCurrent(((idx % count) + count) % count);
    setPaused(false);
  }, [count]);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);

  // Auto-advance when a video ends
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    el.load();
    el.play().catch(() => {});

    const onEnded = () => {
      if (count > 1) next();
    };
    el.addEventListener('ended', onEnded);
    return () => el.removeEventListener('ended', onEnded);
  }, [current, count, next]);

  // Swipe handling
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

  // Tap to pause/play
  const togglePause = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) { el.play(); setPaused(false); }
    else { el.pause(); setPaused(true); }
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
          background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 30%);
        }
        .showcase-label {
          position: absolute;
          bottom: 44px;
          left: 16px;
          right: 16px;
          font-family: var(--font-display, 'Bebas Neue', sans-serif);
          font-size: 20px;
          color: #fff;
          line-height: 1.1;
          pointer-events: none;
        }
        .showcase-dots {
          position: absolute;
          bottom: 16px;
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
        .showcase-pause {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 40px;
          color: rgba(255,255,255,0.7);
          pointer-events: none;
          animation: showcaseFadeIn 0.2s ease;
        }
        @keyframes showcaseFadeIn {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>

      <div
        className="showcase-wrap"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={togglePause}
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
        <div className="showcase-label">{video.label}</div>

        {count > 1 && (
          <div className="showcase-dots">
            {SHOWCASE_VIDEOS.map((_, i) => (
              <div key={i} className={`showcase-dot${i === current ? ' active' : ''}`} />
            ))}
          </div>
        )}

        {paused && <div className="showcase-pause">||</div>}
      </div>
    </>
  );
}
