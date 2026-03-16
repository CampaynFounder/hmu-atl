// Auth Guards
// Server-side authorization helpers for role and account status checks

import { redirect } from 'next/navigation';
import { getCurrentUser as _getCurrentUser } from './get-current-user';
import type { ProfileType, AccountStatus } from '@/lib/db/types';

// Re-export getCurrentUser for convenience
export { getCurrentUser } from './get-current-user';

/**
 * Require user to have specific profile_type (role)
 * Throws redirect if user is not authenticated or lacks required role
 *
 * Usage:
 * ```tsx
 * const user = await requireRole(['driver', 'both']);
 * // Now TypeScript knows user is authenticated and is a driver
 * ```
 */
export async function requireRole(allowedRoles: ProfileType[]) {
  const user = await _getCurrentUser();

  if (!user) {
    redirect('/sign-in');
  }

  if (!allowedRoles.includes(user.profile_type)) {
    redirect('/unauthorized');
  }

  return user;
}

/**
 * Require user to have specific account_status
 * Throws redirect if user is not authenticated or has wrong status
 *
 * Usage:
 * ```tsx
 * const user = await requireAccountStatus(['active']);
 * // Now TypeScript knows user is active
 * ```
 *
 * Note: This is SEPARATE from requireRole() to allow granular checks
 * Example: A driver might be authenticated but still pending_activation
 */
export async function requireAccountStatus(allowedStatuses: AccountStatus[]) {
  const user = await _getCurrentUser();

  if (!user) {
    redirect('/sign-in');
  }

  if (!allowedStatuses.includes(user.account_status)) {
    // Redirect pending users to review page
    if (user.account_status === 'pending_activation') {
      redirect('/pending');
    }

    // Redirect suspended/banned users to status page
    if (user.account_status === 'suspended' || user.account_status === 'banned') {
      redirect('/account-status');
    }

    // Fallback redirect
    redirect('/unauthorized');
  }

  return user;
}

/**
 * Combined guard: Require both role AND account status
 * Useful for protecting routes that need both checks
 *
 * Usage:
 * ```tsx
 * const user = await requireRoleAndStatus(['driver'], ['active']);
 * // User is a driver AND active
 * ```
 */
export async function requireRoleAndStatus(
  allowedRoles: ProfileType[],
  allowedStatuses: AccountStatus[]
) {
  const user = await _getCurrentUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Check role first
  if (!allowedRoles.includes(user.profile_type)) {
    redirect('/unauthorized');
  }

  // Then check status
  if (!allowedStatuses.includes(user.account_status)) {
    if (user.account_status === 'pending_activation') {
      redirect('/pending');
    }
    if (user.account_status === 'suspended' || user.account_status === 'banned') {
      redirect('/account-status');
    }
    redirect('/unauthorized');
  }

  return user;
}
