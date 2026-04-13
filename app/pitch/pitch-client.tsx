'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './pitch.module.css';

type Chapter = {
  id: string;
  kicker: string;
  title: string;
  hook: string;
  steps: string[];
  src: string;
  poster?: string;
};

const CHAPTERS: Chapter[] = [
  {
    id: 'hero',
    kicker: 'The Full Journey',
    title: 'Link To Curb',
    hook: 'Driver shares a link. Rider books, pays, rides. Every step.',
    steps: [
      'D · Sign Up',
      'D · Share HMU Link',
      'R · Book Chat Ride',
      'R · Sign Up',
      'R · Add Ride Details',
      'R · Request Ride',
      'D · Accept Ride',
      'R · Confirm Location',
      'D · OTW',
      'D · Here',
      'R · In Car',
      'R · Add Ons',
      'D · End Ride',
    ],
    src: '/pitch/00-hero-full-journey.mp4',
    poster: '/pitch/00-hero-poster.jpg',
  },
  {
    id: 'chapter-1',
    kicker: 'Chapter 01',
    title: 'Driver Goes Live',
    hook: 'Any local with a car becomes a driver in 60 seconds.',
    steps: ['D · Sign Up', 'D · Share HMU Link'],
    src: '/pitch/01-driver-goes-live.mp4',
    poster: '/pitch/01-driver-goes-live-poster.jpg',
  },
  {
    id: 'chapter-2',
    kicker: 'Chapter 02',
    title: 'Booked From A Link',
    hook: 'No app store. Tap a link — you\u2019re booked.',
    steps: ['R · Book Chat Ride', 'R · Sign Up', 'R · Add Ride Details', 'R · Request Ride'],
    src: '/pitch/02-booked-from-link.mp4',
    poster: '/pitch/02-booked-from-link-poster.jpg',
  },
  {
    id: 'chapter-3',
    kicker: 'Chapter 03',
    title: 'Match & Pullup',
    hook: 'Match to curb in minutes. Real-time, geo-verified.',
    steps: ['D · Accept', 'R · Confirm Location', 'D · OTW', 'D · Here'],
    src: '/pitch/03-match-and-pullup.mp4',
    poster: '/pitch/03-match-and-pullup-poster.jpg',
  },
  {
    id: 'chapter-4',
    kicker: 'Chapter 04',
    title: 'Ride. Upsell. Complete.',
    hook: 'Every ride is a storefront. Add-ons turn trips into revenue.',
    steps: ['R · In Car', 'R · Add Ons', 'D · End Ride'],
    src: '/pitch/04-ride-upsell-complete.mp4',
    poster: '/pitch/04-ride-upsell-complete-poster.jpg',
  },
];

export default function PitchClient() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [videoReady, setVideoReady] = useState<Record<string, boolean>>({});
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  const markReady = (id: string) =>
    setVideoReady((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  const markMissing = (id: string) =>
    setVideoReady((prev) => (prev[id] === false ? prev : { ...prev, [id]: false }));

  const scrollToIndex = useCallback((i: number) => {
    const el = slideRefs.current[i];
    if (el && trackRef.current) {
      trackRef.current.scrollTo({ left: el.offsetLeft, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number((entry.target as HTMLElement).dataset.index);
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            setActiveIndex(idx);
          }
        });
      },
      { root: track, threshold: [0.6, 0.9] }
    );
    slideRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === activeIndex) {
        v.play().catch(() => {});
      } else {
        v.pause();
        v.currentTime = 0;
      }
    });
  }, [activeIndex]);

  return (
    <div className={styles.container}>
      <div className={styles.noiseBg} aria-hidden />

      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="HMU Cash Ride home">
          <span className={styles.brandMark}>HMU</span>
          <span className={styles.brandDot} />
          <span className={styles.brandName}>CASH&nbsp;RIDE</span>
        </Link>
        <span className={styles.topbarBadge}>INVESTOR&nbsp;PREVIEW</span>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          <span className={styles.heroDot} />
          ATL · 2026 · LIVE DEMO
        </div>
        <h1 className={styles.heroHeadline}>
          The Happy Path,
          <br />
          <span className={styles.heroAccent}>Frame By Frame.</span>
        </h1>
        <p className={styles.heroSub}>
          Swipe through the full HMU Cash Ride flow. One hero cut. Four chapters.
          Thirteen steps from a shared link to a paid curb pickup.
        </p>
        <div className={styles.heroMeta}>
          <span>{CHAPTERS.length} clips</span>
          <span className={styles.metaDivider} />
          <span>9:16 vertical</span>
          <span className={styles.metaDivider} />
          <span>Autoplay · muted</span>
        </div>
      </section>

      <div className={styles.carouselWrap}>
        <div
          className={styles.track}
          ref={trackRef}
          role="region"
          aria-label="Pitch video carousel"
        >
          {CHAPTERS.map((chapter, i) => (
            <article
              key={chapter.id}
              className={styles.slide}
              data-index={i}
              data-active={i === activeIndex}
              ref={(el) => {
                slideRefs.current[i] = el;
              }}
            >
              <div className={styles.slideHeader}>
                <span className={styles.kicker}>{chapter.kicker}</span>
                <h2 className={styles.slideTitle}>{chapter.title}</h2>
                <p className={styles.slideHook}>{chapter.hook}</p>
              </div>

              <div className={styles.frame}>
                <div className={styles.phoneBezel} data-ready={videoReady[chapter.id] ? 'true' : 'false'}>
                  <video
                    ref={(el) => {
                      videoRefs.current[i] = el;
                    }}
                    className={styles.video}
                    src={chapter.src}
                    poster={chapter.poster}
                    muted
                    playsInline
                    loop
                    preload="metadata"
                    onLoadedData={() => markReady(chapter.id)}
                    onError={() => markMissing(chapter.id)}
                  />
                  <div className={styles.framePlaceholder} aria-hidden>
                    <span className={styles.frameLabel}>DROP VIDEO</span>
                    <code className={styles.frameCode}>{chapter.src}</code>
                    <span className={styles.frameHint}>9:16 · MP4 · H.264</span>
                  </div>
                  <div className={styles.frameNotch} aria-hidden />
                </div>
              </div>

              <ul className={styles.steps}>
                {chapter.steps.map((s) => (
                  <li key={s} className={styles.step}>
                    {s}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <nav className={styles.dots} aria-label="Carousel navigation">
          {CHAPTERS.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={styles.dot}
              data-active={i === activeIndex}
              onClick={() => scrollToIndex(i)}
              aria-label={`Go to ${c.title}`}
            >
              <span className={styles.dotIndex}>{String(i).padStart(2, '0')}</span>
              <span className={styles.dotTitle}>{c.title}</span>
            </button>
          ))}
        </nav>
      </div>

      <section className={styles.footer}>
        <div className={styles.footerLine} />
        <p className={styles.footerLead}>Make Bank Trips not Blank Trips.</p>
        <p className={styles.footerSub}>HMU Cash Ride · Atlanta · 2026</p>
        <div className={styles.footerLinks}>
          <Link href="/driver">Drivers</Link>
          <span>·</span>
          <Link href="/rider">Riders</Link>
          <span>·</span>
          <Link href="/">Home</Link>
        </div>
      </section>
    </div>
  );
}
