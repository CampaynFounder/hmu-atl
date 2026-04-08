'use client';

import { useEffect, useRef } from 'react';
import { posthog } from '@/components/analytics/posthog-provider';

interface Props {
  slug: string;
  title: string;
  category: string;
  readTime: number;
  tags: string[];
}

/**
 * Tracks blog post engagement: view, scroll depth, CTA clicks, time on page.
 * Mount inside a blog post page — handles its own lifecycle.
 */
export function BlogTracker({ slug, title, category, readTime, tags }: Props) {
  const startTime = useRef(Date.now());
  const maxScroll = useRef(0);
  const scrollMilestones = useRef(new Set<number>());

  useEffect(() => {
    // Track blog post view
    posthog.capture('blog_post_viewed', {
      slug, title, category, readTime, tags,
    });

    // Track scroll depth
    function handleScroll() {
      const scrollPercent = Math.round(
        (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
      );
      if (scrollPercent > maxScroll.current) {
        maxScroll.current = scrollPercent;
      }

      // Fire events at 25%, 50%, 75%, 100% milestones
      for (const milestone of [25, 50, 75, 100]) {
        if (scrollPercent >= milestone && !scrollMilestones.current.has(milestone)) {
          scrollMilestones.current.add(milestone);
          posthog.capture('blog_scroll_depth', {
            slug, milestone, timeOnPage: Math.round((Date.now() - startTime.current) / 1000),
          });
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });

    // Track time on page when leaving
    function handleBeforeUnload() {
      const timeOnPage = Math.round((Date.now() - startTime.current) / 1000);
      posthog.capture('blog_post_exit', {
        slug, timeOnPage, maxScrollPercent: maxScroll.current,
      });
    }

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Track CTA clicks within the blog post
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href*="sign-up"], a[href*="sign-in"]');
      if (link) {
        posthog.capture('blog_cta_clicked', {
          slug, href: (link as HTMLAnchorElement).href,
          text: link.textContent?.trim().slice(0, 50),
        });
      }
    }

    document.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleClick);
    };
  }, [slug, title, category, readTime, tags]);

  return null;
}
