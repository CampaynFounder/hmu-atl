// Shared chip used on every browse-card variant. Tones map to the same accent
// palette as the rest of the app — keep additions deliberate.

export type ChipTone = 'neutral' | 'lgbtq' | 'cash' | 'fwu' | 'first' | 'success' | 'live';

interface Props {
  label: React.ReactNode;
  tone?: ChipTone;
  compact?: boolean;
}

const PALETTE: Record<ChipTone, { bg: string; border: string; color: string }> = {
  neutral: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)', color: '#bbb' },
  lgbtq:   { bg: 'rgba(168,85,247,0.14)',  border: 'rgba(168,85,247,0.30)', color: '#D9B5FF' },
  cash:    { bg: 'rgba(76,175,80,0.15)',   border: 'rgba(76,175,80,0.30)',  color: '#4CAF50' },
  fwu:     { bg: 'rgba(255,145,0,0.15)',   border: 'rgba(255,145,0,0.30)',  color: '#FF9100' },
  first:   { bg: '#00E676',                border: '#00E676',               color: '#080808' },
  success: { bg: 'rgba(0,230,118,0.10)',   border: 'rgba(0,230,118,0.20)',  color: '#00E676' },
  live:    { bg: 'rgba(0,230,118,0.15)',   border: 'rgba(0,230,118,0.30)',  color: '#00E676' },
};

export default function Chip({ label, tone = 'neutral', compact }: Props) {
  const p = PALETTE[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: p.bg, border: `1px solid ${p.border}`, color: p.color,
      borderRadius: 100,
      padding: compact ? '2px 8px' : '4px 10px',
      fontSize: compact ? 10 : 11, fontWeight: 700,
      letterSpacing: 0.3,
    }}>
      {label}
    </span>
  );
}
