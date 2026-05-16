'use client';

// MetroNeuralNet — 3D-feeling network loader shaped like the local metro.
//
// Used during the offer board's "searching" state to evoke a network of
// drivers scanning the metro for a rider's request. Replaces the 5×5 grid
// loader for markets we have a polygon for.
//
// Implementation notes:
//  - Pure SVG + CSS perspective. No Three.js / WebGL dependency, so the
//    bundle stays lean. The 3D feel comes from a perspective container with
//    a continuously rotating Y tilt; nodes/edges live inside the rotating
//    plane.
//  - Nodes are scattered via grid + Poisson-style rejection sampling against
//    the polygon. Edges connect each node to its ~k nearest neighbors so the
//    mesh reads as connected without overcrowding.
//  - Shimmer = stroke-dasharray gap + animated stroke-dashoffset. Cheap, GPU-
//    accelerated, looks like a current of light traveling along each edge.
//  - Reduced-motion gets a static silhouette + nodes; no tilt, no shimmer.
//  - SVG <filter> Gaussian blur on the node layer creates the soft glow.

import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { MetroOutline } from './metros';

interface MetroNeuralNetProps {
  metro: MetroOutline;
  /** Optional label rendered below the network. */
  label?: string;
  /** Pixel size of the square viewport (default 240). */
  size?: number;
  className?: string;
}

const NODE_COLOR = '#00E676';
const EDGE_COLOR = 'rgba(0, 230, 118, 0.18)';
const SHIMMER_COLOR = 'rgba(0, 230, 118, 0.85)';
const OUTLINE_COLOR = 'rgba(0, 230, 118, 0.22)';

// Visual tuning knobs — kept here so a designer can adjust without touching
// the algorithm below.
const NODE_GRID_STEP = 0.085; // tighter = more nodes
const NODE_JITTER = 0.022;    // randomness applied to grid placement
const NODES_PER_NODE_EDGES = 3; // each node connects to its k nearest neighbors
const MAX_EDGE_LENGTH = 0.28; // skip far edges to keep the mesh local
const PULSE_INTERVAL_MS = 700;
const ROTATION_DURATION_S = 28; // full 360° loop

// ─── Geometry helpers ───────────────────────────────────────────────────────

