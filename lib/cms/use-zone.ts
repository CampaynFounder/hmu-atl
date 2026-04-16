'use client';

import { useCmsContext } from './provider';

/**
 * Returns CMS content for a zone, falling back to the provided default.
 * If no DB content exists, the hardcoded fallback renders — zero visual regression.
 */
export function useZone<T>(zoneKey: string, fallback: T): T {
  const { content } = useCmsContext();
  const value = content[zoneKey];
  if (value === undefined || value === null) return fallback;
  return value as T;
}
