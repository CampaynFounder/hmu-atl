'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './pitch.module.css';

/* ─── Types ─── */

type Chapter = {
  id: string;
  kicker: string;
  title: string;
  hook: string;
  steps: string[];
  videoSrc: string | null;
  poster?: string;
};

type SectionId = 'driver' | 'rider' | 'platform';

type Section = {
  id: SectionId;
  label: string;
  tagline: string;
  chapters: Chapter[];
};

/* ─── Data ─── */

const HERO_CHAPTER: Chapter = {
  id: 'hero',
  kicker: 'The Full Journey',
  title: 'Link To Curb',
  hook: 'Driver shares a link. Rider books, pays, rides. Every step.',
  steps: [
    'D \u00b7 Sign Up',
    'D \u00b7 Share HMU Link',
    'R \u00b7 Book Chat Ride',
    'R \u00b7 Sign Up',
    'R \u00b7 Add Ride Details',
    'R \u00b7 Request Ride',
    'D \u00b7 Accept Ride',
    'R \u00b7 Confirm Location',
    'D \u00b7 OTW',
    'D \u00b7 Here',
    'R \u00b7 In Car',
    'R \u00b7 Add Ons',
    'D \u00b7 End Ride',
  ],
  videoSrc: '/pitch/00-hero-full-journey.mp4',
  poster: '/pitch/00-hero-poster.jpg',
};

