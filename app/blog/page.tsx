import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllPosts } from '@/lib/blog/posts';

export const metadata: Metadata = {
  title: 'HMU ATL Blog — Cash Rides, Driver Earnings, Atlanta Rideshare Tips',
  description: 'Tips for earning cash driving in Atlanta. How HMU ATL drivers get paid same-day, earn more than Uber, and ride on their own terms.',
  openGraph: {
    title: 'HMU ATL Blog',
    description: 'Cash rides, driver earnings, and rideshare tips for Metro Atlanta.',
    url: 'https://atl.hmucashride.com/blog',
    siteName: 'HMU ATL',
    type: 'website',
  },
  alternates: { canonical: 'https://atl.hmucashride.com/blog' },
};

export default function BlogIndex() {
  const posts = getAllPosts();
  const featured = posts.filter(p => p.featured);
  const rest = posts.filter(p => !p.featured);

  return (
    <div style={{
      minHeight: '100vh', background: '#080808', color: '#fff',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      paddingTop: 56, paddingBottom: 60,
    }}>
      {/* Hero */}
      <div style={{ padding: '48px 20px 32px', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
        <div style={{
          fontSize: 10, color: '#00E676', fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12,
        }}>
          The HMU Blog
        </div>
        <h1 style={{
          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
          fontSize: 44, lineHeight: 1, marginBottom: 12,
        }}>
          EARN MORE.<br />DRIVE LOCAL.
        </h1>
        <p style={{ fontSize: 15, color: '#888', lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
          Real talk about making money driving in Atlanta. No corporate spin — just what works.
        </p>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px' }}>
        {/* Featured */}
        {featured.map(post => (
          <Link key={post.slug} href={`/blog/${post.slug}`} style={{ textDecoration: 'none' }}>
            <article style={{
              background: '#141414', border: '1px solid rgba(0,230,118,0.15)',
              borderRadius: 20, padding: '28px 24px', marginBottom: 16,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}>
              <div style={{
                display: 'inline-block', background: 'rgba(0,230,118,0.12)', color: '#00E676',
                fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
              }}>
                Featured
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: 8 }}>
                {post.title}
              </h2>
              <p style={{ fontSize: 14, color: '#888', lineHeight: 1.5, marginBottom: 12 }}>
                {post.description}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#666' }}>
                <span>{post.readTime} min read</span>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#444' }} />
                <span>{new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </article>
          </Link>
        ))}

        {/* All posts */}
        {rest.map(post => (
          <Link key={post.slug} href={`/blog/${post.slug}`} style={{ textDecoration: 'none' }}>
            <article style={{
              background: '#141414', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16, padding: '20px', marginBottom: 12,
              transition: 'border-color 0.15s',
            }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <span style={{
                  fontSize: 9, fontWeight: 600, color: '#888', background: '#1a1a1a',
                  padding: '2px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  {post.category}
                </span>
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: 6 }}>
                {post.title}
              </h3>
              <p style={{ fontSize: 13, color: '#888', lineHeight: 1.5, marginBottom: 10 }}>
                {post.description}
              </p>
              <div style={{ fontSize: 11, color: '#555' }}>
                {post.readTime} min &middot; {new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
