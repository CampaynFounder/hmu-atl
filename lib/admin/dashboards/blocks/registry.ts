// Central block registry. Adding a new block = import it here + append the
// entry. The runtime + builder UI both iterate `BLOCKS` to know what's
// available; nothing else hardcodes block keys.
//
// Keys are stable strings stored in admin_dashboard_blocks.block_key. If a
// block needs to be retired, set `deprecated: true` rather than removing it
// from this map — that way saved dashboards still render an empty state and
// don't crash on unknown keys.

import type { AnyBlockDefinition, BlockDefinition } from './types';
import { userBasicsBlock } from './user-basics';
import { userDriverAreasBlock } from './user-driver-areas';
import { userRiderAreasBlock } from './user-rider-areas';
import { userVerificationBlock } from './user-verification';
import { userRatingsBlock } from './user-ratings';
import { userRidesBlock } from './user-rides';
import { userDisputesBlock } from './user-disputes';
import { userHmuHistoryBlock } from './user-hmu-history';
import { userAdminNotesBlock } from './user-admin-notes';

const ALL_BLOCKS: AnyBlockDefinition[] = [
  userBasicsBlock as AnyBlockDefinition,
  userVerificationBlock as AnyBlockDefinition,
  userDriverAreasBlock as AnyBlockDefinition,
  userRiderAreasBlock as AnyBlockDefinition,
  userHmuHistoryBlock as AnyBlockDefinition,
  userRidesBlock as AnyBlockDefinition,
  userRatingsBlock as AnyBlockDefinition,
  userDisputesBlock as AnyBlockDefinition,
  userAdminNotesBlock as AnyBlockDefinition,
];

export const BLOCKS: Record<string, AnyBlockDefinition> = Object.fromEntries(
  ALL_BLOCKS.map((b) => [b.key, b]),
);

export function getBlock(key: string): AnyBlockDefinition | undefined {
  return BLOCKS[key];
}

export function listBlocks(opts?: { scope?: 'user' | 'market' | 'global'; includeDeprecated?: boolean }): AnyBlockDefinition[] {
  return ALL_BLOCKS.filter((b) => {
    if (opts?.scope && b.scope !== opts.scope) return false;
    if (!opts?.includeDeprecated && b.deprecated) return false;
    return true;
  });
}

// Lightweight builder-UI shape (no SQL, no JSX). Returned by the registry
// metadata API for the dashboard builder form.
export interface BlockMetadata {
  key: string;
  label: string;
  description: string;
  scope: BlockDefinition['scope'];
  marketAware: boolean;
  marketScope: BlockDefinition['marketScope'];
  defaultConfig: unknown;
  deprecated: boolean;
}

export function blockMetadata(b: AnyBlockDefinition): BlockMetadata {
  return {
    key: b.key,
    label: b.label,
    description: b.description,
    scope: b.scope,
    marketAware: b.marketAware,
    marketScope: b.marketScope ?? 'admin_active',
    defaultConfig: b.defaultConfig,
    deprecated: b.deprecated ?? false,
  };
}
