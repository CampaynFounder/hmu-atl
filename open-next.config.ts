// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// TEMPORARY: R2 incremental cache disabled so deploys don't require R2 write
// access (the deploy creds currently lack it, and the r2 cache-populate step
// was aborting `wrangler deploy` before the worker uploaded). With no
// incrementalCache override, ISR/SSG pages render per-request instead of being
// cached in R2 — a minor perf hit on public pages, no correctness impact.
// RESTORE `incrementalCache: r2IncrementalCache` once CLOUDFLARE_API_TOKEN has
// Workers R2 Storage:Edit. See import below when restoring:
//   import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
export default defineCloudflareConfig({});
