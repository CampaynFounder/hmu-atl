'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { usePendingActions } from '@/hooks/use-pending-actions';
import type { PendingAction } from '@/app/api/users/pending-actions/route';

interface Props {
  /** Maximum number of actions to show before the "+N more" expander. Default 1. */
  maxActions?: number;
  /** Compact mode — single line, no subtitle. Good for tight layouts. */
  compact?: boolean;
}

const DISMISSED_KEY = 'hmu_pending_actions_dismissed';

// Action types that can NEVER be dismissed. These represent real-time work the
// user actually needs to finish (active ride, pending booking, unread chat,
// driver passed). Evergreen "finish your profile" style actions can be tucked
// away without dropping the real-time workflow.
function canDismiss(action: PendingAction): boolean {
  const permanent = new Set([
    'active_ride',
    'rate_ride',
    'unread_chat',
    'driver_passed',
    'pending_booking',
    'booking_request',
    'continue_booking',
  ]);
  return !permanent.has(action.type);
}

function readDismissed(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter(x => typeof x === 'string') : [];
  } catch { return []; }
}

function writeDismissed(ids: string[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
}

/**
 * Persistent banner showing pending actions. Sticky at the top of home screens,
 * auto-refreshes every 30s. Each item can be dismissed (except real-time
 * workflow actions). "+N more" expands inline instead of being dead text.
 */
export function PendingActionBanner({ maxActions = 1, compact = false }: Props) {
  const { actions, loading } = usePendingActions();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
    setHydrated(true);
  }, []);

  function dismissAction(id: string) {
    setDismissed(prev => {
      const next = prev.includes(id) ? prev : [...prev, id];
      writeDismissed(next);
      return next;
    });
  }

  function restoreAll() {
    setDismissed([]);
    writeDismissed([]);
  }

  if (!actions.length && !loading) return null;

  const visibleActions = hydrated ? actions.filter(a => !dismissed.includes(a.id)) : actions;
  const hiddenCount = hydrated ? actions.length - visibleActions.length : 0;

  // Everything dismissed — tiny "show" control so the user can restore.
  if (visibleActions.length === 0 && hiddenCount > 0) {
    return (
      <div style={{ padding: '0 16px', marginBottom: 12, textAlign: 'center' }}>
        <button
          onClick={restoreAll}
          style={{
            fontSize: 11,
            color: '#888',
            fontFamily: "var(--font-mono, 'Space Mono', monospace)",
            letterSpacing: 1,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '6px 12px',
            borderRadius: 100,
            cursor: 'pointer',
          }}
        >
          {hiddenCount} hidden · show
        </button>
      </div>
    );
  }

  const topVisible = visibleActions.slice(0, maxActions);
  const overflowVisible = visibleActions.slice(maxActions);
  const overflowCount = overflowVisible.length;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '0 16px', marginBottom: 12,
    }}>
      <AnimatePresence initial={false}>
        {topVisible.map(action => (
          <motion.div
            key={action.id}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <ActionCard
              action={action}
              compact={compact}
              onClick={() => router.push(action.href)}
              onDismiss={canDismiss(action) ? () => dismissAction(action.id) : null}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {expanded && overflowVisible.map(action => (
          <motion.div
            key={action.id}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <ActionCard
              action={action}
              compact={compact}
              onClick={() => router.push(action.href)}
              onDismiss={canDismiss(action) ? () => dismissAction(action.id) : null}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {(overflowCount > 0 || hiddenCount > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 12, fontSize: 11,
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          letterSpacing: 1,
        }}>
          {overflowCount > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '6px 12px',
                borderRadius: 100,
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {expanded
                ? 'show fewer'
                : `+${overflowCount} more ${overflowCount === 1 ? 'action' : 'actions'}`}
            </button>
          )}
          {hiddenCount > 0 && (
            <button
              onClick={restoreAll}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {hiddenCount} hidden · show
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface ActionCardProps {
  action: PendingAction;
  compact: boolean;
  onClick: () => void;
  onDismiss: (() => void) | null;
}

function ActionCard({ action, compact, onClick, onDismiss }: ActionCardProps) {
  const isUrgent = action.priority === 0;

  if (compact) {
    return (
      <div style={{ position: 'relative' }}>
        <button
          onClick={onClick}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '10px 14px', paddingRight: onDismiss ? 36 : 14,
            borderRadius: 12,
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
        {onDismiss && <DismissButton onClick={onDismiss} compact />}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          width: '100%', padding: '14px 16px', paddingRight: onDismiss ? 40 : 16,
          borderRadius: 16,
          border: `1px solid ${isUrgent ? action.color + '40' : 'rgba(255,255,255,0.08)'}`,
          background: isUrgent ? action.color + '10' : '#141414',
          cursor: 'pointer', textAlign: 'left',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          animation: isUrgent ? 'actionPulse 2s ease-in-out infinite' : 'none',
        }}
      >
        <style>{`@keyframes actionPulse { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 20px ${action.color}20} }`}</style>

        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: action.color + '15',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>
          {action.emoji}
        </div>

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

        <div style={{
          padding: '8px 16px', borderRadius: 100,
          background: action.color, color: '#080808',
          fontSize: 12, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          {action.cta}
        </div>
      </button>
      {onDismiss && <DismissButton onClick={onDismiss} />}
    </div>
  );
}

function DismissButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick(); }}
      aria-label="Dismiss"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        top: compact ? 6 : 8,
        right: compact ? 6 : 8,
        width: compact ? 22 : 26,
        height: compact ? 22 : 26,
        borderRadius: '50%',
        background: hover ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.3)',
        color: hover ? '#fff' : 'rgba(255,255,255,0.6)',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: compact ? 11 : 12,
        transform: hover ? 'scale(1.05)' : 'scale(1)',
        transition: 'all 160ms ease',
      }}
    >
      ✕
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
