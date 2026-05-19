#!/usr/bin/env node
// Applies a single SQL migration file to the database.
// Safe to run repeatedly — migration files use CREATE TABLE/INDEX IF NOT EXISTS.
// Usage: node scripts/apply-migration.mjs <path-to-migration.sql>
//
// Called from deploy-staging.yml / deploy-prod.yml to apply schema migrations.
//
// NOTE: The Neon HTTP driver (neon()) uses prepared statements which Postgres
// rejects for multi-statement queries ("cannot insert multiple commands into a
// prepared statement"). We split the file on semicolons and run each statement
// individually — safe for DDL files that don't have semicolons inside strings.

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

// Split on semicolons, trim whitespace, drop empty blocks and pure-comment
// blocks (e.g. the "-- Verify with:" sections at the end of some files).
const statements = content
  .split(';')
  .map(s => s.trim())
  .filter(s => {
    if (!s) return false;
    // Keep the statement only if at least one non-blank, non-comment line exists.
    return s.split('\n').some(
      line => line.trim().length > 0 && !line.trim().startsWith('--')
    );
  });

console.log(`Applying migration: ${migrationFile} (${statements.length} statements)`);
for (const statement of statements) {
  await sql.query(statement);
}
console.log('✓ Done');
