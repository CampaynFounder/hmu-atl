// /admin/blast-config/guide — plain-language explainer for the blast booking
// config knobs. RBAC inherits from /admin/blast-config via longest-match.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function BlastConfigGuidePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  const rows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!rows.length || !(rows[0] as { is_admin: boolean }).is_admin) redirect('/');

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <Link
          href="/admin/blast-config"
          className="text-xs text-neutral-500 hover:text-white"
        >
          ← Back to config
        </Link>
        <h1 className="text-2xl font-bold mt-2">How blast booking works</h1>
        <p className="text-sm text-neutral-400 mt-2">
          Plain-language reference for what every knob in <code className="bg-neutral-800 px-1 rounded">/admin/blast-config</code> actually does.
        </p>
      </header>

      <Toc />

      <Section id="what-is-blast" title="What is a blast?">
        <p>
          A <strong>blast</strong> is the rider-side action where they say
          &ldquo;here&rsquo;s where I want to go and what I&rsquo;ll pay&rdquo;
          and the system fans that request out to a ranked list of matching
          drivers in parallel. Drivers receive it like any other ride
          request and can express interest (HMU) or pass. The rider then
          sees the offers come in on a live board and picks one.
        </p>
        <p>
          Lives at <code className="bg-neutral-800 px-1 rounded">/rider/browse/blast</code>. Drivers see blasts in their existing
          ride-request inbox &mdash; there&rsquo;s no separate &ldquo;blast inbox&rdquo;
          on their side.
        </p>
      </Section>

      <Section id="vs-browse" title="How is this different from /rider/browse?">
        <p>
          <code className="bg-neutral-800 px-1 rounded">/rider/browse</code> is <strong>passive</strong> &mdash; the rider scrolls a grid of drivers,
          taps one they like, sends a DM, and hopes the driver is awake.
          One yes/no, no fallback. Most riders bounce because they
          don&rsquo;t know who to pick.
        </p>
        <p>
          Blast inverts that. The rider describes the trip; the system
          picks the drivers. Multiple drivers get the request at the same
          time and respond in parallel. Rider sees a live board with all
          interested drivers and picks one.
        </p>
        <p className="text-neutral-400 text-sm">
          Trade-off: blast is more aggressive on the driver side
          (notifications), and the rider has to commit a deposit before
          sending. But conversion to confirmed rides is much higher.
        </p>
      </Section>

      <Section id="notify" title="What does &ldquo;notify drivers&rdquo; mean?">
        <p>
          When a blast is sent, every matched driver gets:
        </p>
        <ul className="list-disc ml-5 space-y-1">
          <li>
            A <strong>push notification</strong> on their phone (always &mdash; no
            extra cost)
          </li>
          <li>
            An <strong>SMS via voip.ms</strong> (optional, opt-in per driver,
            ~$0.01&ndash;0.02 each &mdash; see <em>Cost &amp; abuse knobs</em>)
          </li>
        </ul>
        <p>
          The notification deep-links to the request in their existing
          driver inbox. They tap HMU to express interest (with optional
          counter-price) or Pass to dismiss.
        </p>
        <p>
          We notify proactively because drivers aren&rsquo;t always
          staring at the app. Push + SMS interrupts them with the request
          so the rider doesn&rsquo;t have to wait for someone to be
          browsing.
        </p>
      </Section>

      <Section id="lifecycle" title="The full lifecycle, end to end">
        <ol className="list-decimal ml-5 space-y-2 text-neutral-300">
          <li>
            Rider lands on <code className="bg-neutral-800 px-1 rounded">/rider/browse/blast</code>, sees the social-proof
            grid of real drivers, taps &ldquo;Find a Ride&rdquo;.
          </li>
          <li>
            Form: pickup, dropoff, trip type, when, storage, price,
            driver preference. Saves to localStorage as they fill it.
          </li>
          <li>
            Tap &ldquo;Send to Drivers&rdquo;. If unauth → Clerk sign-up.
            If no photo → photo upload gate. If no payment method →
            settings redirect.
          </li>
          <li>
            Deposit hold authorized on the platform Stripe account
            (deposit-only, always &mdash; see <em>Deposit</em> below).
          </li>
          <li>
            Matching algorithm picks up to <em>max_drivers_to_notify</em>
            drivers ranked by score, fanout fires.
          </li>
          <li>
            Rider lands on <code className="bg-neutral-800 px-1 rounded">/rider/blast/[id]</code> &mdash; the live offer
            board. Countdown bar ticks. Drivers&rsquo; HMU responses
            glide in via Ably.
          </li>
          <li>
            Rider taps Match on a driver. Atomic SQL claim locks the
            blast (race-safe). Other drivers get a &ldquo;ride taken&rdquo;
            notification.
          </li>
          <li>
            Blast deposit hold is released; a normal ride row is
            created with the matched driver. Rider redirected to{' '}
            <code className="bg-neutral-800 px-1 rounded">/ride/[id]</code> &mdash; standard Pull Up flow takes over from
            here.
          </li>
        </ol>
        <p className="text-sm text-neutral-400 mt-3">
          If no driver responds before the countdown ends, the rider
          sees a fallback modal: bump price (+$5/$10/$20) or
          cancel-with-refund. Bumps re-broadcast to NEW drivers only
          (already-notified ones are skipped).
        </p>
      </Section>

      <Section id="weights-vs-filters" title="Weights vs. filters &mdash; what&rsquo;s the difference?">
        <p>
          The matching algorithm has two stages, and the knobs are
          grouped accordingly:
        </p>
        <div className="space-y-3">
          <Box label="Filters (hard)">
            Pass/fail. A driver who fails any filter is excluded
            <strong> entirely</strong> from the candidate pool. Use these to
            set safety floors &mdash; e.g. &ldquo;don&rsquo;t notify
            drivers under 50% chill&rdquo; or &ldquo;skip drivers who
            haven&rsquo;t opened the app in 3 days&rdquo;.
          </Box>
          <Box label="Weights (soft)">
            For drivers who passed the filters, a score is computed by
            multiplying each factor (proximity, recency, chill score,
            etc.) by its weight and summing. Drivers are ranked by
            this score, top N notified. Higher weight = that factor
            dominates the ranking.
          </Box>
        </div>
        <p className="text-sm text-neutral-400">
          Rule of thumb: filters cut the pool, weights re-order what&rsquo;s
          left. Tune filters for who&rsquo;s eligible at all; tune
          weights for who appears at the top.
        </p>
      </Section>

      <Section id="matching" title="What does the matching algorithm actually do?">
        <p>For each blast:</p>
        <ol className="list-decimal ml-5 space-y-1">
          <li>Pull all drivers within <code className="bg-neutral-800 px-1 rounded">max_distance_mi</code> who pass every hard filter.</li>
          <li>If fewer than <code className="bg-neutral-800 px-1 rounded">min_drivers_to_notify</code> match, widen the radius by <code className="bg-neutral-800 px-1 rounded">expand_radius_step_mi</code> and retry. Keep going until the min is met or <code className="bg-neutral-800 px-1 rounded">expand_radius_max_mi</code> is hit.</li>
          <li>Score each remaining driver: <code className="bg-neutral-800 px-1 rounded">score = Σ (factor × weight)</code> across all 8 factors.</li>
          <li>Sort descending. Cap at <code className="bg-neutral-800 px-1 rounded">max_drivers_to_notify</code>.</li>
          <li>If <code className="bg-neutral-800 px-1 rounded">prioritize_hmu_first</code> is on, reserve the top N slots for HMU First subscribers; remaining slots fill from the global ranking.</li>
          <li>Skip any driver who was already notified for a recent blast from the same rider (the dedupe window).</li>
          <li>Persist each notified driver to <code className="bg-neutral-800 px-1 rounded">blast_driver_targets</code> (with the score breakdown for admin debugging) and fire the fanout.</li>
        </ol>
      </Section>

      <Section id="no-match" title="What happens when no drivers respond?">
        <p>
          The rider sees a <strong>countdown bar</strong> that ticks down through{' '}
          <code className="bg-neutral-800 px-1 rounded">default_blast_minutes</code>. If no driver HMUs before it
          expires:
        </p>
        <ul className="list-disc ml-5 space-y-1">
          <li>A modal appears with three options: bump price (+$5/$10/$20), reschedule (form pre-filled), or cancel + refund.</li>
          <li>Bumping re-runs matching with a wider radius and notifies <strong>only new drivers</strong> &mdash; we never re-ping someone who already passed or was already notified.</li>
          <li>Cancel/refund releases the deposit hold immediately.</li>
        </ul>
        <p className="text-sm text-neutral-400">
          We also show a subtle &ldquo;Try +$5&rdquo; prompt at the 5-minute mark even if there are no responses yet.
        </p>
      </Section>

      <Section id="deposit" title="What&rsquo;s the deposit and when does the rider get charged?">
        <p>
          When the rider taps &ldquo;Send to Drivers&rdquo;, we authorize a
          hold (not a charge) on their card. The amount is{' '}
          <code className="bg-neutral-800 px-1 rounded">max(min_deposit, fare × percent_of_fare)</code> capped at <code className="bg-neutral-800 px-1 rounded">max_deposit</code>.
        </p>
        <p>
          The hold sits on the platform Stripe account &mdash; not on a
          driver&rsquo;s Connect account, because we don&rsquo;t know
          the driver yet. When the rider matches with a driver, the
          hold is <strong>released</strong> (the rider&rsquo;s card isn&rsquo;t
          actually charged), and the normal Pull Up flow runs its own
          payment authorization with the matched driver as the eventual
          destination.
        </p>
        <p>
          So the deposit&rsquo;s job is: weed out tire-kickers,
          confirm the card is real, and signal commitment to drivers.
          It&rsquo;s never the actual ride payment.
        </p>
        <p className="text-sm text-neutral-400">
          Deposit is forced for ALL blasts regardless of the rider&rsquo;s
          pricing-strategy cohort. Even cohorts that normally see full-
          fare auths get the deposit-only path on blasts.
        </p>
      </Section>

      <Section id="sms-economics" title="When do we send SMS, and what does it cost?">
        <p>
          Push notifications are free and always fire. SMS is sent in
          addition to push, gated by 7 layers (any one can opt the
          driver out of receiving an SMS for this blast):
        </p>
        <ol className="list-decimal ml-5 space-y-1 text-sm">
          <li>Master kill switch (<code className="bg-neutral-800 px-1 rounded">blast.sms_kill_switch</code>) &mdash; global ON = SMS off for all blasts</li>
          <li>Per-driver opt-in (<code className="bg-neutral-800 px-1 rounded">driver_blast_preferences.sms_enabled</code>)</li>
          <li>Driver&rsquo;s quiet hours (e.g. 10pm&ndash;7am)</li>
          <li>Driver&rsquo;s daily SMS cap (default 20/day)</li>
          <li>Driver&rsquo;s minimum fare floor (skip blasts below their threshold)</li>
          <li>Per-blast hard ceiling (<code className="bg-neutral-800 px-1 rounded">blast.max_sms_per_blast</code>, default 10)</li>
          <li>Driver phone is on file</li>
        </ol>
        <p>
          At ~$0.01&ndash;0.02 per SMS via voip.ms, a single blast that
          sends to all 10 max recipients costs roughly $0.10&ndash;0.20
          in SMS. That&rsquo;s why we rate-limit and cap.
        </p>
      </Section>

      <Section id="zero-disable" title="The &ldquo;set to 0 to disable&rdquo; trick">
        <p>
          For most numeric knobs where 0 has a sensible meaning, setting
          the value to <strong>0</strong> disables that check entirely
          rather than enforcing a strict rule. Specifically:
        </p>
        <ul className="list-disc ml-5 space-y-1 text-sm">
          <li><code className="bg-neutral-800 px-1 rounded">must_be_signed_in_within_hours = 0</code> &rarr; ignore signin recency</li>
          <li><code className="bg-neutral-800 px-1 rounded">exclude_if_today_passed_count_gte = 0</code> &rarr; ignore today&rsquo;s pass count</li>
          <li><code className="bg-neutral-800 px-1 rounded">same_driver_dedupe_minutes = 0</code> &rarr; allow re-pinging</li>
          <li><code className="bg-neutral-800 px-1 rounded">min_drivers_to_notify = 0</code> &rarr; never expand radius</li>
          <li><code className="bg-neutral-800 px-1 rounded">expand_radius_step_mi = 0</code> &rarr; never expand radius</li>
          <li><code className="bg-neutral-800 px-1 rounded">blast.max_sms_per_blast = 0</code> &rarr; never send SMS</li>
          <li><code className="bg-neutral-800 px-1 rounded">blast.rate_limit_per_phone_hour/day = 0</code> &rarr; no rate limiting</li>
        </ul>
        <p className="text-sm text-neutral-400">
          The help text on each row notes when this works.
        </p>
      </Section>

      <Section id="goals" title="Common tuning goals">
        <p className="text-sm text-neutral-400 mb-3">Some patterns you might want:</p>
        <div className="space-y-3">
          <Box label="Reach more drivers, even if farther">
            Raise <code className="bg-neutral-800 px-1 rounded">max_drivers_to_notify</code>, raise <code className="bg-neutral-800 px-1 rounded">expand_radius_max_mi</code>, lower the proximity weight a touch. Costs more SMS but more shots on goal.
          </Box>
          <Box label="Tighter, higher-quality matches only">
            Raise <code className="bg-neutral-800 px-1 rounded">min_chill_score</code>, lower <code className="bg-neutral-800 px-1 rounded">max_distance_mi</code>, raise the proximity + chill weights. Fewer notifications but better fit.
          </Box>
          <Box label="Cut SMS cost without killing fanout">
            Lower <code className="bg-neutral-800 px-1 rounded">blast.max_sms_per_blast</code> (push still goes to everyone). Or set <code className="bg-neutral-800 px-1 rounded">blast.sms_kill_switch</code> ON to kill SMS entirely.
          </Box>
          <Box label="Push HMU First subscribers harder">
            Turn on <code className="bg-neutral-800 px-1 rounded">prioritize_hmu_first</code>, set reserved slots to 2-3 of 10. They&rsquo;ll always get notified before the global ranking fills the rest.
          </Box>
          <Box label="Stop blasts during a quiet period">
            Set both <code className="bg-neutral-800 px-1 rounded">blast.rate_limit_per_phone_hour</code> and <code className="bg-neutral-800 px-1 rounded">blast.rate_limit_per_phone_day</code> to 1, OR turn the <code className="bg-neutral-800 px-1 rounded">blast_booking</code> feature flag off entirely (in <code className="bg-neutral-800 px-1 rounded">/admin/feature-flags</code>).
          </Box>
        </div>
      </Section>

      <footer className="pt-8 pb-12 border-t border-neutral-800 text-sm text-neutral-500">
        <p>
          Full technical spec lives at{' '}
          <code className="bg-neutral-800 px-1 rounded">docs/BLAST-BOOKING-SPEC.md</code>.
        </p>
        <p className="mt-2">
          <Link href="/admin/blast-config" className="text-white hover:underline">
            ← Back to config
          </Link>
        </p>
      </footer>
    </div>
  );
}

function Toc() {
  const items = [
    ['what-is-blast', 'What is a blast?'],
    ['vs-browse', 'How is this different from /rider/browse?'],
    ['notify', 'What does notify drivers mean?'],
    ['lifecycle', 'The full lifecycle'],
    ['weights-vs-filters', 'Weights vs. filters'],
    ['matching', 'What the matching algorithm does'],
    ['no-match', 'What happens when no drivers respond?'],
    ['deposit', 'What is the deposit?'],
    ['sms-economics', 'SMS — when and what it costs'],
    ['zero-disable', 'The 0 = disable trick'],
    ['goals', 'Common tuning goals'],
  ];
  return (
    <nav className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">Jump to</div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {items.map(([id, label]) => (
          <li key={id}>
            <a href={`#${id}`} className="text-neutral-300 hover:text-white">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-6">
      <h2 className="text-lg font-bold pt-2 border-t border-neutral-900">{title}</h2>
      <div className="text-sm text-neutral-300 space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
      <div className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold mb-1">
        {label}
      </div>
      <div className="text-sm text-neutral-300 leading-relaxed">{children}</div>
    </div>
  );
}