const SECTIONS: Section[] = [
  {
    id: 'driver',
    label: 'Driver',
    tagline: 'Any local with a car becomes a driver in 60 seconds.',
    chapters: [
      {
        id: 'driver-onboarding',
        kicker: 'Onboarding',
        title: 'Sign Up & Set Up',
        hook: 'Profile, vehicle photo, video intro \u2014 live in under a minute.',
        steps: ['D \u00b7 Sign Up', 'D \u00b7 Add Vehicle', 'D \u00b7 Record Intro', 'D \u00b7 Go Live'],
        videoSrc: null,
      },
      {
        id: 'driver-go-live',
        kicker: 'Go Live',
        title: 'Go Live & Share Link',
        hook: 'Post availability, share your HMU link anywhere.',
        steps: ['D \u00b7 Set Areas', 'D \u00b7 Set Prices', 'D \u00b7 Share Link'],
        videoSrc: null,
      },
      {
        id: 'driver-accept-pullup',
        kicker: 'Accept & Pullup',
        title: 'Match & Pull Up',
        hook: 'Accept a ride request, go OTW, arrive at pickup.',
        steps: ['D \u00b7 Accept', 'D \u00b7 OTW', 'D \u00b7 Here'],
        videoSrc: null,
      },
      {
        id: 'driver-cash-ride',
        kicker: 'Cash Ride',
        title: 'Pullup. Ride. Drop Off.',
        hook: 'OTW to curb. Ride active. End ride. Driver gets paid.',
        steps: ['D \u00b7 OTW', 'D \u00b7 Here', 'R \u00b7 In Car', 'D \u00b7 End Ride', 'D \u00b7 Get Paid'],
        videoSrc: '/pitch/ride-flow.mp4',
      },
      {
        id: 'driver-menu-addons',
        kicker: 'Menu & Add-Ons',
        title: 'Every Ride Is A Storefront',
        hook: 'Add menu items. Riders browse and add to their ride mid-trip.',
        steps: ['D \u00b7 Add Items', 'D \u00b7 Set Prices', 'R \u00b7 Browse Menu', 'R \u00b7 Add To Ride'],
        videoSrc: null,
      },
      {
        id: 'driver-earnings',
        kicker: 'Earnings',
        title: 'Earnings & Cashout',
        hook: 'Progressive fees, daily cap, instant or batch payout.',
        steps: ['D \u00b7 View Earnings', 'D \u00b7 Daily Cap', 'D \u00b7 Cash Out'],
        videoSrc: null,
      },
      {
        id: 'driver-safety',
        kicker: 'Safety',
        title: 'Driver Safety',
        hook: 'Rider verification, no-show protection, WEIRDO flags.',
        steps: ['Rider Verified', 'No-Show Fee', 'WEIRDO Flag', 'Admin Review'],
        videoSrc: null,
      },
      {
        id: 'driver-support',
        kicker: 'Support',
        title: 'Driver Support',
        hook: 'In-app help, dispute filing, direct admin contact.',
        steps: ['D \u00b7 Get Help', 'D \u00b7 File Dispute', 'D \u00b7 Contact Admin'],
        videoSrc: null,
      },
    ],
  },
  {
    id: 'rider',
    label: 'Rider',
    tagline: 'No app store. Tap a link \u2014 you\u2019re booked.',
    chapters: [
      {
        id: 'rider-booked-from-link',
        kicker: 'Book From A Link',
        title: 'Booked From A Link',
        hook: 'Tap a shared link, sign up, add details, request a ride.',
        steps: ['R \u00b7 Tap Link', 'R \u00b7 Sign Up', 'R \u00b7 Add Details', 'R \u00b7 Request Ride', 'D \u00b7 Match'],
        videoSrc: null,
      },
      {
        id: 'rider-onboarding',
        kicker: 'Onboarding',
        title: 'Rider Onboarding',
        hook: 'Sign up organically, browse local drivers, book your first ride.',
        steps: ['R \u00b7 Sign Up', 'R \u00b7 Browse Drivers', 'R \u00b7 Book Ride'],
        videoSrc: null,
      },
      {
        id: 'rider-in-ride',
        kicker: 'In-Ride',
        title: 'In-Ride Experience',
        hook: 'Track your driver, browse add-ons mid-trip, pay seamlessly.',
        steps: ['R \u00b7 Track Driver', 'R \u00b7 In Car', 'R \u00b7 Browse Add-Ons', 'R \u00b7 Pay'],
        videoSrc: null,
      },
      {
        id: 'rider-earnings',
        kicker: 'Earnings',
        title: 'Earnings & Cashout',
        hook: 'OG status perks, saved payment methods, ride history.',
        steps: ['R \u00b7 OG Status', 'R \u00b7 Saved Cards', 'R \u00b7 Ride History'],
        videoSrc: null,
      },
      {
        id: 'rider-safety',
        kicker: 'Safety',
        title: 'Rider Safety',
        hook: 'Driver verification visible, geo-verified rides, disputes.',
        steps: ['Driver Verified', 'Geo-Verified', 'Dispute Window', 'Admin Review'],
        videoSrc: null,
      },
      {
        id: 'rider-support',
        kicker: 'Support',
        title: 'Rider Support',
        hook: 'Help center, dispute flow, refunds, direct contact.',
        steps: ['R \u00b7 Get Help', 'R \u00b7 File Dispute', 'R \u00b7 Request Refund'],
        videoSrc: null,
      },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    tagline: 'The engine behind every ride, payout, and trust signal.',
    chapters: [
      {
        id: 'platform-viral-loop',
        kicker: 'Growth',
        title: 'The Viral Loop',
        hook: 'Link \u2192 Book \u2192 Drive \u2192 Share \u2192 Repeat. Organic growth built in.',
        steps: ['Share Link', 'Rider Books', 'Rider Drives', 'Shares Their Link'],
        videoSrc: null,
      },
      {
        id: 'platform-trust',
        kicker: 'Trust',
        title: 'Trust & Verification',
        hook: 'Phone OTP, video review, vehicle check, Stripe identity.',
        steps: ['Phone OTP', 'Video Intro', 'Vehicle Photo', 'Stripe Verify'],
        videoSrc: null,
      },
      {
        id: 'platform-community',
        kicker: 'Community',
        title: 'Community & Reputation',
        hook: 'Chill Score, OG Status, ratings with sentiment analysis.',
        steps: ['Chill Score', 'OG Status', 'Ratings', 'Sentiment AI'],
        videoSrc: null,
      },
      {
        id: 'platform-admin-ops',
        kicker: 'Admin',
        title: 'Admin Ops',
        hook: 'Live dashboard, dispute queue, user management, video review.',
        steps: ['Live Map', 'Disputes', 'Users', 'Video Queue'],
        videoSrc: null,
      },
      {
        id: 'platform-pricing',
        kicker: 'Pricing',
        title: 'Market & Pricing',
        hook: 'Progressive fees, daily and weekly caps, price modes.',
        steps: ['Progressive Fee', 'Daily Cap', 'Weekly Cap', '3 Price Modes'],
        videoSrc: null,
      },
      {
        id: 'platform-hmu-first',
        kicker: 'HMU First',
        title: 'HMU First',
        hook: '$9.99/mo. Instant payout, priority placement, lower caps.',
        steps: ['$9.99/mo', 'Instant Payout', 'Priority', 'Lower Caps'],
        videoSrc: null,
      },
    ],
  },
];

const SECTION_IDS: SectionId[] = ['driver', 'rider', 'platform'];

/* ─── SectionCarousel ─── */

function SectionCarousel({
  section,
  isActiveSection,
  videoUrls,
}: {
  section: Section;
  isActiveSection: boolean;
  videoUrls: Record<string, string>;
}) {
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

  // Expose scrollToIndex for hash routing
  const scrollToChapter = useCallback(
    (chapterId: string) => {
      const idx = section.chapters.findIndex((c) => c.id === chapterId);
      if (idx >= 0) {
        // Small delay to ensure DOM is ready after vertical scroll
        setTimeout(() => scrollToIndex(idx), 300);
      }
    },
    [section.chapters, scrollToIndex],
  );

  // Store scrollToChapter on the section DOM element for parent access
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = sectionRef.current;
    if (el) {
      (el as HTMLElement & { scrollToChapter?: (id: string) => void }).scrollToChapter =
        scrollToChapter;
    }
  }, [scrollToChapter]);

  // Horizontal IntersectionObserver scoped to this track
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
      { root: track, threshold: [0.6, 0.9] },
    );
    slideRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  // Video autoplay — only when this section is active
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (isActiveSection && i === activeIndex) {
        v.play().catch(() => {});
      } else {
        v.pause();
        v.currentTime = 0;
      }
    });
  }, [activeIndex, isActiveSection]);

  // Update hash when active chapter changes
  useEffect(() => {
    if (isActiveSection && section.chapters[activeIndex]) {
      const chapterId = section.chapters[activeIndex].id;
      history.replaceState(null, '', `#${chapterId}`);
    }
  }, [activeIndex, isActiveSection, section.chapters]);

  return (
    <section className={styles.section} id={section.id} ref={sectionRef}>
      {/* Section header */}
      <div className={styles.sectionHeader}>
        <div className={styles.sectionDivider} />
        <h2 className={styles.sectionLabel}>{section.label}</h2>
        <p className={styles.sectionTagline}>{section.tagline}</p>
      </div>

      {/* Carousel */}
      <div className={styles.carouselWrap}>
        <div
          className={styles.track}
          ref={trackRef}
          role="region"
          aria-label={`${section.label} video carousel`}
        >
          {section.chapters.map((chapter, i) => {
            // Resolve video: R2 URL from API > hardcoded videoSrc > null
            const resolvedSrc = videoUrls[chapter.id] || chapter.videoSrc;

            return (
            <article
              key={chapter.id}
              id={chapter.id}
              className={styles.slide}
              data-index={i}
              data-active={i === activeIndex}
              ref={(el) => {
                slideRefs.current[i] = el;
              }}
            >
              <div className={styles.slideHeader}>
                <span className={styles.kicker}>{chapter.kicker}</span>
                <h3 className={styles.slideTitle}>{chapter.title}</h3>
                <p className={styles.slideHook}>{chapter.hook}</p>
              </div>

              <div className={styles.frame}>
                <div
                  className={styles.phoneBezel}
                  data-ready={videoReady[chapter.id] ? 'true' : 'false'}
                >
                  {resolvedSrc ? (
                    <>
                      <video
                        ref={(el) => {
                          videoRefs.current[i] = el;
                        }}
                        className={styles.video}
                        src={resolvedSrc}
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
                        <code className={styles.frameCode}>{resolvedSrc}</code>
                        <span className={styles.frameHint}>9:16 &middot; MP4 &middot; H.264</span>
                      </div>
                    </>
                  ) : (
                    <div className={styles.comingSoonPlaceholder} aria-hidden>
                      <span className={styles.comingSoonLabel}>COMING SOON</span>
                      <span className={styles.comingSoonTitle}>{chapter.title}</span>
                      <span className={styles.comingSoonHint}>
                        9:16 &middot; Video In Production
                      </span>
                    </div>
                  )}
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
            );
          })}
        </div>

        {/* Dot nav */}
        <nav className={styles.dots} aria-label={`${section.label} chapter navigation`}>
          {section.chapters.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={styles.dot}
              data-active={i === activeIndex}
              onClick={() => scrollToIndex(i)}
              aria-label={`Go to ${c.title}`}
            >
              <span className={styles.dotIndex}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className={styles.dotTitle}>{c.title}</span>
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}

/* ─── PitchClient ─── */

export default function PitchClient() {
  const [activeSectionId, setActiveSectionId] = useState<SectionId>('driver');
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    driver: null,
    rider: null,
    platform: null,
  });

  // Fetch available pitch videos from R2
  useEffect(() => {
    fetch('/api/pitch-videos')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, string>) => setVideoUrls(data))
      .catch(() => {});
  }, []);

  // Vertical IntersectionObserver — which section is in viewport
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.2) {
            const id = (entry.target as HTMLElement).id as SectionId;
            if (SECTION_IDS.includes(id)) {
              setActiveSectionId(id);
            }
          }
        });
      },
      { threshold: [0.2, 0.5] },
    );

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        sectionRefs.current[id] = el;
        io.observe(el);
      }
    });

    return () => io.disconnect();
  }, []);

  // Hash routing on mount
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;

    // Check if it's a section id
    if (SECTION_IDS.includes(hash as SectionId)) {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    // Check if it's a chapter id — find its parent section
    for (const section of SECTIONS) {
      const chapterIdx = section.chapters.findIndex((c) => c.id === hash);
      if (chapterIdx >= 0) {
        const sectionEl = document.getElementById(section.id);
        if (sectionEl) {
          sectionEl.scrollIntoView({ behavior: 'smooth' });
          // Scroll to the specific chapter within the carousel
          const typed = sectionEl as HTMLElement & {
            scrollToChapter?: (id: string) => void;
          };
          if (typed.scrollToChapter) {
            typed.scrollToChapter(hash);
          } else {
            setTimeout(() => {
              const retried = document.getElementById(section.id) as HTMLElement & {
                scrollToChapter?: (id: string) => void;
              };
              retried?.scrollToChapter?.(hash);
            }, 500);
          }
        }
        return;
      }
    }
  }, []);

  const scrollToSection = useCallback((id: SectionId) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const totalChapters = SECTIONS.reduce((sum, s) => sum + s.chapters.length, 0);

  return (
    <div className={styles.container}>
      <div className={styles.noiseBg} aria-hidden />

      {/* ─── Top bar ─── */}
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="HMU Cash Ride home">
          <span className={styles.brandMark}>HMU</span>
          <span className={styles.brandDot} />
          <span className={styles.brandName}>CASH&nbsp;RIDE</span>
        </Link>
        <span className={styles.topbarBadge}>INVESTOR&nbsp;PREVIEW</span>
      </header>

      {/* ─── Hero ─── */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          <span className={styles.heroDot} />
          ATL &middot; 2026 &middot; LIVE DEMO
        </div>
        <h1 className={styles.heroHeadline}>
          The Happy Path,
          <br />
          <span className={styles.heroAccent}>Frame By Frame.</span>
        </h1>
        <p className={styles.heroSub}>
          Explore every HMU Cash Ride flow. {totalChapters} chapters across three
          sections &mdash; Driver, Rider, and Platform. Swipe through the full story
          from shared link to paid curb pickup.
        </p>
        <div className={styles.heroMeta}>
          <span>{totalChapters} chapters</span>
          <span className={styles.metaDivider} />
          <span>3 sections</span>
          <span className={styles.metaDivider} />
          <span>9:16 vertical</span>
        </div>
      </section>

      {/* ─── Sticky section nav ─── */}
      <nav className={styles.stickyNav} aria-label="Section navigation">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={styles.stickyNavPill}
            data-active={activeSectionId === s.id}
            onClick={() => scrollToSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* ─── Sections ─── */}
      {SECTIONS.map((section) => (
        <SectionCarousel
          key={section.id}
          section={section}
          isActiveSection={activeSectionId === section.id}
          videoUrls={videoUrls}
        />
      ))}

      {/* ─── Footer ─── */}
      <section className={styles.footer}>
        <div className={styles.footerLine} />
        <p className={styles.footerLead}>Make Bank Trips not Blank Trips.</p>
        <p className={styles.footerSub}>HMU Cash Ride &middot; Atlanta &middot; 2026</p>
        <div className={styles.footerLinks}>
          <Link href="/driver">Drivers</Link>
          <span>&middot;</span>
          <Link href="/rider">Riders</Link>
          <span>&middot;</span>
          <Link href="/">Home</Link>
        </div>
      </section>
    </div>
  );
}