function pointInPolygon(
  point: [number, number],
  polygon: readonly [number, number][],
): boolean {
  // Ray-casting algorithm. Walks each edge and counts horizontal crossings.
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function squareDistance(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

// Deterministic-ish jitter so the network is consistent across renders.
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 43758.5453;
  return x - Math.floor(x);
}

function buildNetwork(polygon: readonly [number, number][]) {
  const nodes: { x: number; y: number; id: number }[] = [];
  let id = 0;
  // Grid sampling + jitter + reject points outside the polygon.
  for (let gy = NODE_GRID_STEP / 2; gy < 1; gy += NODE_GRID_STEP) {
    for (let gx = NODE_GRID_STEP / 2; gx < 1; gx += NODE_GRID_STEP) {
      const jitterX = (pseudoRandom(id * 2) - 0.5) * NODE_JITTER * 2;
      const jitterY = (pseudoRandom(id * 2 + 1) - 0.5) * NODE_JITTER * 2;
      const point: [number, number] = [gx + jitterX, gy + jitterY];
      if (pointInPolygon(point, polygon)) {
        nodes.push({ x: point[0], y: point[1], id });
        id += 1;
      }
    }
  }

  // For each node find its k nearest neighbors (within max edge length) and
  // de-dupe the undirected edge set. O(n²) is fine — we're under 100 nodes.
  const edgeSet = new Set<string>();
  const edges: { a: number; b: number; phase: number }[] = [];
  for (const node of nodes) {
    const others = nodes
      .filter((other) => other.id !== node.id)
      .map((other) => ({
        other,
        dist: squareDistance([node.x, node.y], [other.x, other.y]),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, NODES_PER_NODE_EDGES);
    for (const { other, dist } of others) {
      if (Math.sqrt(dist) > MAX_EDGE_LENGTH) continue;
      const key = node.id < other.id ? `${node.id}-${other.id}` : `${other.id}-${node.id}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      // Each edge gets its own animation phase so the shimmers don't all
      // travel in lockstep.
      edges.push({ a: node.id, b: other.id, phase: pseudoRandom(edgeSet.size) });
    }
  }

  return { nodes, edges };
}

function polygonToPath(polygon: readonly [number, number][], scale: number): string {
  if (!polygon.length) return '';
  const [x0, y0] = polygon[0];
  let d = `M ${x0 * scale} ${y0 * scale}`;
  for (let i = 1; i < polygon.length; i += 1) {
    const [x, y] = polygon[i];
    d += ` L ${x * scale} ${y * scale}`;
  }
  return d + ' Z';
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MetroNeuralNet({
  metro,
  label,
  size = 240,
  className,
}: MetroNeuralNetProps) {
  const prefersReduced = useReducedMotion();
  const { nodes, edges } = useMemo(() => buildNetwork(metro.polygon), [metro.polygon]);
  const outlinePath = useMemo(
    () => polygonToPath(metro.polygon, size),
    [metro.polygon, size],
  );

  // Pulse seed cycles to vary which nodes are "active" each tick. Same
  // pseudo-random pick as the legacy loader so the visual rhythm matches.
  const [pulseSeed, setPulseSeed] = useState(0);
  useEffect(() => {
    if (prefersReduced) return;
    const id = setInterval(() => setPulseSeed((s) => s + 1), PULSE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [prefersReduced]);

  const pulseCount = Math.max(3, Math.min(8, Math.floor(nodes.length * 0.18)));
  const activeNodes = useMemo(() => {
    const out = new Set<number>();
    let s = pulseSeed * 9301 + 49297;
    while (out.size < pulseCount && out.size < nodes.length) {
      s = (s * 1103515245 + 12345) % 0x80000000;
      out.add(Math.abs(s) % nodes.length);
    }
    return out;
  }, [pulseSeed, pulseCount, nodes.length]);

  // SVG dimensions in user units — match `size` so the path math above is 1:1.
  const view = size;
  // Edge dash pattern: a single dash that travels along an otherwise dashed
  // line creates the "current of light" effect. Total path length is unknown
  // per edge, so we use a long gap so only one shimmer is visible at a time.
  const dashLength = size * 0.06;
  const gapLength = size * 0.42;

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      style={{
        perspective: `${size * 6}px`,
        perspectiveOrigin: '50% 55%',
      }}
    >
      <span style={SR_ONLY}>{label ?? `Scanning ${metro.name}`}</span>

      <div
        style={{
          width: size,
          height: size,
          margin: '0 auto',
          transformStyle: 'preserve-3d',
          transform: 'rotateX(18deg)',
          animation: prefersReduced
            ? undefined
            : `metro-rotate-y ${ROTATION_DURATION_S}s linear infinite`,
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${view} ${view}`} aria-hidden="true">
          <defs>
            <filter id="metro-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={size * 0.012} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="metro-outline-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={OUTLINE_COLOR} />
              <stop offset="100%" stopColor="rgba(0,230,118,0.05)" />
            </linearGradient>
          </defs>

          {/* Metro outline — soft glow, subtle so the mesh dominates. */}
          <path
            d={outlinePath}
            fill="rgba(0, 230, 118, 0.04)"
            stroke="url(#metro-outline-grad)"
            strokeWidth={1.4}
            strokeLinejoin="round"
          />

          {/* Edges — shimmering current effect. */}
          <g>
            {edges.map((edge, idx) => {
              const a = nodes[edge.a];
              const b = nodes[edge.b];
              if (!a || !b) return null;
              const x1 = a.x * size;
              const y1 = a.y * size;
              const x2 = b.x * size;
              const y2 = b.y * size;
              return (
                <g key={`edge-${idx}`}>
                  {/* Base edge — always visible at low opacity. */}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={EDGE_COLOR}
                    strokeWidth={0.9}
                  />
                  {/* Shimmering overlay. */}
                  {!prefersReduced && (
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={SHIMMER_COLOR}
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeDasharray={`${dashLength} ${gapLength}`}
                      style={{
                        animation: `metro-shimmer ${4 + edge.phase * 3}s linear infinite`,
                        animationDelay: `${edge.phase * -4}s`,
                      }}
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* Nodes — glowing dots, some pulsing. */}
          <g filter="url(#metro-glow)">
            {nodes.map((node) => {
              const cx = node.x * size;
              const cy = node.y * size;
              const isActive = activeNodes.has(node.id);
              return (
                <circle
                  key={`node-${node.id}`}
                  cx={cx}
                  cy={cy}
                  r={size * 0.0085}
                  fill={NODE_COLOR}
                  opacity={isActive ? 1 : 0.45}
                  style={
                    prefersReduced || !isActive
                      ? undefined
                      : {
                          animation: `metro-node-pulse ${PULSE_INTERVAL_MS}ms ease-in-out`,
                        }
                  }
                />
              );
            })}
          </g>
        </svg>
      </div>

      {label && (
        <p
          style={{
            marginTop: 16,
            fontSize: 14,
            color: '#BBBBBB',
            textAlign: 'center',
            fontFamily: "var(--font-body, 'DM Sans', system-ui, sans-serif)",
          }}
        >
          {label}
        </p>
      )}

      {/* Keyframes declared inline so the component is fully self-contained.
          metro-rotate-y → slow 3D Y rotation of the entire mesh.
          metro-shimmer  → travels the shimmer dash from start→end of edge.
          metro-node-pulse → quick fade up + back for the active nodes. */}
      <style jsx>{`
        @keyframes metro-rotate-y {
          0% { transform: rotateX(18deg) rotateY(0deg); }
          50% { transform: rotateX(18deg) rotateY(180deg); }
          100% { transform: rotateX(18deg) rotateY(360deg); }
        }
        @keyframes metro-shimmer {
          0% { stroke-dashoffset: ${size * 1.2}; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { stroke-dashoffset: ${-size * 0.4}; opacity: 0; }
        }
        @keyframes metro-node-pulse {
          0% { opacity: 0.3; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.35); }
          100% { opacity: 0.45; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  border: 0,
};

export default MetroNeuralNet;
