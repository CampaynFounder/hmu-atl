import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getPostBySlug, getAllPosts } from '@/lib/blog/posts';
import { BlogTracker } from '@/components/blog/blog-tracker';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: `${post.title} | HMU ATL Blog`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      url: `https://atl.hmucashride.com/blog/${post.slug}`,
      siteName: 'HMU ATL',
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      authors: [post.author],
      images: post.ogImage ? [{ url: post.ogImage, width: 1200, height: 630 }] : [],
    },
    alternates: { canonical: `https://atl.hmucashride.com/blog/${post.slug}` },
  };
}

export function generateStaticParams() {
  return getAllPosts().map(p => ({ slug: p.slug }));
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  // JSON-LD Article schema
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.headline,
    description: post.description,
    author: { '@type': 'Organization', name: 'HMU ATL', url: 'https://atl.hmucashride.com' },
    publisher: { '@type': 'Organization', name: 'HMU ATL', url: 'https://atl.hmucashride.com' },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    mainEntityOfPage: `https://atl.hmucashride.com/blog/${post.slug}`,
  };

  // JSON-LD FAQ schema (AEO gold — appears in Google AI answers)
  const faqSchema = post.faqs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  } : null;

  return (
    <div style={{
      minHeight: '100vh', background: '#080808', color: '#fff',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      paddingTop: 56, paddingBottom: 80,
    }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />}
      <BlogTracker slug={post.slug} title={post.title} category={post.category} readTime={post.readTime} tags={post.tags} />

      <article style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px' }}>
        {/* Breadcrumb */}
        <nav style={{ fontSize: 12, color: '#555', marginBottom: 24, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link href="/blog" style={{ color: '#00E676', textDecoration: 'none' }}>Blog</Link>
          <span>/</span>
          <span style={{ color: '#888' }}>{post.category}</span>
        </nav>

        {/* Header */}
        <header style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#00E676', background: 'rgba(0,230,118,0.12)',
              padding: '3px 10px', borderRadius: 100, letterSpacing: 1, textTransform: 'uppercase',
            }}>
              {post.category}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 600, color: '#888', background: '#1a1a1a',
              padding: '3px 10px', borderRadius: 100,
            }}>
              {post.readTime} min read
            </span>
          </div>

          <h1 style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 40, lineHeight: 1.05, marginBottom: 12,
          }}>
            {post.headline}
          </h1>

          <p style={{ fontSize: 16, color: '#999', lineHeight: 1.6, marginBottom: 12 }}>
            {post.description}
          </p>

          <div style={{ fontSize: 12, color: '#555' }}>
            By {post.author} &middot; {new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            {post.updatedAt && ` (updated ${new Date(post.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`}
          </div>
        </header>

        {/* Body */}
        <div>
          {post.sections.map((section, i) => (
            <section key={i} style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12, lineHeight: 1.2 }}>
                {section.heading}
              </h2>
              <div
                style={{ fontSize: 15, color: '#ccc', lineHeight: 1.8 }}
                dangerouslySetInnerHTML={{ __html: section.content }}
              />
              {section.subheadings?.map((sub, j) => (
                <div key={j} style={{ marginTop: 20 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#fff' }}>
                    {sub.heading}
                  </h3>
                  <div
                    style={{ fontSize: 15, color: '#ccc', lineHeight: 1.8 }}
                    dangerouslySetInnerHTML={{ __html: sub.content }}
                  />
                </div>
              ))}
            </section>
          ))}
        </div>

        {/* FAQ section with schema */}
        {post.faqs.length > 0 && (
          <section style={{
            marginTop: 40, paddingTop: 32,
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>
              Frequently Asked Questions
            </h2>
            {post.faqs.map((faq, i) => (
              <div key={i} style={{
                marginBottom: 20, padding: '16px 18px',
                background: '#141414', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8, lineHeight: 1.3 }}>
                  {faq.question}
                </h3>
                <p style={{ fontSize: 14, color: '#bbb', lineHeight: 1.7, margin: 0 }}>
                  {faq.answer}
                </p>
              </div>
            ))}
          </section>
        )}

        {/* CTA */}
        <div style={{
          marginTop: 40, padding: '32px 24px',
          background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.15)',
          borderRadius: 20, textAlign: 'center',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            {post.cta.text}
          </div>
          {post.cta.subtext && (
            <p style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>{post.cta.subtext}</p>
          )}
          <Link href={post.cta.href} style={{
            display: 'inline-block', background: '#00E676', color: '#080808',
            padding: '14px 32px', borderRadius: 100, fontWeight: 700, fontSize: 16,
            textDecoration: 'none',
          }}>
            {post.cta.text}
          </Link>
        </div>

        {/* Tags */}
        <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {post.tags.map(tag => (
            <span key={tag} style={{
              fontSize: 11, color: '#666', background: '#141414',
              padding: '4px 10px', borderRadius: 100, border: '1px solid rgba(255,255,255,0.06)',
            }}>
              #{tag}
            </span>
          ))}
        </div>
      </article>
    </div>
  );
}
