'use client';

import { useCmsContext } from './provider';

/**
 * Returns whether a feature flag is enabled, falling back to the provided default.
 * Use to show/hide entire sections on marketing pages.
 */
export function useFlag(flagKey: string, defaultEnabled: boolean = true): boolean {
  const { flags } = useCmsContext();
  const value = flags[flagKey];
  if (value === undefined) return defaultEnabled;
  return value;
}
