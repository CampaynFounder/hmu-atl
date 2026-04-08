export interface BlogPost {
  slug: string;
  title: string;
  description: string; // meta description — 150-160 chars
  headline: string; // H1 on the page (can differ from title for SEO)
  author: string;
  publishedAt: string; // ISO date
  updatedAt?: string;
  category: 'drivers' | 'riders' | 'atlanta' | 'money' | 'safety' | 'guides';
  tags: string[];
  readTime: number; // minutes
  featured?: boolean;
  ogImage?: string; // Open Graph image path
  sections: BlogSection[];
  faqs: BlogFAQ[];
  cta: BlogCTA;
}

export interface BlogSection {
  heading: string; // H2
  content: string; // HTML string
  subheadings?: { heading: string; content: string }[]; // H3s
}

export interface BlogFAQ {
  question: string;
  answer: string;
}

export interface BlogCTA {
  text: string;
  href: string;
  subtext?: string;
}
