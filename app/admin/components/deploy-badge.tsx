'use client';

import { useEffect, useState } from 'react';
import { getDeployVersion, relativeDeployAge, type DeployEnv } from '@/lib/deploy-version';

const ENV_STYLES: Record<DeployEnv, { label: string; bg: string; border: string; text: string }> = {
  production: {
    label: 'PROD',
    bg: 'bg-emerald-900/40',
    border: 'border-emerald-700/60',
    text: 'text-emerald-300',
  },
  staging: {
    label: 'STAGING',
    bg: 'bg-amber-900/40',
    border: 'border-amber-700/60',
    text: 'text-amber-300',
  },
  development: {
    label: 'DEV',
    bg: 'bg-blue-900/40',
    border: 'border-blue-700/60',
    text: 'text-blue-300',
  },
  unknown: {
    label: 'UNKNOWN',
    bg: 'bg-neutral-800',
    border: 'border-neutral-700',
    text: 'text-neutral-400',
  },
};

export function DeployBadge() {
  const version = getDeployVersion();
  const styles = ENV_STYLES[version.env];
  const [age, setAge] = useState(() => relativeDeployAge(version.time));
  const [copied, setCopied] = useState(false);

  // Re-render the relative age every minute so "12m ago" doesn't go stale
  // while the tab stays open.
  useEffect(() => {
    if (!version.time) return;
    const t = setInterval(() => setAge(relativeDeployAge(version.time)), 60_000);
    return () => clearInterval(t);
  }, [version.time]);

  function handleCopy() {
    navigator.clipboard?.writeText(version.sha).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {},
    );
  }

  const tooltip = version.time
    ? `Deployed ${new Date(version.time).toLocaleString()}\nClick to copy SHA`
    : 'No deploy timestamp\nClick to copy SHA';

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={tooltip}
      className={`flex items-center gap-2 rounded-md border px-2 py-1 text-[10px] font-mono ${styles.bg} ${styles.border} ${styles.text} hover:brightness-125 transition`}
    >
      <span className="font-bold tracking-wide">{styles.label}</span>
      <span className="opacity-70">·</span>
      <span>{copied ? 'copied' : version.sha}</span>
      {age && (
        <>
          <span className="opacity-70">·</span>
          <span className="opacity-80">{age}</span>
        </>
      )}
    </button>
  );
}
