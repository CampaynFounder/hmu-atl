// buildBreakdownRows() identity tests for each strategy.
//
// Contract every strategy must keep for digital rides:
//   driver-side: sum(driverRows non-total) === total === sum(riderRows non-total)
// In other words: rider's "what I paid" total === driver's "ride total" ===
// what the rider's card was actually charged ($agreedPrice + succeeded extras).

import { describe, it, expect } from 'vitest';
import { depositOnlyStrategy } from '../strategies/deposit-only';
import { legacyFullFareStrategy } from '../strategies/legacy-full-fare';
import type { BreakdownInput, BreakdownRow } from '../strategies/types';

const baseInput: BreakdownInput = {
  isCash: false,
  agreedPrice: 25,
  visibleDeposit: 12.5,
  addOnTotal: 0,
  driverPayoutAmount: 10,
  platformFeeAmount: 2.5,
  stripeFeeAmount: 0.66,
  extrasDriverAmount: 0,
  extrasPlatformFee: 0,
  extrasStripeFee: 0,
  extras: [],
};

function sumNonTotal(rows: BreakdownRow[]): number {
  return rows
    .filter(r => r.role !== 'total')
    .reduce((s, r) => s + r.value, 0);
}

function getTotal(rows: BreakdownRow[]): number {
  return rows.find(r => r.role === 'total')?.value ?? 0;
}

describe('DepositOnlyStrategy.buildBreakdownRows', () => {
  it('digital ride: driverRows sum === total === riderRows sum === rider charge', () => {
    const out = depositOnlyStrategy.buildBreakdownRows({
      ...baseInput,
      addOnTotal: 6,
      extrasDriverAmount: 4.8,
      extrasPlatformFee: 1.2,
      extrasStripeFee: 0.78,
      extras: [
        { id: 'e1', name: 'Stop', subtotal: 3, driverAmount: 2.4, platformFee: 0.6, status: 'confirmed', chargeStatus: 'succeeded' },
        { id: 'e2', name: 'Stop', subtotal: 3, driverAmount: 2.4, platformFee: 0.6, status: 'confirmed', chargeStatus: 'succeeded' },
      ],
    });

    expect(out.modeKey).toBe('deposit_only');
    expect(out.total).toBeCloseTo(31, 2); // $25 fare + $6 extras
    // Identity: driver-side sum reconciles to total
    expect(sumNonTotal(out.driverRows)).toBeCloseTo(out.total, 2);
    // Identity: rider-side sum reconciles to total
    expect(sumNonTotal(out.riderRows)).toBeCloseTo(out.total, 2);
    // Driver headline = deposit + extras + cash
    expect(out.youEarned).toBeCloseTo(10 + 4.8 + 12.5, 2);
  });

  it('rider rows use rider-POV values (Deposit Paid = visibleDeposit, not driver share)', () => {
    const out = depositOnlyStrategy.buildBreakdownRows(baseInput);
    const depositPaid = out.riderRows.find(r => r.label === 'Deposit Paid')?.value;
    // Rider paid $12.50 deposit; driver received $10 net. Label + value
    // must be from rider's POV.
    expect(depositPaid).toBe(12.5);
  });

  it('rider rows exclude HMU Split + Stripe Fee', () => {
    const out = depositOnlyStrategy.buildBreakdownRows(baseInput);
    const labels = out.riderRows.map(r => r.label);
    expect(labels).not.toContain('HMU Split');
    expect(labels).not.toContain('Stripe Fee');
  });

  it('failed extras excluded from rider total', () => {
    const out = depositOnlyStrategy.buildBreakdownRows({
      ...baseInput,
      addOnTotal: 6,
      extras: [
        { id: 'e1', name: 'Stop', subtotal: 3, driverAmount: 2.4, platformFee: 0.6, status: 'confirmed', chargeStatus: 'succeeded' },
        { id: 'e2', name: 'Stop', subtotal: 3, driverAmount: 0, platformFee: 0, status: 'pending_driver', chargeStatus: 'failed' },
      ],
      extrasDriverAmount: 2.4,
      extrasPlatformFee: 0.6,
      extrasStripeFee: 0.39,
    });
    // Failed extra ($3) does NOT count toward what the rider paid.
    expect(out.total).toBeCloseTo(25 + 3, 2);
    expect(getTotal(out.riderRows)).toBeCloseTo(28, 2);
  });

  it('hmuSplit on driver rows is NET of Stripe fee, not gross', () => {
    const out = depositOnlyStrategy.buildBreakdownRows({
      ...baseInput,
      platformFeeAmount: 2.5,
      stripeFeeAmount: 0.66,
    });
    const hmu = out.driverRows.find(r => r.label === 'HMU Split')?.value ?? 0;
    const stripe = out.driverRows.find(r => r.label === 'Stripe Fee')?.value ?? 0;
    // gross = 2.50, stripe = 0.66 → net = 1.84
    expect(hmu).toBeCloseTo(1.84, 2);
    expect(stripe).toBeCloseTo(0.66, 2);
    // And gross is conserved: net + stripe = original app fee
    expect(hmu + stripe).toBeCloseTo(2.5, 2);
  });

  it('cash ride collapses to a single row on both sides', () => {
    const out = depositOnlyStrategy.buildBreakdownRows({
      ...baseInput,
      isCash: true,
      addOnTotal: 5,
    });
    expect(out.driverRows).toHaveLength(1);
    expect(out.riderRows).toHaveLength(1);
    expect(out.driverRows[0].value).toBe(30);
    expect(out.riderRows[0].value).toBe(30);
    expect(out.total).toBe(30);
  });
});

describe('LegacyFullFareStrategy.buildBreakdownRows', () => {
  it('digital ride: driverRows sum === total === riderRows sum', () => {
    // Money conservation: driver + gross_app_fee = captured. Gross app fee
    // splits into platform NET + Stripe processing fee.
    const out = legacyFullFareStrategy.buildBreakdownRows({
      ...baseInput,
      agreedPrice: 20,
      addOnTotal: 5,
      driverPayoutAmount: 22.5,
      platformFeeAmount: 2.5,
      stripeFeeAmount: 0.5,
    });
    expect(out.total).toBeCloseTo(25, 2);
    expect(sumNonTotal(out.driverRows)).toBeCloseTo(out.total, 2);
    expect(sumNonTotal(out.riderRows)).toBeCloseTo(out.total, 2);
    expect(out.youEarned).toBeCloseTo(22.5, 2);
  });

  it('rider only sees Fare Paid + Add-ons + Total', () => {
    const out = legacyFullFareStrategy.buildBreakdownRows({
      ...baseInput,
      agreedPrice: 20,
      addOnTotal: 5,
      driverPayoutAmount: 22.5,
      platformFeeAmount: 2.5,
      stripeFeeAmount: 0.5,
    });
    expect(out.riderRows.map(r => r.label)).toEqual(['Fare Paid', 'Add-ons', 'Total']);
  });

  it('cash ride: single row each side', () => {
    const out = legacyFullFareStrategy.buildBreakdownRows({
      ...baseInput,
      isCash: true,
      addOnTotal: 3,
    });
    expect(out.driverRows).toHaveLength(1);
    expect(out.riderRows).toHaveLength(1);
    expect(out.total).toBe(28); // $25 base + $3 addons
  });
});
