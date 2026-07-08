// Account-deletion availability — superadmin kill-switch at /admin/account-deletion.
//
// Whether the mobile app shows the "Delete account" flow (and whether the
// self-service delete endpoint accepts requests). DEFAULTS ON: account deletion
// is an App Store compliance feature, so it must fail OPEN — a missing config
// row or a DB read error resolves to enabled.
//
// Persisted in platform_config key `account.deletion`; no migration needed
// (getPlatformConfig returns the default when the row is absent).

import { getPlatformConfig } from '@/lib/platform-config/get';

export const ACCOUNT_DELETION_KEY = 'account.deletion';

export interface AccountDeletionConfig {
  enabled: boolean;
}

export const DEFAULT_ACCOUNT_DELETION_CONFIG: AccountDeletionConfig = { enabled: true };

export async function getAccountDeletionConfig(): Promise<AccountDeletionConfig> {
  const cfg = (await getPlatformConfig(
    ACCOUNT_DELETION_KEY,
    DEFAULT_ACCOUNT_DELETION_CONFIG as unknown as Record<string, unknown>,
  )) as unknown as AccountDeletionConfig;
  // Only an explicit `false` turns it off — anything else (missing/garbled)
  // stays ON so the compliance feature fails open.
  return { enabled: cfg.enabled !== false };
}

export async function isAccountDeletionEnabled(): Promise<boolean> {
  return (await getAccountDeletionConfig()).enabled;
}
