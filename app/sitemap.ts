import { MetadataRoute } from 'next';
import { sql } from '@/lib/db/client';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://atl.hmucashride.com';

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/driver`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/rider`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/sign-up`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/sign-in`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  // Dynamic driver profile pages
  let driverPages: MetadataRoute.Sitemap = [];
  try {
    const drivers = await sql`
      SELECT dp.handle, dp.created_at
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE u.account_status = 'active' AND dp.handle IS NOT NULL
    `;
    driverPages = drivers.map((d) => ({
      url: `${baseUrl}/d/${d.handle}`,
      lastModified: new Date(d.created_at as string),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch {
    // DB unavailable at build time — return static pages only
  }

  return [...staticPages, ...driverPages];
}
