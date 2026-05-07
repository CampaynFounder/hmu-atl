import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ sql, pool: null, transaction: vi.fn() }));

const { updateUserMetadata } = vi.hoisted(() => ({
  updateUserMetadata: vi.fn(),
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({
    users: { updateUserMetadata },
  })),
}));

import { syncTierForCustomer } from '../sync-tier';

beforeEach(() => {
  sql.mockReset();
  updateUserMetadata.mockReset();
  updateUserMetadata.mockResolvedValue({});
});

describe('syncTierForCustomer', () => {
  it('updates DB and Clerk metadata for one matched user', async () => {
    sql.mockResolvedValue([{ clerk_id: 'user_clerk_1' }]);

    const result = await syncTierForCustomer('cus_abc', 'hmu_first');

    expect(result).toEqual(['user_clerk_1']);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(updateUserMetadata).toHaveBeenCalledTimes(1);
    expect(updateUserMetadata).toHaveBeenCalledWith('user_clerk_1', {
      publicMetadata: { tier: 'hmu_first' },
    });
  });

  it('downgrade: writes free tier to Clerk (the previously-broken path)', async () => {
    sql.mockResolvedValue([{ clerk_id: 'user_clerk_2' }]);

    await syncTierForCustomer('cus_xyz', 'free');

    expect(updateUserMetadata).toHaveBeenCalledWith('user_clerk_2', {
      publicMetadata: { tier: 'free' },
    });
  });

  it('handles a customer mapped to multiple profiles (driver + rider)', async () => {
    sql.mockResolvedValue([
      { clerk_id: 'user_clerk_a' },
      { clerk_id: 'user_clerk_b' },
    ]);

    const result = await syncTierForCustomer('cus_dual', 'hmu_first');

    expect(result).toEqual(['user_clerk_a', 'user_clerk_b']);
    expect(updateUserMetadata).toHaveBeenCalledTimes(2);
  });

  it('returns empty list when no users match the customer (skips Clerk)', async () => {
    sql.mockResolvedValue([]);

    const result = await syncTierForCustomer('cus_unknown', 'free');

    expect(result).toEqual([]);
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  it('skips Clerk for users with no clerk_id (NULL is filtered out)', async () => {
    sql.mockResolvedValue([
      { clerk_id: null },
      { clerk_id: 'user_clerk_real' },
    ]);

    const result = await syncTierForCustomer('cus_partial', 'hmu_first');

    expect(result).toEqual(['user_clerk_real']);
    expect(updateUserMetadata).toHaveBeenCalledTimes(1);
    expect(updateUserMetadata).toHaveBeenCalledWith('user_clerk_real', expect.anything());
  });

  it('does not throw when Clerk update fails — logs and continues', async () => {
    sql.mockResolvedValue([{ clerk_id: 'user_clerk_bad' }]);
    updateUserMetadata.mockRejectedValueOnce(new Error('clerk down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      syncTierForCustomer('cus_clerk_fail', 'free')
    ).resolves.toEqual(['user_clerk_bad']);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
