'use client';

import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';

export interface DailyBucket {
  day: string;
  cash: number;
  nonCash: number;
  rides: number;
}

interface Props {
  data: DailyBucket[];
  onDrill?: (bucket: DailyBucket) => void;
}

const COLOR_CASH = '#00E676';
const COLOR_NON_CASH = '#3B82F6';
const COLOR_EMPTY = 'rgba(255,255,255,0.06)';

export function EarningsChart({ data, onDrill }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const total = data.reduce((s, d) => s + d.cash + d.nonCash, 0);
  const totalCash = data.reduce((s, d) => s + d.cash, 0);
  const totalNonCash = data.reduce((s, d) => s + d.nonCash, 0);

  if (total === 0) {
    return (
      <div style={{
        background: '#141414', borderRadius: 16, padding: 20, textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.06)', color: '#888', fontSize: 13,
      }}>
        No earnings in the last 30 days
      </div>
    );
  }

  return (
    <div style={{
      background: '#141414', borderRadius: 16, padding: 16,
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>
            Last 30 Days
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', fontFamily: "'Space Mono', monospace", marginTop: 2 }}>
            ${total.toFixed(2)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
          <LegendDot color={COLOR_CASH} label="Cash" value={`$${totalCash.toFixed(0)}`} />
          <LegendDot color={COLOR_NON_CASH} label="App Pay" value={`$${totalNonCash.toFixed(0)}`} />
        </div>
      </div>

      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
            onClick={(e) => {
              const idx = e?.activeTooltipIndex;
              if (typeof idx === 'number' && onDrill) onDrill(data[idx]);
            }}
            onMouseMove={(e) => {
              const idx = e?.activeTooltipIndex;
              setActiveIdx(typeof idx === 'number' ? idx : null);
            }}
            onMouseLeave={() => setActiveIdx(null)}
          >
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: '#666', fontSize: 10 }}
              tickFormatter={formatTick}
              interval={Math.max(0, Math.floor(data.length / 6))}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#666', fontSize: 10 }}
              tickFormatter={(v) => `$${v}`}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={<ChartTooltip />}
            />
            <Bar dataKey="cash" stackId="a" fill={COLOR_CASH} radius={[0, 0, 0, 0]} animationDuration={800} animationEasing="ease-out">
              {data.map((d, i) => (
                <Cell key={`c-${i}`} fill={d.cash === 0 && d.nonCash === 0 ? COLOR_EMPTY : COLOR_CASH} opacity={activeIdx == null || activeIdx === i ? 1 : 0.4} />
              ))}
            </Bar>
            <Bar dataKey="nonCash" stackId="a" fill={COLOR_NON_CASH} radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={120} animationEasing="ease-out">
              {data.map((d, i) => (
                <Cell key={`n-${i}`} fill={d.cash === 0 && d.nonCash === 0 ? COLOR_EMPTY : COLOR_NON_CASH} opacity={activeIdx == null || activeIdx === i ? 1 : 0.4} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
      <span style={{ color: '#bbb' }}>{label}</span>
      <span style={{ color: '#fff', fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>{value}</span>
    </div>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailyBucket }>;
}

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const total = d.cash + d.nonCash;
  return (
    <div style={{
      background: '#080808', border: '1px solid rgba(0,230,118,0.3)', borderRadius: 10,
      padding: '8px 10px', fontSize: 11, color: '#fff', minWidth: 120,
    }}>
      <div style={{ color: '#888', marginBottom: 4, fontWeight: 600 }}>{formatFullDate(d.day)}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: '#bbb' }}>Total</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>${total.toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: COLOR_CASH }}>Cash</span>
        <span style={{ fontFamily: "'Space Mono', monospace" }}>${d.cash.toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: COLOR_NON_CASH }}>App Pay</span>
        <span style={{ fontFamily: "'Space Mono', monospace" }}>${d.nonCash.toFixed(2)}</span>
      </div>
      <div style={{ color: '#666', fontSize: 10, marginTop: 4 }}>
        {d.rides} {d.rides === 1 ? 'ride' : 'rides'}
      </div>
    </div>
  );
}

function formatTick(dayStr: string): string {
  const d = new Date(dayStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

function formatFullDate(dayStr: string): string {
  const d = new Date(dayStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
