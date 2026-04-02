'use client';

import Link from 'next/link';
import { CONTENT_CALENDAR } from '@/lib/content/framework';

const badgeColors: Record<string, string> = {
  red: 'bg-red-500/10 text-red-400 border-red-500/20',
  green: 'bg-green-500/10 text-green-400 border-green-500/20',
  gold: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

export default function ContentCalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content Engine</h1>
        <p className="text-sm text-neutral-400 mt-1">7-day content rotation</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link href="/admin/content" className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white hover:bg-white/5">Prompt Builder</Link>
        <Link href="/admin/content/trends" className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white hover:bg-white/5">Trend Hijack</Link>
        <Link href="/admin/content/calendar" className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 text-white">Calendar</Link>
        <Link href="/admin/content/reference" className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white hover:bg-white/5">Reference</Link>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <p className="text-xs text-neutral-400 mb-4">
          Post 1x daily minimum. Each day targets a different emotional angle and audience segment.
          Click a day to pre-fill the Prompt Builder with that day&apos;s recommended settings.
        </p>

        {/* Weekly grid header */}
        <div className="grid grid-cols-7 gap-1 mb-3">
          {CONTENT_CALENDAR.map((day) => (
            <div key={day.day} className="text-center">
              <span className="text-[10px] font-bold text-neutral-500">{day.day.slice(0, 3).toUpperCase()}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 mb-6">
          {CONTENT_CALENDAR.map((day) => (
            <Link
              key={day.day}
              href={calendarLink(day)}
              className={`text-center p-2 rounded-lg border text-[10px] font-medium transition-colors hover:opacity-80 ${badgeColors[day.badge] || badgeColors.green}`}
            >
              {day.theme.split('—')[0].trim()}
            </Link>
          ))}
        </div>
      </div>

      {/* Day details */}
      <div className="space-y-3">
        {CONTENT_CALENDAR.map((day) => (
          <Link
            key={day.day}
            href={calendarLink(day)}
            className="block bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${badgeColors[day.badge] || badgeColors.green}`}>
                {day.day}
              </span>
              <span className="text-sm font-semibold text-white">{day.theme}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div>
                <span className="text-neutral-500">Segment:</span>{' '}
                <span className="text-neutral-300">{day.segment}</span>
              </div>
              <div>
                <span className="text-neutral-500">Hook:</span>{' '}
                <span className="text-neutral-300">{day.hook}</span>
              </div>
              <div>
                <span className="text-neutral-500">Tempo:</span>{' '}
                <span className="text-neutral-300">{day.tempo}</span>
              </div>
              <div>
                <span className="text-neutral-500">Goal:</span>{' '}
                <span className="text-neutral-300">{day.goal}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-neutral-500">Content:</span>{' '}
                <span className="text-neutral-300">{day.content}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-neutral-500">CTA:</span>{' '}
                <span className="text-green-400">{day.cta}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Content Mix */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Weekly Content Mix</h3>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 font-bold">3x</span>
            <span className="text-neutral-300">Pain-to-Solution — &quot;Uber takes 40%, we take 10%&quot; stories</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 font-bold">2x</span>
            <span className="text-neutral-300">Social Proof — Driver earnings screenshots, rider testimonials</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold">1x</span>
            <span className="text-neutral-300">How It Works — 30s demo of the HMU → BET → PAID flow</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold">1x</span>
            <span className="text-neutral-300">Community/Culture — Atlanta-specific, local pride, driver spotlight</span>
          </div>
        </div>
      </div>

      {/* FB Group Seeding */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">FB Group Seeding Strategy</h3>
        <div className="space-y-2 text-xs text-neutral-400">
          <p><strong className="text-neutral-300">Don&apos;t post ads in groups.</strong> Post value, then let curiosity drive traffic.</p>
          <div className="space-y-1.5 mt-2">
            <div className="flex gap-2"><span className="text-green-400 font-bold">1.</span> Post the video as a native FB Reel (not a link)</div>
            <div className="flex gap-2"><span className="text-green-400 font-bold">2.</span> Add a comment: &quot;Been using this for 3 weeks. DM me if you want the link.&quot;</div>
            <div className="flex gap-2"><span className="text-green-400 font-bold">3.</span> Reply to every comment within 30 min (engagement signal)</div>
            <div className="flex gap-2"><span className="text-green-400 font-bold">4.</span> When people DM, send the sign-up link</div>
          </div>
          <p className="mt-3">
            <strong className="text-neutral-300">Groups:</strong> Uber/Lyft Drivers Atlanta, Atlanta Rideshare, Side Hustle ATL, Atlanta Gig Workers, Independent Drivers Georgia, Cash Rides ATL
          </p>
        </div>
      </div>
    </div>
  );
}

function calendarLink(day: CalendarDay): string {
  // Map calendar day to prompt builder with pre-filled params
  const hookMap: Record<string, string> = {
    Monday: 'receipt',
    Tuesday: 'callout',
    Wednesday: 'testimony',
    Thursday: 'deactivation',
    Friday: 'controversy',
    Saturday: 'callout',
    Sunday: 'comparison',
  };
  const tempoMap: Record<string, number> = {
    Monday: 128,
    Tuesday: 100,
    Wednesday: 100,
    Thursday: 70,
    Friday: 128,
    Saturday: 100,
    Sunday: 128,
  };
  const segmentMap: Record<string, string> = {
    Monday: 'frustrated',
    Tuesday: 'frustrated',
    Wednesday: 'independent',
    Thursday: 'frustrated',
    Friday: 'frustrated',
    Saturday: 'errand',
    Sunday: 'frustrated',
  };

  const params = new URLSearchParams({
    hook: hookMap[day.day] || 'receipt',
    tempo: String(tempoMap[day.day] || 128),
    segment: segmentMap[day.day] || 'frustrated',
    from: 'calendar',
  });

  return `/admin/content?${params.toString()}`;
}

type CalendarDay = {
  day: string;
  badge: string;
  theme: string;
  segment: string;
  hook: string;
  tempo: string;
  content: string;
  cta: string;
  goal: string;
};
