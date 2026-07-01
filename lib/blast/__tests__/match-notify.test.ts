// Pins the blast → ride realtime crossover (P0-1). When a blast becomes a real
// `rides` row (select / pull-up), the ride channel AND the rider's app-wide
// notify rail (in-app + OS push) MUST be published, so a rider who left the
// offer board still gets their ActiveRideBar lit + /rides/active reconciled, and
// a backgrounded/closed device gets a push that taps into the ride — parity with
// direct booking. Before this fix, the crossover published only driver-facing
// events, so the rider's own app had no realtime signal that their ride went live.
//
// Ably + notify are mocked (same pattern as lib/rides/__tests__/cancel-cascade.test.ts);
// we inspect the published events.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { publishRideUpdate } = vi.hoisted(() => ({
  publishRideUpdate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/ably/server', () => ({ publishRideUpdate }));

const { notifyUserWithPush } = vi.hoisted(() => ({
  notifyUserWithPush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/notify', () => ({ notifyUserWithPush }));

import { publishRideMatched } from '../match-notify';

beforeEach(() => {
  publishRideUpdate.mockReset().mockResolvedValue(undefined);
  notifyUserWithPush.mockReset().mockResolvedValue(undefined);
});

describe('publishRideMatched — blast → ride crossover (P0-1)', () => {
  it('publishes status_change on the ride channel for contract parity with direct booking', async () => {
    await publishRideMatched('ride-1', 'rider-1');
    expect(publishRideUpdate).toHaveBeenCalledTimes(1);
    expect(publishRideUpdate).toHaveBeenCalledWith('ride-1', 'status_change', { status: 'matched' });
  });

  it("notifies the RIDER on their app-wide rail with ride_update {status:matched} — the core fix", async () => {
    await publishRideMatched('ride-1', 'rider-1');
    expect(notifyUserWithPush).toHaveBeenCalledTimes(1);
    const [userId, event, data] = notifyUserWithPush.mock.calls[0];
    expect(userId).toBe('rider-1');
    expect(event).toBe('ride_update');
    expect(data).toEqual({ rideId: 'ride-1', status: 'matched' });
  });

  it('targets the notify channel with the passed rider id (must be the DB users.id, not the Clerk id)', async () => {
    await publishRideMatched('ride-1', 'db-uuid-rider-99');
    expect(notifyUserWithPush.mock.calls[0][0]).toBe('db-uuid-rider-99');
  });

  it('includes an OS push whose data.type=ride_update + rideId so a cold tap routes into the active ride', async () => {
    await publishRideMatched('ride-42', 'rider-1');
    const push = notifyUserWithPush.mock.calls[0][3];
    expect(push).toBeTruthy();
    expect(push.title).toBeTruthy();
    expect(push.body).toBeTruthy();
    expect(push.data).toMatchObject({ type: 'ride_update', rideId: 'ride-42' });
  });

  it('sends ride_update with camelCase rideId, matching every direct ride route payload', async () => {
    await publishRideMatched('ride-42', 'rider-1');
    expect(notifyUserWithPush.mock.calls[0][2]).toHaveProperty('rideId', 'ride-42');
  });

  it('resolves (never rejects) even if a rail fails — one failing publish must not block the response or the other rail', async () => {
    notifyUserWithPush.mockRejectedValueOnce(new Error('ably down'));
    await expect(publishRideMatched('ride-1', 'rider-1')).resolves.toBeUndefined();
    // The ride channel publish still went out despite the notify failure.
    expect(publishRideUpdate).toHaveBeenCalledTimes(1);
  });
});
