'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Car,
  Navigation,
  Wallet,
  ShieldCheck,
  UserCircle,
  Smartphone,
  ChevronDown,
  Mail,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

/**
 * Branded support hub for HMU Cash Ride. Follows the Uber/Lyft hub-and-spoke
 * model — category cards up top jump to grouped FAQ sections below, with a
 * contact block as the fallback. Visuals match the landing footer / page
 * tokens: #00E676 green, #141414 cards, rgba white borders, Bebas Neue
 * display, Space Mono labels, DM Sans body.
 */

type Category = {
  id: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
};

type FaqGroup = {
  id: string;
  title: string;
  items: { q: string; a: string }[];
};

const categories: Category[] = [
  {
    id: 'riders',
    title: 'For Riders',
    blurb: 'Booking, offers, and getting picked up.',
    icon: Car,
  },
  {
    id: 'drivers',
    title: 'For Drivers',
    blurb: 'Going online, accepting rides, getting paid.',
    icon: Navigation,
  },
  {
    id: 'payments',
    title: 'Payments & Payouts',
    blurb: 'Holds, fees, refunds, and cashing out.',
    icon: Wallet,
  },
  {
    id: 'safety',
    title: 'Safety & Trust',
    blurb: 'Chill Score, verification, and disputes.',
    icon: ShieldCheck,
  },
  {
    id: 'account',
    title: 'Account & Profile',
    blurb: 'Signup, video intro, and your handle.',
    icon: UserCircle,
  },
  {
    id: 'app',
    title: 'Using the App',
    blurb: 'GPS, notifications, and troubleshooting.',
    icon: Smartphone,
  },
];

