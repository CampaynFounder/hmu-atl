import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { PLAYBOOK_SECTIONS } from '@/content/driver-playbook';
import { listFbGroups } from '@/lib/db/fb-groups';

interface PaletteItem {
  id: string;
  kind: 'playbook' | 'fb_group' | 'faq';
  title: string;
  subtitle?: string | null;
  href: string;
  tags?: string[];
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ items: [] }, { status: 401 });

  // Market is ATL-only for now; will key off driver_profiles.area_slugs later.
  const marketSlug = 'atl';

  const items: PaletteItem[] = [];

  for (const section of PLAYBOOK_SECTIONS) {
    items.push({
      id: section.slug,
      kind: 'playbook',
      title: section.title,
      subtitle: section.headline,
      href: `/driver/playbook#${section.slug}`,
      tags: section.tags,
    });
    for (const bullet of section.bullets) {
      items.push({
        id: `${section.slug}:${bullet.text.slice(0, 20)}`,
        kind: 'playbook',
        title: bullet.text,
        subtitle: bullet.sub ?? section.title,
        href: `/driver/playbook#${section.slug}`,
        tags: section.tags,
      });
    }
  }

  try {
    const groups = await listFbGroups(marketSlug, true);
    for (const g of groups) {
      items.push({
        id: g.id,
        kind: 'fb_group',
        title: g.name,
        subtitle: g.audience || 'Facebook group',
        href: g.url,
        tags: [g.audience || '', g.market_slug, 'facebook', 'fb', 'group'].filter(Boolean),
      });
    }
  } catch {
    // Table may be empty — palette still works with playbook items.
  }

  return NextResponse.json({ items });
}
