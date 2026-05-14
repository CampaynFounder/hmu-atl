'use client';

// Neural Network Loader — used during the matching/searching state on the
// rider offer board. Per docs/BLAST-V3-AGENT-CONTRACT.md §6.3 + §6.6.
//
// 5x5 grid of 4px nodes (25 total), thin 1px edges to nearest neighbors
// (~40 edges). At any moment 3-5 random nodes pulse opacity 0.3↔1.0 over
// 1.2s easeInOut; edges adjacent to pulsing nodes fade 0.1→0.5; new
// random seed every 600ms. Color: HMU green #00E676 nodes,
// rgba(0,230,118,0.15) edges.
//
// Reduced-motion fallback: static grid + text-only "Searching…" with
// CSS animate-pulse (opacity-only).

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface NeuralNetworkLoaderProps {
  /** Optional label rendered below the grid, e.g. "Notifying 7 drivers…". */
  label?: string;
  /** Px size of one side of the SVG (default 160). Grid is always 5x5. */
  size?: number;
  className?: string;
}

const GRID_SIZE = 5;
const NODE_RADIUS = 2; // 4px diameter
const NODE_COLOR = '#00E676';
const EDGE_COLOR = 'rgba(0, 230, 118, 0.15)';
const EDGE_PULSE_COLOR = 'rgba(0, 230, 118, 0.5)';
const PULSE_DURATION_MS = 1200;
const SEED_INTERVAL_MS = 600;

interface NodeRef { i: number; j: number; key: string }
interface EdgeRef { from: string; to: string; key: string; x1: number; y1: number; x2: number; y2: number }

/**
 * Build the 5x5 grid + an edge list connecting each node to its (up to 4)
 * nearest cardinal neighbors. The cardinal-only choice gives the ~40-edge
 * total the contract calls for and keeps the grid readable.
 */
function buildGraph(svgSize: number) {
  const padding = svgSize * 0.1;
  const inner = svgSize - padding * 2;
  const step = inner / (GRID_SIZE - 1);
  const nodes: Array<NodeRef & { x: number; y: number }> = [];
  for (let i = 0; i < GRID_SIZE; i += 1) {
    for (let j = 0; j < GRID_SIZE; j += 1) {
      nodes.push({
        i, j,
        key: `${i}-${j}`,
        x: padding + i * step,
        y: padding + j * step,
      });
    }
  }
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const edges: EdgeRef[] = [];
  for (const n of nodes) {
    // Right + down only — avoids double-counting each undirected edge.
    const right = byKey.get(`${n.i + 1}-${n.j}`);
    const down = byKey.get(`${n.i}-${n.j + 1}`);
    if (right) edges.push({ from: n.key, to: right.key, key: `${n.key}-${right.key}`, x1: n.x, y1: n.y, x2: right.x, y2: right.y });
    if (down) edges.push({ from: n.key, to: down.key, key: `${n.key}-${down.key}`, x1: n.x, y1: n.y, x2: n.x, y2: down.y });
  }
  return { nodes, edges };
}

function pickRandomKeys(allKeys: string[], count: number, seed: number): Set<string> {
  // Deterministic-ish pick using a small linear congruential shuffle keyed
  // by `seed`. Avoids needing a library and still gives variety per tick.
  const out = new Set<string>();
  let s = seed * 9301 + 49297;
  const len = allKeys.length;
  let safety = 0;
  while (out.size < count && safety < count * 10) {
    s = (s * 1103515245 + 12345) % 0x80000000;
    const idx = Math.abs(s) % len;
    out.add(allKeys[idx]);
    safety += 1;
  }
  return out;
}

export function NeuralNetworkLoader({ label, size = 160, className }: NeuralNetworkLoaderProps) {
  const prefersReduced = useReducedMotion();
  const { nodes, edges } = useMemo(() => buildGraph(size), [size]);
  const nodeKeys = useMemo(() => nodes.map((n) => n.key), [nodes]);

  const [seed, setSeed] = useState(0);

  useEffect(() => {
    if (prefersReduced) return;
    const id = setInterval(() => setSeed((s) => s + 1), SEED_INTERVAL_MS);
    return () => clearInterval(id);
  }, [prefersReduced]);

  // Reduced-motion path: render once, with an animate-pulse on the label.
  if (prefersReduced) {
    return (
      <div className={className} role="status" aria-live="polite">
        <span className="sr-only">{label ?? 'Searching'}</span>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          {edges.map((e) => (
            <line key={e.key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={EDGE_COLOR} strokeWidth={1} />
          ))}
          {nodes.map((n) => (
            <circle key={n.key} cx={n.x} cy={n.y} r={NODE_RADIUS} fill={NODE_COLOR} opacity={0.6} />
          ))}
        </svg>
        {label ? (
          <p
            className="animate-pulse"
            style={{ marginTop: 8, fontSize: 14, color: '#BBBBBB', textAlign: 'center', fontFamily: 'DM Sans, system-ui, sans-serif' }}
          >
            {label}
          </p>
        ) : null}
      </div>
    );
  }

  // Animated path: each tick (every SEED_INTERVAL_MS), pick 3-5 active nodes;
  // active nodes pulse opacity, adjacent edges brighten.
  // Pulse count ranges 3..5 (inclusive). Use seed to vary per tick.
  const pulseCount = 3 + (seed % 3);
  const activeNodes = pickRandomKeys(nodeKeys, pulseCount, seed);
  const activeEdges = new Set<string>();
  for (const e of edges) {
    if (activeNodes.has(e.from) || activeNodes.has(e.to)) activeEdges.add(e.key);
  }

  return (
    <div className={className} role="status" aria-live="polite">
      <span className="sr-only">{label ?? 'Searching'}</span>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {edges.map((e) => {
          const isActive = activeEdges.has(e.key);
          return (
            <motion.line
              key={e.key}
              x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              stroke={isActive ? EDGE_PULSE_COLOR : EDGE_COLOR}
              strokeWidth={1}
              animate={{ opacity: isActive ? [0.1, 0.5, 0.1] : 1 }}
              transition={{ duration: PULSE_DURATION_MS / 1000, ease: 'easeInOut' }}
            />
          );
        })}
        {nodes.map((n) => {
          const isActive = activeNodes.has(n.key);
          return (
            <motion.circle
              key={n.key}
              cx={n.x} cy={n.y} r={NODE_RADIUS}
              fill={NODE_COLOR}
              animate={{ opacity: isActive ? [0.3, 1, 0.3] : 0.5 }}
              transition={{ duration: PULSE_DURATION_MS / 1000, ease: 'easeInOut' }}
            />
          );
        })}
      </svg>
      {label ? (
        <p
          style={{ marginTop: 8, fontSize: 14, color: '#BBBBBB', textAlign: 'center', fontFamily: 'DM Sans, system-ui, sans-serif' }}
        >
          {label}
        </p>
      ) : null}
    </div>
  );
}

export default NeuralNetworkLoader;
