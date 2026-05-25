#!/usr/bin/env node
// Applies a single SQL migration file to the database via psql.
// Safe to run repeatedly — migration files use CREATE TABLE/INDEX IF NOT EXISTS.
// Usage: node scripts/apply-migration.mjs <path-to-migration.sql>
//
// Uses psql (pre-installed on ubuntu-latest GitHub Actions runners) so that
// multi-statement files, dollar-quoted PL/pgSQL blocks (DO $$ ... $$), and
// all other Postgres syntax work correctly without any client-side parsing.

import { execFileSync } from 'child_process';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url || url.includes('placeholder')) {
  console.log('No real DATABASE_URL — skipping migration (build-time placeholder)');
  process.exit(0);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node scripts/apply-migration.mjs <migration-file.sql>');
  process.exit(1);
}

console.log(`Applying migration: ${migrationFile}`);
execFileSync('psql', [url, '-f', migrationFile, '--set=ON_ERROR_STOP=1'], {
  stdio: 'inherit',
});
console.log('✓ Done');
