// MatchingProvider resolver — Gate 2.2 entry point per contract §3 D-7.
//
// Reads MATCHING_PROVIDER env var (default 'internal') and returns a
// MatchingProvider implementation. Future MCP/HTTP providers branch from here
// (e.g. MATCHING_PROVIDER=mcp:foo or http:https://...). For now only the
// internal in-process matcher is wired; unknown providers fall back to
// internal so a misconfigured env var never takes the funnel offline.
//
// Per-market overrides: callers may pass a marketSlug — once the per-market
// blast_config row carries a provider field (Stream E), this function reads
// it and overrides the env-var default. For Gate 2.2 the marketSlug is
// accepted but not yet consulted (TODO below).

import { InternalMatcher } from './internal-matcher';
import type { MatchingProvider } from './types';

const internal = new InternalMatcher();

export function getMatchingProvider(_marketSlug?: string): MatchingProvider {
  // TODO(stream-e): once blast_config has a per-market `provider` column,
  // look it up here and prefer it over the env-var default. For now the
  // env var is the single switch.
  const provider = process.env.MATCHING_PROVIDER || 'internal';

  if (provider === 'internal') return internal;

  // Future: parse 'mcp:<name>' / 'http:<url>' here. Until those are built,
  // log loudly and fall back to internal so the funnel keeps working.
  if (provider.startsWith('mcp:') || provider.startsWith('http:') || provider.startsWith('https:')) {
    console.warn(
      `[blast/provider] MATCHING_PROVIDER='${provider}' requested but not yet implemented; falling back to internal`,
    );
    return internal;
  }

  console.warn(
    `[blast/provider] Unknown MATCHING_PROVIDER='${provider}'; falling back to internal`,
  );
  return internal;
}

export { InternalMatcher };
