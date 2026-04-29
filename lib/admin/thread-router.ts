// Helper that decides where to land an admin who has selected one or more
// recipients in /admin/marketing (Outreach). For a single phone with a real
// SMS history, jump into the thread on /admin/messages; otherwise fall back
// to the parent's prefill callback so the admin can compose a fresh message
// with the number(s) already in the textarea.
//
// Used by both RecentSignups (per-row + bulk) and the Selected drill-in
// panel inside MarketingDashboard.

export interface ThreadRouterDeps {
  router: { push: (href: string) => void };
  prefillCompose: (phones: string[]) => void;
}

// voip.ms accepts at most 10 destinations per thread on the SMS send side.
// We mirror that here so the Thread button can never stage more than the
// provider will accept downstream.
export const MAX_THREAD_RECIPIENTS = 10;

// Strip everything but digits so the comparison matches the API's normalized
// stored format (sms_log.to_phone / sms_inbound.from_phone are digits-only).
function digits(p: string): string {
  return (p || '').replace(/\D/g, '');
}

async function threadHasMessages(phone: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/admin/messages?phone=${encodeURIComponent(digits(phone))}`);
    if (!res.ok) return false;
    const data = await res.json() as { messages?: unknown[] };
    return Array.isArray(data.messages) && data.messages.length > 0;
  } catch {
    return false;
  }
}

export async function openThreadOrCompose(
  phones: string[],
  deps: ThreadRouterDeps,
): Promise<void> {
  const cleaned = Array.from(new Set(phones.map(digits).filter(Boolean)));
  if (cleaned.length === 0) return;

  const capped = cleaned.slice(0, MAX_THREAD_RECIPIENTS);
  if (cleaned.length > MAX_THREAD_RECIPIENTS && typeof window !== 'undefined') {
    window.alert(
      `Thread is capped at ${MAX_THREAD_RECIPIENTS} numbers — voip.ms only accepts 10 per send. ` +
      `Using the first ${MAX_THREAD_RECIPIENTS}; ${cleaned.length - MAX_THREAD_RECIPIENTS} dropped.`,
    );
  }

  // A thread can only "exist" for a single phone. If the admin selected many,
  // skip the lookup and go straight to compose so they can blast a new wave.
  if (capped.length === 1) {
    const phone = capped[0];
    if (await threadHasMessages(phone)) {
      deps.router.push(`/admin/messages?phone=${phone}`);
      return;
    }
  }

  deps.prefillCompose(capped);
}
