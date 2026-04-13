import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import * as fs from 'fs';
import * as path from 'path';

const API_ROOT = path.join(process.cwd(), 'app/api');
const DOCS_DIR = path.join(process.cwd(), 'docs');

// ── Route scanning ──

function filePathToApiPath(filePath: string): string {
  let rel = path.relative(API_ROOT, filePath);
  rel = rel.replace(/\/route\.ts$/, '');
  rel = rel.replace(/\[([^\]]+)\]/g, ':$1');
  return '/api/' + rel;
}

function categorize(apiPath: string): string {
  if (apiPath.startsWith('/api/admin/')) return 'Admin';
  if (apiPath.startsWith('/api/rides/')) return 'Rides';
  if (apiPath.startsWith('/api/driver/')) return 'Driver';
  if (apiPath.startsWith('/api/drivers/')) return 'Drivers (Public)';
  if (apiPath.startsWith('/api/rider/')) return 'Rider';
  if (apiPath.startsWith('/api/payments/')) return 'Payments';
  if (apiPath.startsWith('/api/users/')) return 'Users';
  if (apiPath.startsWith('/api/webhooks/')) return 'Webhooks';
  if (apiPath.startsWith('/api/feed/')) return 'Feed';
  if (apiPath.startsWith('/api/chat/')) return 'Chat';
  if (apiPath.startsWith('/api/bookings/')) return 'Bookings';
  if (apiPath.startsWith('/api/data-room/')) return 'Data Room';
  if (apiPath.startsWith('/api/search/')) return 'Search';
  if (apiPath.startsWith('/api/upload/')) return 'Upload';
  if (apiPath.startsWith('/api/ably/')) return 'Ably';
  if (apiPath.startsWith('/api/leads/')) return 'Leads';
  return 'Other';
}

interface RouteInfo {
  filePath: string;
  apiPath: string;
  methods: string[];
  requiresAuth: boolean;
  requiresAdmin: boolean;
  description: string;
  requestBody: string[];
  responseFields: string[];
  statusCodes: string[];
  category: string;
}

function scanRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name !== 'route.ts') continue;

      const content = fs.readFileSync(full, 'utf-8');
      const apiPath = filePathToApiPath(full);

      const methods: string[] = [];
      if (/export\s+(async\s+)?function\s+GET\b/.test(content)) methods.push('GET');
      if (/export\s+(async\s+)?function\s+POST\b/.test(content)) methods.push('POST');
      if (/export\s+(async\s+)?function\s+PUT\b/.test(content)) methods.push('PUT');
      if (/export\s+(async\s+)?function\s+PATCH\b/.test(content)) methods.push('PATCH');
      if (/export\s+(async\s+)?function\s+DELETE\b/.test(content)) methods.push('DELETE');

      const requiresAuth = /auth\(\)/.test(content) || /clerkId/.test(content);
      const requiresAdmin = /requireAdmin/.test(content) || /is_admin/.test(content);

      let description = '';
      const jsdocMatch = content.match(/\/\*\*\s*\n([\s\S]*?)\*\//);
      if (jsdocMatch) {
        const lines = jsdocMatch[1].split('\n').map(l => l.replace(/^\s*\*\s?/, '').trim()).filter(l => l && !l.startsWith('@'));
        if (lines.length) description = lines.join(' ').slice(0, 200);
      }

      const requestBody: string[] = [];
      const typedMatch = content.match(/as\s*\{([^}]+)\}/);
      if (typedMatch) {
        typedMatch[1].split(/[;\n]/).forEach(line => {
          const m = line.trim().match(/^(\w+)\??:\s*(.+?)$/);
          if (m) requestBody.push(`${m[1]}: ${m[2].replace(/,\s*$/, '')}`);
        });
      }

      const responseFields: string[] = [];
      const respMatches = content.matchAll(/NextResponse\.json\(\s*\{([^}]{1,500})\}/g);
      for (const m of respMatches) {
        m[1].split(',').forEach(f => {
          const kv = f.trim().split(':')[0]?.trim();
          if (kv && /^[a-zA-Z_]/.test(kv) && kv !== 'error' && !responseFields.includes(kv)) responseFields.push(kv);
        });
        break;
      }

      const statusCodes = new Set<string>(['200']);
      for (const m of content.matchAll(/status:\s*(\d{3})/g)) statusCodes.add(m[1]);

      routes.push({
        filePath: path.relative(process.cwd(), full),
        apiPath, methods, requiresAuth, requiresAdmin, description,
        requestBody, responseFields, statusCodes: Array.from(statusCodes).sort(),
        category: categorize(apiPath),
      });
    }
  }

  walk(API_ROOT);
  return routes.sort((a, b) => a.apiPath.localeCompare(b.apiPath));
}

