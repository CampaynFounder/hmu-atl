import { Construction } from 'lucide-react';
import { getStateCached } from '@/lib/maintenance';
import MaintenanceWaitlistForm from './waitlist-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Scheduled Maintenance — HMU ATL' };

const FALLBACK_TITLE = 'Scheduled maintenance — back soon';
const FALLBACK_BODY =
  "We're heads-down making HMU the way rides SHOULD work — drivers keep more of what they earn, riders pay less than the greedy tech-billionaire platforms charge. Won't take long.";

function humanReturn(at: Date | null): { short: string; absolute: string | null } {
  if (!at) return { short: 'very soon', absolute: null };
  const now = Date.now();
  const ms = new Date(at).getTime() - now;
  const absolute = new Date(at).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  if (ms <= 0) return { short: 'any minute now', absolute };
  const hours = ms / 3_600_000;
  if (hours < 1) {
    const mins = Math.max(1, Math.round(ms / 60_000));
    return { short: `in about ${mins} minute${mins === 1 ? '' : 's'}`, absolute };
  }
  if (hours < 24) {
    const h = Math.round(hours);
    return { short: `in about ${h} hour${h === 1 ? '' : 's'}`, absolute };
  }
  const days = Math.round(hours / 24);
  return { short: `in about ${days} day${days === 1 ? '' : 's'}`, absolute };
}

export default async function MaintenancePage() {
  const state = await getStateCached();
  const title = state.title || FALLBACK_TITLE;
  const body = state.body || FALLBACK_BODY;
  const { short, absolute } = humanReturn(state.expected_return_at ?? null);

  return (
    <div
      className="min-h-screen bg-[#080808] text-white flex items-center justify-center px-6 py-16"
      style={{ fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}
    >
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-[#141414] rounded-2xl flex items-center justify-center border border-[#1a1a1a]">
            <Construction className="w-10 h-10 text-[#00e676]" />
          </div>
        </div>

        <h1
          className="text-3xl sm:text-4xl mb-4 text-[#00e676] text-center leading-tight"
          style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", letterSpacing: 2 }}
        >
          {title}
        </h1>

        <p className="text-[#bbb] text-base leading-relaxed text-center whitespace-pre-wrap mb-5">
          {body}
        </p>

        <div
          className="rounded-xl p-4 mb-6 text-center"
          style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[10px] uppercase tracking-[3px] text-[#666] mb-1">Expected back</p>
          <p className="text-lg font-bold text-white">{short}</p>
          {absolute && <p className="text-[11px] text-[#888] mt-1">{absolute}</p>}
        </div>

        <MaintenanceWaitlistForm />

        <p className="text-[11px] text-[#666] text-center mt-6">
          Questions? Text us at <a href="sms:+14049137292" className="text-[#00e676] hover:underline">404-913-7292</a>
        </p>
      </div>
    </div>
  );
}
