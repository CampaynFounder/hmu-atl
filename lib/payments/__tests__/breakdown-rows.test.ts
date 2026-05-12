// buildBreakdownRows() identity tests for each strategy.
//
// The contract every strategy must keep:
//   sum(non-`youEarned` rows aside from the `total` row itself) === total
//   The `total` row value is the grand total of money moved on this ride.

import { describe, it, expect } from 'vitest';
import { depositOnlyStrategy } from '../strategies/deposit-only';
import { legacyFullFareStrategy } from '../strategies/legacy-full-fare';
import type { BreakdownInput } from '../strategies/types';

const baseInput: BreakdownInput = {
  isCash: false,
  agreedPrice: 20,
  visibleDeposit: 10,
  addOnTotal: 0,
  driverPayoutAmount: 8,
  platformFeeAmount: 2,
  stripeFeeAmount: 0,
  extrasDriverAmount: 0,
  extrasPlatformFee: 0,
  extrasStripeFee: 0,
  extras: [],
};

function sumNonTotal(rows: { label: string; value: number; role: string }[]): number {
  return rows
    .filter(r => r.role !== 'total')
    .reduce((s, r) => s + r.value, 0);
}

describe('DepositOnlyStrategy.buildBreakdownRows', () => {
  it('digital ride: deposit + extras + hmu + stripe + cash === total', () => {
    const out = depositOnlyStrategy.buildBreakdownRows({
      ...baseInput,
      addOnTotal: 6,
      extrasDriverAmount: 4.8,
      extrasPlatformFee: 1.2,
      extrasStripeFee: 0.47,
    });
    expect(out.modeKey).toBe('deposit_only');
    expect(out.isCash).toBe(false);
    expect(sumNonTotal(out.rows)).toBeCloseTo(out.total, 2);
    // youEarned = depositReceived + extrasPaid + cashReceived
    expect(out.youEarned).toBeCloseTo(8 + 4.8 + 10, 2);
  });

  it('cash ride: collapses to a single Cash Received total row', () => {
    const out = depositOnlyStrategy.buildBreakdownRows({
      ...baseInput,
      isCash: true,
      addOnTotal: 5,
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].label).toBe('Cash Received');
    expect(out.rows[0].value).toBe(25);
    expect(out.total).toBe(25);
    expect(out.youEarned).toBe(25);
  });

  it('marks HMU Split + Stripe Fee as driver_only', () => {
    const out = depositOnlyStrategy.buildBreakdownRows(baseInput);
    const driverOnly = out.rows.filter(r => r.audience === 'driver_only').map(r => r.label);
    expect(driverOnly).toEqual(expect.arrayContaining(['HMU Split', 'Stripe Fee']));
  });
});

describe('LegacyFullFareStrategy.buildBreakdownRows', () => {
  it('digital ride: fare + add-ons === total; driver_net + hmu + stripe must reconcile', () => {
    const out = legacyFullFareStrategy.buildBreakdownRows({
      ...baseInput,
      agreedPrice: 20,
      addOnTotal: 5,
      driverPayoutAmount: 22,
      platformFeeAmount: 2.5,
      stripeFeeAmount: 0.5,
    });
    expect(out.modeKey).toBe('legacy_full_fare');
    expect(out.total).toBeCloseTo(25, 2);
    // Headline = driver's net (legacy semantic)
    expect(out.youEarned).toBeCloseTo(22, 2);
    // Driver_net + hmu_split + stripe_fee should equal total (money conservation)
    const driverNet = out.rows.find(r => r.label === 'You Kept')?.value ?? 0;
    const hmu = out.rows.find(r => r.label === 'HMU Split')?.value ?? 0;
    const stripe = out.rows.find(r => r.label === 'Stripe Fee')?.value ?? 0;
    expect(driverNet + hmu + stripe).toBeCloseTo(25, 2);
  });

  it('cash ride: single Cash Received row', () => {
    const out = legacyFullFareStrategy.buildBreakdownRows({
      ...baseInput,
      isCash: true,
      addOnTotal: 3,
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].label).toBe('Cash Received');
    expect(out.total).toBe(23);
  });
});
