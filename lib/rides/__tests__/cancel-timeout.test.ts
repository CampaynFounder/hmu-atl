// Pins behaviour for the cancel-request timeout resolution helper:
//   1. Returns noop_not_yet when cancel_requested_at is younger than the
//      configured window — prevents premature timeout from a misfiring
//      client clock.
//   2. Returns noop_already_resolved when cancel_resolution is already set,
//      i.e. the driver already actively decided. Concurrent fires don't
//      double-charge.
//   3. Conditional UPDATE on cancel_resolution IS NULL is the resolution
//      claim — only the call that wins the race runs the cascade.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ sql }));

const { partialCaptureDeposit } = vi.hoisted(() => ({
  partialCaptureDeposit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/payments/escrow', () => ({ partialCaptureDeposit }));

const { cascadeRideCancel } = vi.hoisted(() => ({
  cascadeRideCancel: vi.fn().mockResolvedValue({ interestedDriverIds: [], alreadyCancelled: false }),
}));
vi.mock('../cancel-cascade', () => ({ cascadeRideCancel }));

vi.mock('@/lib/platform-config/get', () => ({
  getPlatformConfig: vi.fn().mockImplementation(async (key: string, defaults: Record<string, unknown>) => {
    if (key === 'cancellation.request_timeout_seconds') return { ...defaults, value: 180 };
    if (key === 'cancellation.timeout_rider_fee_pct') return { ...defaults, value: 0.2 };
    return defaults;
  }),
}));

import { resolveCancelTimeout } from '../cancel-timeout';

beforeEach(() => {
  sql.mockReset();
  partialCaptureDeposit.mockReset();
  cascadeRideCancel.mockReset();
  partialCaptureDeposit.mockResolvedValue(undefined);
  cascadeRideCancel.mockResolvedValue({ interestedDriverIds: [], alreadyCancelled: false });
});

const RIDE_ID = 'ride-timeout-1';

function rideRow(overrides: Partial<{
  status: string;
  cancel_requested_at: Date | null;
  cancel_resolution: string | null;
  visible_deposit: number;
}>) {
  return {
    id: RIDE_ID,
    driver_id: 'driver-A',
    rider_id: 'rider-1',
    hmu_post_id: 'post-1',
    status: 'otw',
    cancel_requested_at: new Date(Date.now() - 200_000), // older than 180s
    cancel_requested_by: 'rider',
    cancel_resolution: null,
    visible_deposit: 5,
    ...overrides,
  };
}

describe('resolveCancelTimeout', () => {
  it('returns noop_not_requested when there is no cancel_requested_at', async () => {
    sql.mockImplementation(async () => [rideRow({ cancel_requested_at: null })]);
    const result = await resolveCancelTimeout(RIDE_ID);
    expect(result.status).toBe('noop_not_requested');
    expect(cascadeRideCancel).not.toHaveBeenCalled();
    expect(partialCaptureDeposit).not.toHaveBeenCalled();
  });

  it('returns noop_already_resolved when cancel_resolution is already set', async () => {
    sql.mockImplementation(async () => [rideRow({ cancel_resolution: 'mutual_agreed' })]);
    const result = await resolveCancelTimeout(RIDE_ID);
    expect(result.status).toBe('noop_already_resolved');
    expect(result.resolution).toBe('mutual_agreed');
    expect(cascadeRideCancel).not.toHaveBeenCalled();
    expect(partialCaptureDeposit).not.toHaveBeenCalled();
  });

  it('returns noop_not_yet when cancel_requested_at is younger than timeout window', async () => {
    sql.mockImplementation(async () => [
      rideRow({ cancel_requested_at: new Date(Date.now() - 60_000) }), // 60s old, window=180s
    ]);
    const result = await resolveCancelTimeout(RIDE_ID);
    expect(result.status).toBe('noop_not_yet');
    expect(result.ageSeconds).toBeGreaterThanOrEqual(59);
    expect(result.ageSeconds).toBeLessThan(180);
    expect(cascadeRideCancel).not.toHaveBeenCalled();
  });

  it('captures fee, refunds rest, runs cascade with timeout_no_response when stale', async () => {
    let call = 0;
    sql.mockImplementation(async (strings: readonly string[]) => {
      call++;
      const q = strings.join(' ');
      if (q.includes('FROM rides WHERE id') && call === 1) {
        return [rideRow({})];
      }
      if (q.includes('UPDATE rides') && q.includes('cancel_resolution = \'timeout_no_response\'')) {
        return [{ id: RIDE_ID }]; // claimed
      }
      return [];
    });

    const result = await resolveCancelTimeout(RIDE_ID);

    expect(result.status).toBe('cancelled');
    expect(result.resolution).toBe('timeout_no_response');
    expect(result.platformReceives).toBeCloseTo(1.0); // 0.20 * 5
    expect(result.riderRefunded).toBeCloseTo(4.0);
    expect(partialCaptureDeposit).toHaveBeenCalledWith(RIDE_ID, 0, 1.0);
    expect(cascadeRideCancel).toHaveBeenCalledWith(
      expect.objectContaining({
        resolution: 'timeout_no_response',
        initiator: 'rider',
      }),
    );
  });

  it('reports already_resolved when the conditional UPDATE returns no rows (race lost)', async () => {
    let call = 0;
    sql.mockImplementation(async (strings: readonly string[]) => {
      call++;
      const q = strings.join(' ');
      if (call === 1 && q.includes('FROM rides WHERE id')) {
        return [rideRow({})];
      }
      if (q.includes('UPDATE rides') && q.includes('cancel_resolution = \'timeout_no_response\'')) {
        return []; // lost the race; another caller already claimed
      }
      if (q.includes('SELECT cancel_resolution FROM rides')) {
        return [{ cancel_resolution: 'driver_declined_kept_deposit' }];
      }
      return [];
    });

    const result = await resolveCancelTimeout(RIDE_ID);
    expect(result.status).toBe('noop_already_resolved');
    expect(result.resolution).toBe('driver_declined_kept_deposit');
    expect(partialCaptureDeposit).not.toHaveBeenCalled();
    expect(cascadeRideCancel).not.toHaveBeenCalled();
  });
});
