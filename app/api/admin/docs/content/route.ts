import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import * as fs from 'fs';
import * as path from 'path';

const DOCS_DIR = path.join(process.cwd(), 'docs');

const FILE_MAP: Record<string, string> = {
  reference: 'REFERENCE.md',
  api: 'API-REFERENCE.md',
  schema: '_db-columns.md',
  constraints: '_db-constraints.md',
  indexes: '_db-indexes.md',
};

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const doc = req.nextUrl.searchParams.get('doc') || 'reference';
  const filename = FILE_MAP[doc];
  if (!filename) {
    return NextResponse.json({ error: 'Invalid doc: ' + doc }, { status: 400 });
  }

  const filePath = path.join(DOCS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Doc not generated yet. Click Generate to create it.', content: null });
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const stat = fs.statSync(filePath);

  return NextResponse.json({
    doc,
    filename,
    content,
    lines: content.split('\n').length,
    lastModified: stat.mtime.toISOString(),
    sizeBytes: stat.size,
  });
}
