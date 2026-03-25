import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/driver', '/rider', '/privacy', '/d/', '/sign-in', '/sign-up'],
        disallow: [
          '/driver/home',
          '/driver/feed',
          '/driver/go-live',
          '/driver/settings',
          '/driver/profile',
          '/driver/payout-setup',
          '/driver/rides',
          '/rider/home',
          '/rider/browse',
          '/rider/profile',
          '/rider/settings',
          '/ride/',
          '/auth-callback',
          '/pending',
          '/api/',
        ],
      },
    ],
    sitemap: 'https://atl.hmucashride.com/sitemap.xml',
  };
}
