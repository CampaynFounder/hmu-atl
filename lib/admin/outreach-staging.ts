// Shared helper for staging users selected in a drill-in sheet into the
// marketing/outreach page. Uses sessionStorage so the data survives the
// client-side navigation but doesn't leak across tabs or persist long-term.

const STAGING_KEY = 'hmu_admin_outreach_recipients';

export interface StagedRecipient {
  userId: string;
  name: string;
  phone: string;
  profileType: 'rider' | 'driver';
}

// Stash an array of selected users and navigate to /admin/marketing.
// Marketing dashboard reads and clears this on mount.
export function stageRecipientsAndGo(recipients: StagedRecipient[]): void {
  if (recipients.length === 0) return;
  try {
    sessionStorage.setItem(STAGING_KEY, JSON.stringify(recipients));
  } catch {
    // sessionStorage full or disabled — fall through to navigation, marketing
    // will show empty state.
  }
  window.location.href = '/admin/marketing';
}

// Read the staged recipients and clear them. Returns [] if nothing staged.
// Called once on marketing dashboard mount.
export function consumeStagedRecipients(): StagedRecipient[] {
  try {
    const raw = sessionStorage.getItem(STAGING_KEY);
    if (!raw) return [];
    sessionStorage.removeItem(STAGING_KEY);
    const parsed = JSON.parse(raw) as StagedRecipient[];
    return Array.isArray(parsed) ? parsed.filter((r) => r && r.phone) : [];
  } catch {
    return [];
  }
}
