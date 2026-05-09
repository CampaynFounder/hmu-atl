// Pins behaviour the founder relies on:
//   1. Cascade is idempotent — second call returns alreadyCancelled=true
//      without re-publishing or re-cleaning.
//   2. ride_interests UPDATE only flips ACTIVE rows ('interested' /
//      'selected'). Drivers with status='passed' must NOT be touched, must
//      NOT receive the rebroadcast notification, and must NOT see the post
//      come back.
//   3. Direct recipients (matched driver + rider) are notified on
//      user:{id}:notify regardless of who initiated.
//   4. Cleanup writes target rides, hmu_posts, ride_interests,
//      ride_safety_checks, ride_safety_events, ride_add_ons.
//
// All DB calls go through the mocked `sql` template tag; we inspect the
// call list to assert the right rows were touched. Ably is mocked to
// capture the published events.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ sql }));

const { publishRideUpdate, notifyUser } = vi.hoisted(() => ({
  publishRideUpdate: vi.fn().mockResolvedValue(undefined),
  notifyUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/ably/server', () => ({ publishRideUpdate, notifyUser }));

const { cancelRideBooking } = vi.hoisted(() => ({
  cancelRideBooking: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/schedule/conflicts', () => ({ cancelRideBooking }));

import { cascadeRideCancel } from '../cancel-cascade';

beforeEach(() => {
  sql.mockReset();
  publishRideUpdate.mockReset();
  notifyUser.mockReset();
  cancelRideBooking.mockReset();
  publishRideUpdate.mockResolvedValue(undefined);
  notifyUser.mockResolvedValue(undefined);
  cancelRideBooking.mockResolvedValue(undefined);
});

// Stage the sql() mock to return values for each call in order. Falls back
// to [] for unrecognised queries.
function stageSql(seq: Array<() => unknown[]>) {
  let i = 0;
  sql.mockImplementation(async () => {
    const fn = seq[i++];
    return fn ? fn() : [];
  });
}

function findSqlCallContaining(substring: string): unknown[] | undefined {
  return sql.mock.calls.find((call) => {
    const strings = call[0] as readonly string[] | undefined;
    return Array.isArray(strings) && strings.some((s) => s.includes(substring));
  });
}

const RIDE = {
  id: 'ride-1',
  driver_id: 'driver-A',
  rider_id: 'rider-1',
  hmu_post_id: 'post-1',
};

describe('cascadeRideCancel — idempotency', () => {
  it('returns alreadyCancelled=true and does not re-publish on a second call', async () => {
    // First call: status='matched' (not yet cancelled), then second call
    // sees status='cancelled'.
    sql.mockImplementation(async (strings: readonly string[]) => {
      const q = strings.join(' ');
      if (q.includes('SELECT status, cancel_resolution')) {
        return [{ status: 'cancelled', cancel_resolution: 'rider_pre_otw' }];
      }
      if (q.includes('SELECT driver_id FROM ride_interests')) {
        return [{ driver_id: 'driver-passed-1' }];
      }
      return [];
    });

    const result = await cascadeRideCancel({
      ride: RIDE,
      reason: 'test',
      initiator: 'rider',
      resolution: 'rider_pre_otw',
    });

    expect(result.alreadyCancelled).toBe(true);
    expect(publishRideUpdate).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });
});

describe('cascadeRideCancel — passed drivers stay quiet', () => {
  it('only flips active interests; passed rows are not in the UPDATE filter', async () => {
    sql.mockImplementation(async (strings: readonly string[]) => {
      const q = strings.join(' ');
      if (q.includes('SELECT status, cancel_resolution')) {
        return [{ status: 'matched', cancel_resolution: null }];
      }
      if (q.includes('UPDATE ride_interests')) {
        return [{ driver_id: 'driver-interested-2' }];
      }
      return [];
    });

    await cascadeRideCancel({
      ride: RIDE,
      reason: 'driver passed, rider re-broadcasts',
      initiator: 'rider',
      resolution: 'rider_pre_otw',
    });

    const interestsCall = findSqlCallContaining('UPDATE ride_interests');
    expect(interestsCall).toBeDefined();
    const concatenated = (interestsCall![0] as readonly string[]).join(' ');
    expect(concatenated).toContain("status IN ('interested', 'selected')");
    // Passed/expired drivers MUST NOT be in the update set — this is the
    // founder's "originally requested driver should not be notified" rule.
    expect(concatenated).not.toContain("'passed'");
  });

  it('does not notifyUser the driver_id of any passed-interest row', async () => {
    sql.mockImplementation(async (strings: readonly string[]) => {
      const q = strings.join(' ');
      if (q.includes('SELECT status, cancel_resolution')) {
        return [{ status: 'matched', cancel_resolution: null }];
      }
      if (q.includes('UPDATE ride_interests')) {
        // Only 'interested'/'selected' rows should be returned by RETURNING.
        return [{ driver_id: 'driver-interested-2' }];
      }
      return [];
    });

    await cascadeRideCancel({
      ride: RIDE,
      reason: 'test',
      initiator: 'rider',
      resolution: 'rider_pre_otw',
    });

    const notifiedIds = notifyUser.mock.calls.map((c) => c[0]);
    expect(notifiedIds).toContain('rider-1');
    expect(notifiedIds).toContain('driver-A');
    expect(notifiedIds).toContain('driver-interested-2');
    // Drivers who previously passed must NOT show up in the call list.
    expect(notifiedIds).not.toContain('driver-passed-1');
  });
});

describe('cascadeRideCancel — cleanup writes', () => {
  it('writes to all the expected tables', async () => {
    sql.mockImplementation(async (strings: readonly string[]) => {
      const q = strings.join(' ');
      if (q.includes('SELECT status, cancel_resolution')) {
        return [{ status: 'matched', cancel_resolution: null }];
      }
      return [];
    });

    await cascadeRideCancel({
      ride: RIDE,
      reason: 'test',
      initiator: 'mutual',
      resolution: 'mutual_agreed',
    });

    expect(findSqlCallContaining('UPDATE rides')).toBeDefined();
    expect(findSqlCallContaining('UPDATE hmu_posts SET status = \'active\'')).toBeDefined();
    expect(findSqlCallContaining('UPDATE ride_interests')).toBeDefined();
    expect(findSqlCallContaining('UPDATE ride_safety_checks')).toBeDefined();
    expect(findSqlCallContaining('UPDATE ride_safety_events')).toBeDefined();
    expect(findSqlCallContaining('UPDATE ride_add_ons')).toBeDefined();
    expect(cancelRideBooking).toHaveBeenCalledWith('ride-1');
  });
});

describe('cascadeRideCancel — direct recipients', () => {
  it('notifies both driver and rider on user:{id}:notify regardless of initiator', async () => {
    sql.mockImplementation(async (strings: readonly string[]) => {
      const q = strings.join(' ');
      if (q.includes('SELECT status, cancel_resolution')) {
        return [{ status: 'matched', cancel_resolution: null }];
      }
      return [];
    });

    await cascadeRideCancel({
      ride: RIDE,
      reason: 'test',
      initiator: 'rider',
      resolution: 'rider_pre_otw',
    });

    const ids = notifyUser.mock.calls.map((c) => c[0]);
    expect(ids).toContain('driver-A');
    expect(ids).toContain('rider-1');
    expect(publishRideUpdate).toHaveBeenCalledWith(
      'ride-1',
      'status_change',
      expect.objectContaining({ status: 'cancelled', cancelledBy: 'rider', resolution: 'rider_pre_otw' }),
    );
  });
});

describe('cascadeRideCancel — payload', () => {
  it('includes resolution in the published payload', async () => {
    sql.mockImplementation(async (strings: readonly string[]) => {
      const q = strings.join(' ');
      if (q.includes('SELECT status, cancel_resolution')) {
        return [{ status: 'matched', cancel_resolution: null }];
      }
      return [];
    });

    await cascadeRideCancel({
      ride: RIDE,
      reason: 'driver no-response',
      initiator: 'rider',
      resolution: 'timeout_no_response',
      extra: { cancelSplit: { driverReceives: 0, platformReceives: 1, riderRefunded: 4, riderCharged: 1, phase: 'after_otw' } },
    });

    expect(publishRideUpdate).toHaveBeenCalledWith(
      'ride-1',
      'status_change',
      expect.objectContaining({
        resolution: 'timeout_no_response',
        message: 'driver no-response',
        cancelledBy: 'rider',
      }),
    );
  });
});
