import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getActiveDriverPosts, getActiveRiderPosts } from '@/lib/posts';
import { feedRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const { success } = await feedRateLimit.limit(userId);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { searchParams } = req.nextUrl;
  const area = searchParams.get('area');

  if (!area) {
    return NextResponse.json(
      { error: 'Missing required query param: area' },
      { status: 400 }
    );
  }

  const priceMinParam = searchParams.get('price_min');
  const priceMaxParam = searchParams.get('price_max');
  const priceMin = priceMinParam !== null ? Number(priceMinParam) : undefined;
  const priceMax = priceMaxParam !== null ? Number(priceMaxParam) : undefined;

  if (priceMin !== undefined && isNaN(priceMin)) {
    return NextResponse.json({ error: 'Invalid price_min' }, { status: 400 });
  }
  if (priceMax !== undefined && isNaN(priceMax)) {
    return NextResponse.json({ error: 'Invalid price_max' }, { status: 400 });
  }

  const [drivers, riders] = await Promise.all([
    getActiveDriverPosts(area, priceMin, priceMax),
    getActiveRiderPosts(area, priceMin, priceMax),
  ]);

  return NextResponse.json({
    area,
    drivers,
    riders,
    total: drivers.length + riders.length,
  });
}
