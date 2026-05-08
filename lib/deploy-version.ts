// Build-time deploy stamps. Injected by .github/workflows/deploy-{staging,prod}.yml
// and the deploy:* npm scripts. NEXT_PUBLIC_* so the client bundle can read them
// — SHAs aren't sensitive (the repo's commit hashes are already public on GitHub).

export type DeployEnv = 'staging' | 'production' | 'development' | 'unknown';

export interface DeployVersion {
  /** Short SHA (7 chars) when injected; 'dev' on local dev. */
  sha: string;
  /** ISO timestamp the deploy started. Empty string on local dev. */
  time: string;
  /** Environment label. Used to color-code badges in the admin UI. */
  env: DeployEnv;
}

function shortSha(s: string): string {
  if (!s) return 'dev';
  return s.slice(0, 7);
}

function normalizeEnv(raw: string | undefined): DeployEnv {
  if (raw === 'staging' || raw === 'production' || raw === 'development') return raw;
  if (process.env.NODE_ENV === 'development') return 'development';
  return 'unknown';
}

export function getDeployVersion(): DeployVersion {
  return {
    sha: shortSha(process.env.NEXT_PUBLIC_DEPLOY_SHA ?? ''),
    time: process.env.NEXT_PUBLIC_DEPLOY_TIME ?? '',
    env: normalizeEnv(process.env.NEXT_PUBLIC_DEPLOY_ENV),
  };
}

/** Human-friendly relative-time formatter for the deploy timestamp. */
export function relativeDeployAge(iso: string, now: number = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffSec = Math.max(0, Math.round((now - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
