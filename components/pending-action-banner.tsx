'use client';

import { useRouter } from 'next/navigation';
import { usePendingActions } from '@/hooks/use-pending-actions';
import type { PendingAction } from '@/app/api/users/pending-actions/route';

interface Props {
  /** Maximum number of actions to show. Default 1 (just the top action). */
  maxActions?: number;
  /** Compact mode — single line, no subtitle. Good for tight layouts. */
  compact?: boolean;
}

/**
 * Persistent banner showing the most urgent pending action(s).
 * Sticky at the top of home screens. Auto-refreshes every 30s.
 */
export function PendingActionBanner({ maxActions = 1, compact = false }: Props) {
  const { actions, loading } = usePendingActions();
  const router = useRouter();

  if (!actions.length && !loading) return null;

  const visible = actions.slice(0, maxActions);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '0 16px', marginBottom: 12,
    }}>
      {visible.map(action => (
        <ActionCard key={action.id} action={action} compact={compact} onClick={() => router.push(action.href)} />
      ))}

      {/* Overflow indicator */}
      {actions.length > maxActions && (
        <div style={{
          textAlign: 'center', fontSize: 11, color: '#888',
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          letterSpacing: 1,
        }}>
          +{actions.length - maxActions} more {actions.length - maxActions === 1 ? 'action' : 'actions'}
        </div>
      )}
    </div>
  );
}

function ActionCard({ action, compact, onClick }: { action: PendingAction; compact: boolean; onClick: () => void }) {
  const isUrgent = action.priority === 0;

  if (compact) {
    return (
      <button
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '10px 14px', borderRadius: 12,
          border: `1px solid ${isUrgent ? action.color + '40' : 'rgba(255,255,255,0.08)'}`,
          background: isUrgent ? action.color + '12' : '#141414',
          cursor: 'pointer', textAlign: 'left',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        }}
      >
        <span style={{ fontSize: 18, flexShrink: 0 }}>{action.emoji}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#fff', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {action.title}
        </span>
        <span style={{
          padding: '4px 12px', borderRadius: 100, fontSize: 11, fontWeight: 700,
          background: action.color, color: '#080808', flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          {action.cta}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', padding: '14px 16px', borderRadius: 16,
        border: `1px solid ${isUrgent ? action.color + '40' : 'rgba(255,255,255,0.08)'}`,
        background: isUrgent ? action.color + '10' : '#141414',
        cursor: 'pointer', textAlign: 'left',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        animation: isUrgent ? 'actionPulse 2s ease-in-out infinite' : 'none',
      }}
    >
      <style>{`@keyframes actionPulse { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 20px ${action.color}20} }`}</style>

      {/* Emoji */}
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: action.color + '15',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, flexShrink: 0,
      }}>
        {action.emoji}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: '#fff',
          lineHeight: 1.3, marginBottom: 2,
        }}>
          {action.title}
        </div>
        <div style={{
          fontSize: 12, color: '#999', lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {action.subtitle}
        </div>
      </div>

      {/* CTA */}
      <div style={{
        padding: '8px 16px', borderRadius: 100,
        background: action.color, color: '#080808',
        fontSize: 12, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap',
      }}>
        {action.cta}
      </div>
    </button>
  );
}

/**
 * Minimal version — just shows the top action as a small floating pill.
 * Good for pages where the full banner is too heavy.
 */
export function PendingActionPill() {
  const { topAction } = usePendingActions();
  const router = useRouter();

  if (!topAction) return null;

  return (
    <button
      onClick={() => router.push(topAction.href)}
      style={{
        position: 'fixed', bottom: 'max(80px, calc(env(safe-area-inset-bottom) + 70px))',
        left: '50%', transform: 'translateX(-50%)',
        zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 18px', borderRadius: 100,
        background: '#141414', border: `1px solid ${topAction.color}40`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        cursor: 'pointer', whiteSpace: 'nowrap',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      }}
    >
      <span style={{ fontSize: 16 }}>{topAction.emoji}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{topAction.title}</span>
      <span style={{
        padding: '3px 10px', borderRadius: 100, fontSize: 10, fontWeight: 700,
        background: topAction.color, color: '#080808',
      }}>
        {topAction.cta}
      </span>
    </button>
  );
}