function generateApiMarkdown(routes: RouteInfo[]): string {
  const lines: string[] = [];
  lines.push('# HMU ATL — API Reference');
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|---|---|');
  lines.push(`| Total routes | ${routes.length} |`);
  lines.push(`| Auth-protected | ${routes.filter(r => r.requiresAuth).length} |`);
  lines.push(`| Admin-only | ${routes.filter(r => r.requiresAdmin).length} |`);
  lines.push(`| Public (no auth) | ${routes.filter(r => !r.requiresAuth).length} |`);
  lines.push('');

  const categories = new Map<string, RouteInfo[]>();
  for (const route of routes) {
    if (!categories.has(route.category)) categories.set(route.category, []);
    categories.get(route.category)!.push(route);
  }

  lines.push('## Categories');
  lines.push('');
  for (const [cat, catRoutes] of categories) {
    const anchor = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    lines.push(`- [${cat}](#${anchor}) (${catRoutes.length} routes)`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const [cat, catRoutes] of categories) {
    lines.push(`## ${cat}`);
    lines.push('');
    for (const route of catRoutes) {
      const authBadge = route.requiresAdmin ? ' `ADMIN`' : route.requiresAuth ? ' `AUTH`' : ' `PUBLIC`';
      const methodStr = route.methods.map(m => `\`${m}\``).join(' ');
      lines.push(`### ${methodStr} \`${route.apiPath}\`${authBadge}`);
      lines.push('');
      if (route.description) { lines.push(route.description); lines.push(''); }
      lines.push(`**File:** \`${route.filePath}\``);
      lines.push('');
      if (route.requestBody.length > 0) {
        lines.push('**Request body:**');
        lines.push('```');
        route.requestBody.forEach(f => lines.push(`  ${f}`));
        lines.push('```');
        lines.push('');
      }
      if (route.responseFields.length > 0) {
        lines.push(`**Response fields:** ${route.responseFields.map(f => `\`${f}\``).join(', ')}`);
        lines.push('');
      }
      lines.push(`**Status codes:** ${route.statusCodes.join(', ')}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── DB schema introspection ──

async function generateDbColumnsMarkdown(): Promise<{ markdown: string; tableCount: number; columnCount: number }> {
  const rows = await sql`
    SELECT t.table_name, c.column_name, c.data_type, c.column_default, c.is_nullable
    FROM information_schema.tables t
    JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = t.table_schema
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name, c.ordinal_position
  `;

  const tables = new Map<string, { column_name: string; data_type: string; column_default: string | null; is_nullable: string }[]>();
  for (const r of rows as Record<string, unknown>[]) {
    const tbl = r.table_name as string;
    if (!tables.has(tbl)) tables.set(tbl, []);
    tables.get(tbl)!.push({
      column_name: r.column_name as string,
      data_type: r.data_type as string,
      column_default: r.column_default as string | null,
      is_nullable: r.is_nullable as string,
    });
  }

  let columnCount = 0;
  const lines: string[] = [];
  lines.push('# Database Schema — Tables & Columns');
  lines.push('');
  lines.push(`**Tables: ${tables.size}** | **Total columns: ${rows.length}**`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const [tbl, cols] of tables) {
    lines.push(`### ${tbl}`);
    lines.push('');
    lines.push('| Column | Type | Nullable | Default |');
    lines.push('|---|---|---|---|');
    for (const c of cols) {
      const def = c.column_default ? c.column_default.replace(/\|/g, '\\|') : '';
      lines.push(`| ${c.column_name} | ${c.data_type} | ${c.is_nullable} | ${def} |`);
      columnCount++;
    }
    lines.push('');
  }

  return { markdown: lines.join('\n'), tableCount: tables.size, columnCount };
}

async function generateDbConstraintsMarkdown(): Promise<string> {
  const rows = await sql`
    SELECT
      tc.table_name,
      tc.constraint_name,
      tc.constraint_type,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      cc.check_clause
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    LEFT JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    LEFT JOIN information_schema.check_constraints cc ON cc.constraint_name = tc.constraint_name AND cc.constraint_schema = tc.constraint_schema
    WHERE tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name
  `;

  // Group by table
  const tables = new Map<string, {
    pks: string[];
    fks: Map<string, { col: string; refTable: string; refCol: string }>;
    uniques: Map<string, string[]>;
    checks: Map<string, string>;
  }>();

  for (const r of rows as Record<string, unknown>[]) {
    const tbl = r.table_name as string;
    if (!tables.has(tbl)) tables.set(tbl, { pks: [], fks: new Map(), uniques: new Map(), checks: new Map() });
    const t = tables.get(tbl)!;
    const ctype = r.constraint_type as string;
    const cname = r.constraint_name as string;
    const col = r.column_name as string;

    if (ctype === 'PRIMARY KEY' && col && !t.pks.includes(col)) {
      t.pks.push(col);
    } else if (ctype === 'FOREIGN KEY' && col) {
      t.fks.set(cname, { col, refTable: r.foreign_table_name as string, refCol: r.foreign_column_name as string });
    } else if (ctype === 'UNIQUE') {
      if (!t.uniques.has(cname)) t.uniques.set(cname, []);
      if (col && !t.uniques.get(cname)!.includes(col)) t.uniques.get(cname)!.push(col);
    } else if (ctype === 'CHECK') {
      const clause = r.check_clause as string;
      // Skip NOT NULL checks
      if (clause && !clause.match(/IS NOT NULL$/)) {
        t.checks.set(cname, clause);
      }
    }
  }

  const lines: string[] = [];
  lines.push('# Database Constraints');
  lines.push('');

  for (const [tbl, t] of tables) {
    const hasPk = t.pks.length > 0;
    const hasFk = t.fks.size > 0;
    const hasUnique = t.uniques.size > 0;
    const hasCheck = t.checks.size > 0;
    if (!hasPk && !hasFk && !hasUnique && !hasCheck) continue;

    lines.push(`### ${tbl}`);
    lines.push('');

    if (hasPk) lines.push(`**Primary Key:** ${t.pks.join(', ')}`);
    if (hasFk) {
      lines.push('');
      lines.push('**Foreign Keys:**');
      for (const [, fk] of t.fks) {
        lines.push(`- ${fk.col} -> ${fk.refTable}(${fk.refCol})`);
      }
    }
    if (hasUnique) {
      lines.push('');
      lines.push('**Unique Constraints:**');
      for (const [, cols] of t.uniques) {
        lines.push(`- (${cols.join(', ')})`);
      }
    }
    if (hasCheck) {
      lines.push('');
      lines.push('**Check Constraints:**');
      for (const [, clause] of t.checks) {
        lines.push(`- \`${clause}\``);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function generateDbIndexesMarkdown(): Promise<string> {
  const rows = await sql`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `;

  const tables = new Map<string, { indexname: string; indexdef: string }[]>();
  for (const r of rows as Record<string, unknown>[]) {
    const tbl = r.tablename as string;
    if (!tables.has(tbl)) tables.set(tbl, []);
    tables.get(tbl)!.push({ indexname: r.indexname as string, indexdef: r.indexdef as string });
  }

  const lines: string[] = [];
  lines.push('# Database Indexes');
  lines.push('');
  lines.push(`**Total indexes: ${rows.length}**`);
  lines.push('');

  for (const [tbl, idxs] of tables) {
    lines.push(`### ${tbl}`);
    lines.push('');
    lines.push('| Index | Definition |');
    lines.push('|---|---|');
    for (const idx of idxs) {
      const shortDef = idx.indexdef.replace(/^CREATE (UNIQUE )?INDEX .+ ON public\.\w+ USING /, '');
      lines.push(`| ${idx.indexname} | ${shortDef} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── POST handler ──

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const startTime = Date.now();

  try {
    // 1. Scan API routes
    const routes = scanRoutes();
    const apiMarkdown = generateApiMarkdown(routes);

    // 2. Query live DB schema
    const [dbResult, constraintsMarkdown, indexesMarkdown] = await Promise.all([
      generateDbColumnsMarkdown(),
      generateDbConstraintsMarkdown(),
      generateDbIndexesMarkdown(),
    ]);

    // 3. Combine into final doc
    const now = new Date().toISOString();
    const combined = [
      '# HMU ATL — Technical Reference',
      '',
      '> Auto-generated on ' + now.split('T')[0] + ' at ' + now.split('T')[1].split('.')[0] + ' UTC',
      '> Regenerate from Admin Portal or run: `npm run docs`',
      '',
      'Single source of truth for all API endpoints, database schema, constraints, and indexes.',
      '',
      '---',
      '',
      apiMarkdown,
      '',
      '---',
      '',
      dbResult.markdown,
      '',
      '---',
      '',
      constraintsMarkdown,
      '',
      '---',
      '',
      indexesMarkdown,
    ].join('\n');

    // 4. Write files
    if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
    fs.writeFileSync(path.join(DOCS_DIR, 'API-REFERENCE.md'), apiMarkdown, 'utf-8');
    fs.writeFileSync(path.join(DOCS_DIR, '_db-columns.md'), dbResult.markdown, 'utf-8');
    fs.writeFileSync(path.join(DOCS_DIR, '_db-constraints.md'), constraintsMarkdown, 'utf-8');
    fs.writeFileSync(path.join(DOCS_DIR, '_db-indexes.md'), indexesMarkdown, 'utf-8');
    fs.writeFileSync(path.join(DOCS_DIR, 'REFERENCE.md'), combined, 'utf-8');

    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      status: 'generated',
      generatedAt: now,
      elapsed: elapsed + 'ms',
      stats: {
        apiRoutes: routes.length,
        authProtected: routes.filter(r => r.requiresAuth).length,
        adminOnly: routes.filter(r => r.requiresAdmin).length,
        publicRoutes: routes.filter(r => !r.requiresAuth).length,
        categories: new Set(routes.map(r => r.category)).size,
        dbTables: dbResult.tableCount,
        dbColumns: dbResult.columnCount,
        totalLines: combined.split('\n').length,
      },
      files: [
        'docs/REFERENCE.md',
        'docs/API-REFERENCE.md',
        'docs/_db-columns.md',
        'docs/_db-constraints.md',
        'docs/_db-indexes.md',
      ],
    });
  } catch (error) {
    console.error('Doc generation failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Doc generation failed' },
      { status: 500 }
    );
  }
}

// GET — return current doc stats (last modified times)
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const refPath = path.join(DOCS_DIR, 'REFERENCE.md');
  const exists = fs.existsSync(refPath);

  if (!exists) {
    return NextResponse.json({ exists: false, lastGenerated: null, stats: null });
  }

  const stat = fs.statSync(refPath);
  const content = fs.readFileSync(refPath, 'utf-8');
  const lines = content.split('\n').length;

  // Extract stats from the generated header
  const routeCountMatch = content.match(/Total routes \| (\d+)/);
  const tableCountMatch = content.match(/Tables: (\d+)/);
  const columnCountMatch = content.match(/Total columns: (\d+)/);

  return NextResponse.json({
    exists: true,
    lastGenerated: stat.mtime.toISOString(),
    stats: {
      totalLines: lines,
      apiRoutes: routeCountMatch ? parseInt(routeCountMatch[1]) : null,
      dbTables: tableCountMatch ? parseInt(tableCountMatch[1]) : null,
      dbColumns: columnCountMatch ? parseInt(columnCountMatch[1]) : null,
    },
  });
}
