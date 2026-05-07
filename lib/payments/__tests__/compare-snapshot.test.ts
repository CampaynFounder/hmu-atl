import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ sql, pool: null, transaction: vi.fn() }));

import { _clearDepositOnlyConfigCache, DEFAULT_DEPOSIT_ONLY_CONFIG } from '../strategies/deposit-only';
import { getCompareSnapshot } from '../strategies/compare-snapshot';

beforeEach(() => {
  sql.mockReset();
  _clearDepositOnlyConfigCache();
  sql.mockResolvedValue([{ config: DEFAULT_DEPOSIT_ONLY_CONFIG }]);
});

describe('getCompareSnapshot', () => {
  it('derives HMU grid cells from the live deposit-only config (no hardcoded numbers)', async () => {
    const snap = await getCompareSnapshot(20);
    // Defaults: 20% fee, $1.50 floor, demo deposit fraction = 40% → $8 deposit on $20 fare.
    // Fee = max(150, 0.20 * 800) = 160 cents = $1.60.
    // Driver = $20 - $1.60 platform fee = $18.40 (since rest is cash collected by driver).
    expect(snap.gridCells.feeShare).toBe('20% of deposit (min $1.50)');
    expect(snap.gridCells.monthlyCost).toBe('$0');
    expect(snap.gridCells.joinCost).toBe('Free forever');
    expect(snap.gridCells.youKeepExample).toBe('$18.40');
  });

  it('produces a worked-example scenario with self-consistent numbers', async () => {
    const snap = await getCompareSnapshot(20);
    expect(snap.scenario.rideTotal).toBe('$20.00');
    expect(snap.scenario.platformTake).toBe('$1.60');
    expect(snap.scenario.driverKeeps).toBe('$18.40');
    expect(snap.scenario.breakdown).toContain('$8.00 deposit');
    expect(snap.scenario.breakdown).toContain('$1.60 platform fee');
    expect(snap.scenario.breakdown).toContain('$6.40 to driver in app');
    expect(snap.scenario.breakdown).toContain('$12.00 cash');
  });

  it('renders the FAQ "what does HMU take" answer from config (live values)', async () => {
    const snap = await getCompareSnapshot(20);
    expect(snap.hmuTakeAnswer).toContain('20% of the deposit');
    expect(snap.hmuTakeAnswer).toContain('$1.50 minimum');
    expect(snap.hmuTakeAnswer).toContain('$20.00 ride');
  });

  it('reflects a tuned config with no code change (proves single source of truth)', async () => {
    sql.mockResolvedValue([
      {
        config: {
          ...DEFAULT_DEPOSIT_ONLY_CONFIG,
          feePercent: 0.15,
          feeFloorCents: 200,
        },
      },
    ]);
    const snap = await getCompareSnapshot(20);
    // 20% → 15%, floor $1.50 → $2.00. $8 deposit → 0.15 × 800 = 120 cents; floor 200 wins.
    expect(snap.gridCells.feeShare).toBe('15% of deposit (min $2.00)');
    expect(snap.scenario.platformTake).toBe('$2.00');
    // Driver = $20 fare - $2.00 fee = $18.00.
    expect(snap.scenario.driverKeeps).toBe('$18.00');
    expect(snap.hmuTakeAnswer).toContain('15% of the deposit');
  });

  it('falls back to default fare on bad input', async () => {
    const snap = await getCompareSnapshot(NaN);
    expect(snap.scenario.rideTotal).toBe('$20.00');
    expect(snap.exampleFareLabel).toBe('$20.00');
  });

  it('respects an admin-tuned example fare', async () => {
    const snap = await getCompareSnapshot(50);
    // Demo fraction 40% × $50 = $20 deposit (clamped to 50% cap = $25 — request below cap, used).
    // Fee = max(150, 0.20 × 2000) = 400 cents = $4.00.
    // Driver kept = $50 - $4.00 = $46.00.
    expect(snap.scenario.rideTotal).toBe('$50.00');
    expect(snap.scenario.platformTake).toBe('$4.00');
    expect(snap.scenario.driverKeeps).toBe('$46.00');
  });
});
