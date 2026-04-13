/**
 * Auto-generate API reference documentation by scanning app/api/ route files.
 *
 * Usage: npx tsx scripts/generate-api-docs.ts
 *
 * Outputs: docs/API-REFERENCE.md
 */

import * as fs from 'fs';
import * as path from 'path';

const API_ROOT = path.join(process.cwd(), 'app/api');
const OUTPUT_FILE = path.join(process.cwd(), 'docs/API-REFERENCE.md');

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

function filePathToApiPath(filePath: string): string {
  let rel = path.relative(API_ROOT, filePath);
  rel = rel.replace(/\/route\.ts$/, '');
  // Convert [param] to :param
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

function extractMethods(content: string): string[] {
  const methods: string[] = [];
  if (/export\s+(async\s+)?function\s+GET\b/.test(content)) methods.push('GET');
  if (/export\s+(async\s+)?function\s+POST\b/.test(content)) methods.push('POST');
  if (/export\s+(async\s+)?function\s+PUT\b/.test(content)) methods.push('PUT');
  if (/export\s+(async\s+)?function\s+PATCH\b/.test(content)) methods.push('PATCH');
  if (/export\s+(async\s+)?function\s+DELETE\b/.test(content)) methods.push('DELETE');
  return methods;
}

function extractAuth(content: string): { requiresAuth: boolean; requiresAdmin: boolean } {
  const requiresAuth = /auth\(\)/.test(content) || /clerkId/.test(content) || /userId.*clerk/.test(content);
  const requiresAdmin = /requireAdmin/.test(content) || /is_admin/.test(content);
  return { requiresAuth, requiresAdmin };
}

function extractDescription(content: string): string {
  // Look for JSDoc or leading comments
  const jsdocMatch = content.match(/\/\*\*\s*\n([\s\S]*?)\*\//);
  if (jsdocMatch) {
    const lines = jsdocMatch[1]
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trim())
      .filter(l => l && !l.startsWith('@'));
    if (lines.length) return lines.join(' ').slice(0, 200);
  }
  // Look for // comment at top of exported function
  const commentMatch = content.match(/\/\/\s*(.+)\nexport\s+(async\s+)?function/);
  if (commentMatch) return commentMatch[1].trim();
  return '';
}

function extractRequestBody(content: string): string[] {
  const fields: string[] = [];
  // Match destructured body: const { field1, field2 } = body / await req.json()
  const destructureMatch = content.match(/const\s*\{([^}]+)\}\s*=\s*(?:body|await\s+req\.json\(\))/);
  if (destructureMatch) {
    const raw = destructureMatch[1];
    raw.split(',').forEach(f => {
      const name = f.trim().split(':')[0].split('=')[0].trim();
      if (name && !name.startsWith('//')) fields.push(name);
    });
  }
  // Also check typed body: as { field: type }
  const typedMatch = content.match(/as\s*\{([^}]+)\}/);
  if (typedMatch && fields.length === 0) {
    typedMatch[1].split(/[;\n]/).forEach(line => {
      const match = line.trim().match(/^(\w+)\??:\s*(.+?)$/);
      if (match) fields.push(`${match[1]}: ${match[2].replace(/,\s*$/, '')}`);
    });
  }
  return fields;
}

function extractResponseFields(content: string): string[] {
  const fields: string[] = [];
  // Match NextResponse.json({ ... })
  const matches = content.matchAll(/NextResponse\.json\(\s*\{([^}]{1,500})\}/g);
  for (const m of matches) {
    const inner = m[1];
    inner.split(',').forEach(f => {
      const kv = f.trim().split(':')[0]?.trim();
      if (kv && /^[a-zA-Z_]/.test(kv) && !kv.startsWith('//') && kv !== 'error') {
        if (!fields.includes(kv)) fields.push(kv);
      }
    });
    break; // Only first (success) response
  }
  return fields;
}

function extractStatusCodes(content: string): string[] {
  const codes = new Set<string>();
  const matches = content.matchAll(/status:\s*(\d{3})/g);
  for (const m of matches) codes.add(m[1]);
  // Always has implicit 200
  codes.add('200');
  return Array.from(codes).sort();
}

function scanRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'route.ts') {
        const content = fs.readFileSync(full, 'utf-8');
        const apiPath = filePathToApiPath(full);
        const methods = extractMethods(content);
        const { requiresAuth, requiresAdmin } = extractAuth(content);
        const description = extractDescription(content);
        const requestBody = extractRequestBody(content);
        const responseFields = extractResponseFields(content);
        const statusCodes = extractStatusCodes(content);
        const category = categorize(apiPath);

        routes.push({
          filePath: path.relative(process.cwd(), full),
          apiPath,
          methods,
          requiresAuth,
          requiresAdmin,
          description,
          requestBody,
          responseFields,
          statusCodes,
          category,
        });
      }
    }
  }

  walk(API_ROOT);
  return routes.sort((a, b) => a.apiPath.localeCompare(b.apiPath));
}

function generateMarkdown(routes: RouteInfo[]): string {
  const now = new Date().toISOString().split('T')[0];
  const lines: string[] = [];

  lines.push('# HMU ATL — API Reference');
  lines.push('');
  lines.push(`> Auto-generated on ${now} by \`scripts/generate-api-docs.ts\``);
  lines.push('> Re-run: `npx tsx scripts/generate-api-docs.ts`');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| Total routes | ${routes.length} |`);
  lines.push(`| Auth-protected | ${routes.filter(r => r.requiresAuth).length} |`);
  lines.push(`| Admin-only | ${routes.filter(r => r.requiresAdmin).length} |`);
  lines.push(`| Public (no auth) | ${routes.filter(r => !r.requiresAuth).length} |`);
  lines.push('');

  // Category TOC
  const categories = new Map<string, RouteInfo[]>();
  for (const route of routes) {
    if (!categories.has(route.category)) categories.set(route.category, []);
    categories.get(route.category)!.push(route);
  }

  lines.push('## Table of Contents');
  lines.push('');
  for (const [cat, catRoutes] of categories) {
    const anchor = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    lines.push(`- [${cat}](#${anchor}) (${catRoutes.length} routes)`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Routes by category
  for (const [cat, catRoutes] of categories) {
    lines.push(`## ${cat}`);
    lines.push('');

    for (const route of catRoutes) {
      const authBadge = route.requiresAdmin ? ' `ADMIN`' : route.requiresAuth ? ' `AUTH`' : ' `PUBLIC`';
      const methodStr = route.methods.map(m => `\`${m}\``).join(' ');

      lines.push(`### ${methodStr} \`${route.apiPath}\`${authBadge}`);
      lines.push('');

      if (route.description) {
        lines.push(route.description);
        lines.push('');
      }

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

// ── Run ──
const routes = scanRoutes();
const markdown = generateMarkdown(routes);
fs.writeFileSync(OUTPUT_FILE, markdown, 'utf-8');
console.log(`Generated ${OUTPUT_FILE}`);
console.log(`  ${routes.length} routes across ${new Set(routes.map(r => r.category)).size} categories`);