const faqGroups: FaqGroup[] = [
  {
    id: 'riders',
    title: 'For Riders',
    items: [
      {
        q: 'How do I book a ride?',
        a: 'HMU a driver: drop your pickup and drop-off, name your price, and send the request. Nearby drivers see your offer and one of them locks it in. You’re OTW once a driver accepts.',
      },
      {
        q: 'When am I charged?',
        a: 'Your card is authorized when you book, but the payment is only captured at Start Ride — the moment you’re in the car. If a ride never starts, the hold is released and you’re not charged.',
      },
      {
        q: 'My driver didn’t show. What now?',
        a: 'If a driver no-shows, cancel from the ride screen and your hold is released. Repeat no-shows on a driver hurt their Chill Score, so the platform self-corrects fast.',
      },
      {
        q: 'Can I choose my driver?',
        a: 'You see each driver’s photo, vehicle, ride count, and Chill Score before you accept. Pick the vibe that’s right for you — it’s real people, not a black box.',
      },
    ],
  },
  {
    id: 'drivers',
    title: 'For Drivers',
    items: [
      {
        q: 'How do I start driving?',
        a: 'Create a driver profile, record your video intro, add your vehicle, and connect a Stripe payout account. Once your Stripe account is approved you can accept rides and get paid.',
      },
      {
        q: 'When do I get paid?',
        a: 'You’re paid at Start Ride, not at drop-off. The second your rider gets in the car, the fare is captured and on its way to your payout account — no waiting until the end of the trip.',
      },
      {
        q: 'Why do I need a Stripe account?',
        a: 'Stripe handles identity verification and moves your earnings to your bank, Cash App, Venmo, Zelle, or PayPal. You can browse and receive requests without it, but you must have an approved Stripe account before you can drive.',
      },
      {
        q: 'What is HMU First?',
        a: 'HMU First is the $9.99/mo driver tier that unlocks extra reach and the ability to read rider comments. It’s optional — free drivers still earn on every ride.',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & Payouts',
    items: [
      {
        q: 'What fees does HMU take?',
        a: 'HMU is built to be cheaper than Uber/Lyft for riders and to pay drivers more. Exact fees are shown before you confirm a ride or accept a request — no surprises after the fact.',
      },
      {
        q: 'How do refunds work?',
        a: 'If a ride is canceled before it starts, the authorization is released automatically — usually within a few business days, depending on your bank. Captured fares are covered by our dispute window.',
      },
      {
        q: 'What is the dispute window?',
        a: 'After a ride, there’s a 45-minute window to flag a problem before funds fully release to the driver. Flag a ride from your history and our team reviews the evidence.',
      },
      {
        q: 'How do drivers cash out?',
        a: 'Earnings move through Stripe to your chosen payout rail — bank transfer, Cash App, Venmo, Zelle, or PayPal. Manage your method from your driver settings.',
      },
    ],
  },
  {
    id: 'safety',
    title: 'Safety & Trust',
    items: [
      {
        q: 'What is a Chill Score?',
        a: 'Your Chill Score is your reputation on the platform — built from completed rides, ratings, and dispute history. Everyone’s score is public, so riders and drivers both know who they’re rolling with.',
      },
      {
        q: 'How are users verified?',
        a: 'Every account verifies a phone number at signup and records a video intro that a real admin reviews before the account goes active. Drivers add identity verification through Stripe.',
      },
      {
        q: 'How do I report a safety issue?',
        a: 'For anything that happened on a ride, flag the ride from your history or email support@hmucashride.com. If you are in immediate danger, always call 911 first.',
      },
      {
        q: 'Is my location shared?',
        a: 'Your live GPS is only shared with your matched rider/driver during an active ride, and tracking stops the moment the ride ends. Trail data is deleted after 30 days.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & Profile',
    items: [
      {
        q: 'How do I sign up?',
        a: 'Tap Sign Up, verify your phone, pick rider or driver, and record your video intro. Once an admin approves your intro, you’re active and ready to roll.',
      },
      {
        q: 'Why do I need a video intro?',
        a: 'The video intro is how HMU keeps the community real — it’s a quick clip that a human reviews so riders and drivers know everyone on the platform is a genuine person.',
      },
      {
        q: 'How do I update my profile or photo?',
        a: 'Head to your profile settings to change your handle, photo, or vehicle details. Some changes may trigger a quick re-review to keep the platform trustworthy.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Request deletion from your account settings or email support@hmucashride.com. We close your account and anonymize your data within 90 days, except where the law requires us to keep records.',
      },
    ],
  },
  {
    id: 'app',
    title: 'Using the App',
    items: [
      {
        q: 'The app can’t find my location.',
        a: 'HMU needs location access to match you and to share live ride tracking. Enable location for HMU in your device settings, then refresh the ride screen.',
      },
      {
        q: 'I’m not getting notifications.',
        a: 'Turn on notifications for HMU in your device settings so you don’t miss a ride request or status update. If they’re already on, fully close and reopen the app.',
      },
      {
        q: 'The map or ride screen won’t load.',
        a: 'Check your connection, then reload the page. HMU is a web app, so a hard refresh clears most glitches. Still stuck? Email support@hmucashride.com with your device and browser.',
      },
      {
        q: 'Do I need to install anything?',
        a: 'No. HMU runs right in your mobile browser. For a more app-like feel, add it to your home screen — Share → Add to Home Screen on iOS, or the install prompt on Android.',
      },
    ],
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[rgba(255,255,255,0.08)] rounded-xl bg-[#141414] overflow-hidden transition-colors hover:border-[rgba(0,230,118,0.35)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
      >
        <span className="text-[15px] font-medium text-white">{q}</span>
        <ChevronDown
          className={`w-5 h-5 shrink-0 text-[#00E676] transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-sm leading-relaxed text-[#aaa]">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function SupportContent() {
  return (
    <main className="min-h-screen bg-[#080808] text-gray-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        {/* Header */}
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-[#00E676] transition-colors mb-10 inline-block"
        >
          ← Back to home
        </Link>

        <header className="mb-14">
          <p
            className="text-[11px] uppercase tracking-[0.25em] text-[#00E676] mb-3"
            style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}
          >
            Support Center
          </p>
          <h1
            className="text-5xl sm:text-6xl text-white leading-none mb-4"
            style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}
          >
            How can we HMU?
          </h1>
          <p className="text-[#999] text-base sm:text-lg max-w-2xl leading-relaxed">
            Real answers for real people. Find your topic below, or reach a human
            at{' '}
            <a
              href="mailto:support@hmucashride.com"
              className="text-[#00E676] hover:underline"
            >
              support@hmucashride.com
            </a>
            .
          </p>
        </header>

        {/* Category cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-20">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <a
                key={cat.id}
                href={`#${cat.id}`}
                className="group flex flex-col gap-3 p-5 rounded-2xl bg-[#141414] border border-[rgba(255,255,255,0.08)] transition-all duration-200 hover:border-[rgba(0,230,118,0.4)] hover:-translate-y-0.5"
              >
                <span className="w-11 h-11 rounded-xl bg-[rgba(0,230,118,0.12)] flex items-center justify-center text-[#00E676] group-hover:bg-[#00E676] group-hover:text-black transition-colors">
                  <Icon className="w-5 h-5" />
                </span>
                <span className="text-lg text-white font-semibold">{cat.title}</span>
                <span className="text-sm text-[#888] leading-relaxed">{cat.blurb}</span>
              </a>
            );
          })}
        </section>

        {/* FAQ groups */}
        <div className="space-y-16">
          {faqGroups.map((group) => (
            <section key={group.id} id={group.id} className="scroll-mt-24">
              <h2
                className="text-3xl text-white mb-6"
                style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}
              >
                {group.title}
              </h2>
              <div className="space-y-3">
                {group.items.map((item) => (
                  <FaqItem key={item.q} q={item.q} a={item.a} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Contact / still need help */}
        <section className="mt-20 rounded-2xl bg-[#0f0f0f] border border-[rgba(255,255,255,0.08)] p-8 sm:p-10">
          <h2
            className="text-3xl text-white mb-3"
            style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}
          >
            Still need a hand?
          </h2>
          <p className="text-[#999] text-sm sm:text-base leading-relaxed max-w-2xl mb-6">
            Can’t find your answer? Our team is Atlanta-based and answers every
            message. We aim to reply within one business day.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="mailto:support@hmucashride.com"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#00E676] text-black font-semibold hover:bg-[#00c766] transition-colors"
            >
              <Mail className="w-4 h-4" />
              Email Support
            </a>
            <Link
              href="/safety"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#141414] text-white font-medium border border-[rgba(255,255,255,0.1)] hover:border-[rgba(0,230,118,0.4)] transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-[#00E676]" />
              Safety Resources
            </Link>
          </div>

          <div className="mt-8 flex items-start gap-3 rounded-xl bg-[rgba(255,68,68,0.08)] border border-[rgba(255,68,68,0.25)] p-4">
            <AlertTriangle className="w-5 h-5 shrink-0 text-[#ff6b6b] mt-0.5" />
            <p className="text-sm text-[#ddcaca] leading-relaxed">
              <span className="text-white font-semibold">In an emergency, call 911.</span>{' '}
              HMU support is not an emergency service. For urgent safety issues during a
              ride, contact local authorities first, then report it to us.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
