/**
 * Combine API reference + DB schema into a single reference doc.
 *
 * Usage: npx tsx scripts/combine-docs.ts
 * Outputs: docs/REFERENCE.md
 */

import * as fs from 'fs';
import * as path from 'path';

const DOCS_DIR = path.join(process.cwd(), 'docs');
const OUTPUT = path.join(DOCS_DIR, 'REFERENCE.md');

const now = new Date().toISOString().split('T')[0];

const apiRef = fs.readFileSync(path.join(DOCS_DIR, 'API-REFERENCE.md'), 'utf-8');
const dbColumns = fs.readFileSync(path.join(DOCS_DIR, '_db-columns.md'), 'utf-8');
const dbConstraints = fs.readFileSync(path.join(DOCS_DIR, '_db-constraints.md'), 'utf-8');

const header = [
  '# HMU ATL — Technical Reference',
  '',
  '> Auto-generated on ' + now,
  '> Re-run: `npx tsx scripts/generate-api-docs.ts && npx tsx scripts/combine-docs.ts`',
  '',
  'This document is the single source of truth for all API endpoints and database schema.',
  'It is auto-generated from the codebase and live Neon database — do not edit manually.',
  '',
  '---',
  '',
  '## Table of Contents',
  '',
  '1. [API Reference](#hmu-atl--api-reference)',
  '2. [Database Schema — Tables & Columns](#neon-database-schema--all-tables--columns)',
  '3. [Database Schema — Constraints & Foreign Keys](#database-constraints)',
  '',
  '---',
  '',
].join('\n');

const constraintsSection = '# Database Constraints\n\n' + dbConstraints.replace(/^# .+\n/, '');

const combined = header + apiRef + '\n\n---\n\n' + dbColumns + '\n\n---\n\n' + constraintsSection;

fs.writeFileSync(OUTPUT, combined, 'utf-8');
const lines = combined.split('\n').length;
console.log('Generated ' + OUTPUT + ' (' + lines + ' lines)');
