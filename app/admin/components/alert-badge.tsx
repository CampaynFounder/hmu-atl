'use client';

interface AlertBadgeProps {
  type: string;
  severity: string;
  message: string;
  timestamp?: string;
  onClick?: () => void;
}

const severityStyles: Record<string, string> = {
  critical: 'border-red-500/50 bg-red-500/10 text-red-400',
  high: 'border-orange-500/50 bg-orange-500/10 text-orange-400',
  warning: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
  info: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
};

const severityDot: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  warning: 'bg-yellow-500',
  info: 'bg-emerald-500',
};

export function AlertBadge({ severity, message, timestamp, onClick }: AlertBadgeProps) {
  const timeAgo = timestamp
    ? getTimeAgo(new Date(timestamp))
    : '';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left border rounded-lg p-3 transition-colors hover:opacity-80 ${severityStyles[severity] ?? severityStyles.warning}`}
    >
      <div className="flex items-start gap-2">
        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${severityDot[severity] ?? severityDot.warning}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{message}</p>
          {timeAgo && <p className="text-xs opacity-60 mt-0.5">{timeAgo}</p>}
        </div>
      </div>
    </button>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
