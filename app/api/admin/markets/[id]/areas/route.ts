import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/helpers';
import { getMarketAreas } from '@/lib/markets/areas';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  const rows = await getMarketAreas(id);

  return NextResponse.json({
    areas: rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      cardinal: r.cardinal,
      sort_order: r.sort_order,
    })),
  });
}
