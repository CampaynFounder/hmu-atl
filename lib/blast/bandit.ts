// Stream E — bandit harness for blast matching weight presets.
// Per BLAST-V3-AGENT-CONTRACT.md §3 D-14 (Stage 1) + §6.6 + project-per-market-config.
//
// Two algorithms supported:
//   - ε-greedy (default, predictable revenue): exploits the best arm 90% of
//     the time, explores random arms 10% of the time.
//   - Thompson sampling (admin opt-in once data accumulates): samples each
//     arm's reward from a Beta posterior.
//
// Assignments are deterministic per (blastId, experimentId) so retries return
// the same arm — important for idempotent matching paths. The seed is the
// hash of the pair; an actual random byte from the seed picks explore-vs-exploit.
//
// Pure JS, no external deps. Logs to blast_experiment_log (caller's
// responsibility — keeps this module side-effect-free for testing).

export type BanditMode = 'epsilon_greedy' | 'thompson';

export interface BanditArm {
  /** Stable identifier for the arm. */
  id: string;
  /** Reward observations from completed blasts assigned this arm. */
  rewardSamples: number[];
}

export interface BanditAssignment {
  armId: string;
  /** Whether this assignment is exploitation (best arm) or exploration. */
  mode: 'exploit' | 'explore';
  /** The deterministic seed used for this assignment. */
  seed: string;
}

export interface AssignArmInput {
  blastId: string;
  experimentId: string;
  arms: BanditArm[];
  mode?: BanditMode;
  /** ε in ε-greedy. Default 0.1 (10% explore). */
  epsilon?: number;
}

/**
 * Pick an arm for a given blast deterministically.
 * Returns assignment with the chosen armId, mode (explore vs exploit), and seed.
 */
export function assignArm(input: AssignArmInput): BanditAssignment {
  const { blastId, experimentId, arms, mode = 'epsilon_greedy', epsilon = 0.1 } = input;
  if (arms.length === 0) {
    throw new Error('assignArm: arms cannot be empty');
  }
  if (arms.length === 1) {
    return { armId: arms[0].id, mode: 'exploit', seed: hash(`${blastId}:${experimentId}`) };
  }

  const seed = hash(`${blastId}:${experimentId}:${mode}`);

  if (mode === 'epsilon_greedy') {
    return assignEpsilonGreedy(arms, seed, epsilon);
  }
  return assignThompson(arms, seed);
}

// ─── ε-greedy ──────────────────────────────────────────────────────────────

function assignEpsilonGreedy(arms: BanditArm[], seed: string, epsilon: number): BanditAssignment {
  const r = pseudoRandom(seed);
  if (r < epsilon) {
    // Explore: uniform random over all arms.
    const idx = Math.floor(pseudoRandom(`${seed}:explore`) * arms.length);
    return { armId: arms[idx].id, mode: 'explore', seed };
  }
  // Exploit: pick arm with highest mean reward (ties broken by id for determinism).
  const best = [...arms].sort((a, b) => {
    const ma = mean(a.rewardSamples);
    const mb = mean(b.rewardSamples);
    if (mb !== ma) return mb - ma;
    return a.id.localeCompare(b.id);
  })[0];
  return { armId: best.id, mode: 'exploit', seed };
}

// ─── Thompson sampling ────────────────────────────────────────────────────

function assignThompson(arms: BanditArm[], seed: string): BanditAssignment {
  // Treat each arm's rewards as Bernoulli wins (reward > median => 1) for the
  // Beta posterior. Crude but effective for non-binary rewards; admin can
  // switch to ε-greedy if this isn't the right shape for their reward fn.
  const allRewards = arms.flatMap((a) => a.rewardSamples);
  const median = allRewards.length > 0
    ? [...allRewards].sort((a, b) => a - b)[Math.floor(allRewards.length / 2)]
    : 0;

  let bestArmId = arms[0].id;
  let bestSample = -Infinity;
  arms.forEach((arm, i) => {
    const wins = arm.rewardSamples.filter((r) => r > median).length;
    const losses = arm.rewardSamples.length - wins;
    const sample = sampleBeta(wins + 1, losses + 1, `${seed}:${i}`);
    if (sample > bestSample) {
      bestSample = sample;
      bestArmId = arm.id;
    }
  });
  return { armId: bestArmId, mode: 'exploit', seed };
}

/**
 * Beta distribution sampler using the inverse-CDF approximation for small
 * (alpha, beta) — accurate enough for the small-sample posterior we expect
 * in the early days. For larger samples, the central limit theorem makes
 * this approach increasingly accurate.
 */
function sampleBeta(alpha: number, beta: number, seed: string): number {
  // Use ratio of Gammas: Beta(α, β) = X / (X + Y) where X~Gamma(α), Y~Gamma(β).
  // For integer-valued α, β, Gamma(k) = sum of k exponentials.
  const x = sampleGamma(alpha, `${seed}:a`);
  const y = sampleGamma(beta, `${seed}:b`);
  return x / (x + y);
}

function sampleGamma(shape: number, seed: string): number {
  // Sum of `shape` exponentials with rate 1.
  let sum = 0;
  for (let i = 0; i < Math.ceil(shape); i++) {
    const u = Math.max(1e-10, pseudoRandom(`${seed}:${i}`));
    sum += -Math.log(u);
  }
  return sum;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** djb2-ish 32-bit hash of a string, returned as hex. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/** Deterministic pseudo-random number in [0,1) from a string seed. */
function pseudoRandom(seed: string): number {
  const h = parseInt(hash(seed), 16);
  return (h % 1_000_000) / 1_000_000;
}
