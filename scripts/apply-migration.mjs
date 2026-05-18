#!/usr/bin/env node
// Applies a single SQL migration file to the database.
// Safe to run repeatedly — migration files use CREATE TABLE/INDEX IF NOT EXISTS.
// Usage: node scripts/apply-migration.mjs <path-to-migration.sql>
//
// Called from deploy-staging.yml to apply schema migrations that were
// originally created via the Neon MCP and not checked in as migration files.

import { readFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';

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

const sql = neon(url);
const content = readFileSync(migrationFile, 'utf8');

console.log(`Applying migration: ${migrationFile}`);
await sql(content);
console.log(`✓ Done`);
