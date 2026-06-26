// Parity harness — enforces "both sides of a direct ride progress in parallel".
//
// Two invariants are pinned here:
//   1. CONTRACT: every stage in STAGE_CONTRACT notifies BOTH parties and gives
//      BOTH sides a non-empty realtime surface. This is the spec that routes +
//      clients must satisfy; if someone adds a stage that notifies only one
//      side, this test fails.
//   2. FAN-OUT: publishRideTransition() actually reaches the ride channel AND
//      both user:{id}:notify channels AND admin. This is the structural helper
//      that makes (1) impossible to violate per-route — proven against the real
//      Ably REST fan-out (fetch is mocked to capture the channels hit).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STAGE_CONTRACT, resolveStage, isInboundOrLater } from '../stage-contract';
import { publishRideTransition } from '@/lib/ably/server';

describe('stage contract — parallel-notification invariant', () => {
  it('every stage notifies both the rider and the driver', () => {
    for (const [stage, c] of Object.entries(STAGE_CONTRACT)) {
      expect(c.notifies, `stage '${stage}' must notify the rider`).toContain('rider');
      expect(c.notifies, `stage '${stage}' must notify the driver`).toContain('driver');
    }
  });

  it('every stage gives both sides a non-empty realtime surface', () => {
    for (const [stage, c] of Object.entries(STAGE_CONTRACT)) {
      expect(c.riderSurface.length, `stage '${stage}' rider surface`).toBeGreaterThan(0);
      expect(c.driverSurface.length, `stage '${stage}' driver surface`).toBeGreaterThan(0);
    }
  });

  it('the inbound stage surfaces the driver to the rider AND the rider to the driver', () => {
    const inbound = STAGE_CONTRACT.inbound;
    expect(inbound.riderSurface.join(' ').toLowerCase()).toContain('driver');
    expect(inbound.driverSurface.join(' ').toLowerCase()).toContain('rider');
  });
});

describe('resolveStage — COO splits matched into matched/inbound', () => {
  it('matched with no COO is "matched"', () => {
    expect(resolveStage('matched', false)).toBe('matched');
  });
  it('matched with COO sent is "inbound"', () => {
    expect(resolveStage('matched', true)).toBe('inbound');
  });
  it('maps live statuses through', () => {
    expect(resolveStage('otw', true)).toBe('otw');
    expect(resolveStage('active', false)).toBe('active');
    expect(resolveStage('in_progress', false)).toBe('active');
    expect(resolveStage('ended', false)).toBe('ended');
  });
});

describe('isInboundOrLater — live-map gate', () => {
  it('is false at matched before Pull Up', () => {
    expect(isInboundOrLater('matched', false)).toBe(false);
  });
  it('is true from Pull Up (matched + COO) onward', () => {
    expect(isInboundOrLater('matched', true)).toBe(true);
    expect(isInboundOrLater('otw', false)).toBe(true);
    expect(isInboundOrLater('active', false)).toBe(true);
  });
});

describe('publishRideTransition — symmetric fan-out', () => {
  const fetchMock = vi.fn();
  const channelsHit: string[] = [];

  beforeEach(() => {
    channelsHit.length = 0;
    process.env.ABLY_API_KEY = 'keyid:secret';
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      // https://rest.ably.io/channels/<encoded channel>/messages
      const m = /channels\/([^/]+)\/messages/.exec(url);
      if (m) channelsHit.push(decodeURIComponent(m[1]));
      return { ok: true, text: async () => '' } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reaches the ride channel + both notify channels + admin by default', async () => {
    await publishRideTransition(
      { rideId: 'R1', riderId: 'rider1', driverId: 'driver1' },
      'coo',
      { status: 'coo' },
    );
    expect(channelsHit).toContain('ride:R1');
    expect(channelsHit).toContain('user:rider1:notify');
    expect(channelsHit).toContain('user:driver1:notify');
    expect(channelsHit).toContain('admin:feed');
  });

  it('honors a one-directional notify subset but still hits the ride channel', async () => {
    await publishRideTransition(
      { rideId: 'R2', riderId: 'rider2', driverId: 'driver2' },
      'location_shared',
      { lat: 1, lng: 2 },
      { notify: ['driver'] },
    );
    expect(channelsHit).toContain('ride:R2');
    expect(channelsHit).toContain('user:driver2:notify');
    expect(channelsHit).not.toContain('user:rider2:notify');
  });

  it('never throws when a party id is missing (degrades to the channels it can reach)', async () => {
    await expect(
      publishRideTransition({ rideId: 'R3', riderId: null, driverId: 'driver3' }, 'status_change', { status: 'otw' }),
    ).resolves.toBeUndefined();
    expect(channelsHit).toContain('ride:R3');
    expect(channelsHit).toContain('user:driver3:notify');
    expect(channelsHit).not.toContain('user:null:notify');
  });
});
