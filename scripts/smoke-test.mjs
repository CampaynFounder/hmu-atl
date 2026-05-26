#!/usr/bin/env node
// Smoke test runner — invoked by GH Actions after each deploy.
// Reports results to /api/admin/smoke-results so they appear in the admin portal.
//
// Usage:
//   node scripts/smoke-test.mjs --env staging --market atl --commit abc123
//
// Required env vars (supplied by GH Actions secrets):
//   SMOKE_WEBHOOK_SECRET  — shared secret for /api/admin/smoke-* endpoints
//
// Exit codes: 0 = all pass, 1 = one or more checks failed

import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    env:    { type: 'string', default: 'staging' },
    market: { type: 'string', default: 'atl' },
    commit: { type: 'string', default: '' },
  },
});

const ENV_URLS = {
  staging:    'https://staging.hmucashride.com',
  production: 'https://atl.hmucashride.com',
};

const BASE_URL       = ENV_URLS[args.env] ?? ENV_URLS.staging;
const SMOKE_SECRET   = process.env.SMOKE_WEBHOOK_SECRET ?? '';
const RESULTS_URL    = `${BASE_URL}/api/admin/smoke-results`;
const PING_URL       = `${BASE_URL}/api/admin/smoke-ping`;
const HEALTH_URL     = `${BASE_URL}/api/health`;

const smokeHeaders = { 'x-smoke-secret': SMOKE_SECRET, 'Content-Type': 'application/json' };

// ── Helpers ────────────────────────────────────────────────────────────────

async function runCheck(name, fn) {
  const start = Date.now();
  try {
    await fn();
    return { name, pass: true, duration_ms: Date.now() - start };
  } catch (err) {
    return { name, pass: false, error: err.message, duration_ms: Date.now() - start };
  }
}

async function expectStatus(url, expected, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
  if (res.status !== expected) throw new Error(`Expected HTTP ${expected}, got ${res.status}`);
  return res;
}

// ── Checks ─────────────────────────────────────────────────────────────────

const checks = [
  // 1. Health endpoint — no auth required
  () => runCheck('health', () => expectStatus(HEALTH_URL, 200)),

  // 2. Auth guard — a protected route must return 401 with no credentials
  () => runCheck('auth.guard', () => expectStatus(`${BASE_URL}/api/rides`, 401)),

  // 3-7. Vendor pings — routed through smoke-ping endpoint (SMOKE_WEBHOOK_SECRET auth)
  () => runCheck('vendors', async () => {
    const res = await expectStatus(PING_URL, 200, { headers: smokeHeaders });
    const data = await res.json();
    const failed = Object.entries(data.vendors ?? {})
      .filter(([, v]) => !v.ok)
      .map(([k]) => k);
    if (failed.length > 0) throw new Error(`Vendor failures: ${failed.join(', ')}`);
  }),
];

// ── Run ────────────────────────────────────────────────────────────────────

const suiteStart = Date.now();
console.log(`\n[smoke] env=${args.env}  market=${args.market}  commit=${args.commit || 'unknown'}`);
console.log(`[smoke] base=${BASE_URL}\n`);

const results = await Promise.all(checks.map((fn) => fn()));
const duration_ms = Date.now() - suiteStart;

const passed = results.filter((r) => r.pass);
const failed = results.filter((r) => !r.pass);

for (const r of results) {
  const icon = r.pass ? '✓' : '✗';
  const tail = r.error ? ` — ${r.error}` : '';
  console.log(`  ${icon} ${r.name} (${r.duration_ms}ms)${tail}`);
}
console.log(`\n[smoke] ${passed.length}/${results.length} passed in ${duration_ms}ms\n`);

// ── Report ─────────────────────────────────────────────────────────────────

const status = failed.length === 0 ? 'pass' : 'fail';

try {
  const res = await fetch(RESULTS_URL, {
    method: 'POST',
    headers: smokeHeaders,
    body: JSON.stringify({
      env:          args.env,
      market:       args.market,
      triggered_by: `deploy:${args.commit || 'unknown'}`,
      status,
      results,
      passed_count: passed.length,
      failed_count: failed.length,
      total_count:  results.length,
      duration_ms,
      commit_sha:   args.commit || null,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (res.ok) {
    const data = await res.json();
    console.log(`[smoke] Run stored — id=${data.id}`);
  } else {
    console.warn(`[smoke] Failed to store results: HTTP ${res.status}`);
  }
} catch (err) {
  console.warn(`[smoke] Could not report results: ${err.message}`);
}

process.exit(failed.length > 0 ? 1 : 0);
