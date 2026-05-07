// Funnel CMS — Section Registry
// Maps each page's visual sections to their constituent zone keys.
// Used by the admin section builder and the frontend dynamic renderer.

export interface SectionDefinition {
  sectionKey: string;
  label: string;
  icon: string;
  description: string;
  zones: string[];
}

export const PAGE_SECTIONS: Record<string, SectionDefinition[]> = {
  driver_landing: [
    { sectionKey: 'ticker', label: 'Ticker Bar', icon: '📢', description: 'Scrolling marquee at top', zones: ['ticker_items', 'ticker_speed'] },
    { sectionKey: 'hero', label: 'Hero', icon: '🎯', description: 'Main headline, subheadline + CTA', zones: ['hero_eyebrow', 'hero_headline_line1', 'hero_headline_line2', 'hero_subheadline', 'hero_cta_primary', 'hero_cta_secondary', 'hero_trust_text', 'nav_cta_text'] },
    { sectionKey: 'pain', label: 'Pain Points', icon: '😤', description: 'Problem statement + cards', zones: ['pain_label', 'pain_headline', 'pain_body', 'pain_cards'] },
    { sectionKey: 'how_it_works', label: 'How It Works', icon: '📋', description: '4-step flow', zones: ['how_label', 'how_headline', 'how_subheadline', 'how_steps'] },
    { sectionKey: 'protection', label: 'Payment Protection', icon: '🔒', description: 'Driver protection situations', zones: ['protection_badge', 'protection_headline', 'protection_body', 'protection_cards'] },
    { sectionKey: 'tracking', label: 'Live Tracking', icon: '📍', description: 'ETA map + feature bullets', zones: ['tracking_label', 'tracking_headline', 'tracking_subheadline', 'tracking_features'] },
    { sectionKey: 'fees', label: 'Progressive Fees', icon: '💰', description: 'Fee tiers + calculator + comparison', zones: ['fees_label', 'fees_headline', 'fees_intro', 'fee_tiers', 'cap_card', 'tier_free', 'tier_hmu_first'] },
    { sectionKey: 'payout', label: 'Payout Methods', icon: '💸', description: 'Cash App, Venmo, etc.', zones: ['payout_label', 'payout_headline', 'payout_subheadline', 'payout_methods', 'payout_apple_note'] },
    { sectionKey: 'social_proof', label: 'Social Proof', icon: '⭐', description: 'Testimonial marquee', zones: ['social_proof_pills'] },
    { sectionKey: 'cta', label: 'Final CTA', icon: '🚀', description: 'Sign-up form', zones: ['cta_eyebrow', 'cta_headline', 'cta_subheadline', 'cta_button_text', 'cta_fine_print'] },
    { sectionKey: 'offer_details', label: 'Offer Details', icon: '📄', description: 'Fee disclosure', zones: ['offer_details'] },
  ],
  rider_landing: [
    { sectionKey: 'ticker', label: 'Ticker Bar', icon: '📢', description: 'Scrolling marquee at top', zones: ['ticker_items', 'ticker_speed'] },
    { sectionKey: 'hero', label: 'Hero', icon: '🎯', description: 'Main headline + CTA', zones: ['hero_eyebrow', 'hero_headline_line1', 'hero_headline_line2', 'hero_subheadline', 'hero_cta_primary', 'hero_trust_text', 'nav_cta_text'] },
    { sectionKey: 'pain', label: 'Pain Points', icon: '😤', description: 'Problem cards', zones: ['pain_headline', 'pain_cards'] },
    { sectionKey: 'how_it_works', label: 'How It Works', icon: '📋', description: '4-step flow', zones: ['how_headline', 'how_subheadline', 'how_steps'] },
    { sectionKey: 'pricing', label: 'Pricing Comparison', icon: '💲', description: 'Route price comparisons', zones: ['pricing_headline', 'pricing_routes'] },
    { sectionKey: 'safety', label: 'Safety & Trust', icon: '🛡️', description: 'Escrow, Chill Score, etc.', zones: ['safety_headline', 'safety_cards'] },
    { sectionKey: 'og_status', label: 'OG Status', icon: '👑', description: 'OG rider perks', zones: ['og_title', 'og_body'] },
    { sectionKey: 'payments', label: 'Payment Methods', icon: '💳', description: 'Apple Pay, Google Pay, etc.', zones: ['payment_headline', 'payment_methods', 'payment_note'] },
    { sectionKey: 'testimonials', label: 'Testimonials', icon: '💬', description: 'Rider testimonial marquee', zones: ['testimonials'] },
    { sectionKey: 'cta', label: 'Final CTA', icon: '🚀', description: 'Sign-up form', zones: ['cta_eyebrow', 'cta_headline', 'cta_subheadline', 'cta_button_text', 'cta_fine_print'] },
  ],
  homepage: [
    { sectionKey: 'hero', label: 'Hero', icon: '🎯', description: 'Badge, headline, stats', zones: ['hero_badge', 'hero_headline_line1', 'hero_headline_line2', 'hero_subheadline', 'hero_stats'] },
    { sectionKey: 'how_it_works', label: 'How It Works', icon: '📋', description: 'Rider + driver steps', zones: ['how_rider_steps', 'how_driver_steps'] },
    { sectionKey: 'why_hmu', label: 'Why HMU', icon: '🤝', description: '4 value prop cards', zones: ['why_cards'] },
    { sectionKey: 'pricing', label: 'Pricing Snapshot', icon: '💲', description: 'Route comparisons', zones: ['pricing_routes'] },
    { sectionKey: 'waitlist', label: 'City Waitlist', icon: '🌎', description: 'Non-ATL signup', zones: ['waitlist_headline', 'waitlist_subheadline'] },
    { sectionKey: 'dual_cta', label: 'Dual CTA', icon: '🚀', description: 'Driver + rider sign-up', zones: ['driver_cta_banner', 'driver_cta_desc', 'rider_cta_desc'] },
  ],
  driver_guide: [
    { sectionKey: 'hero', label: 'Guide Hero', icon: '🎯', description: 'Title + intro', zones: ['guide_title', 'guide_intro'] },
    { sectionKey: 'steps', label: 'Guide Steps', icon: '📋', description: '9-step walkthrough', zones: ['guide_steps'] },
    { sectionKey: 'cta', label: 'Guide CTA', icon: '🚀', description: 'Bottom CTA', zones: ['guide_cta_text', 'guide_cta_note'] },
  ],
  rider_guide: [
    { sectionKey: 'hero', label: 'Guide Hero', icon: '🎯', description: 'Title + intro', zones: ['guide_title', 'guide_intro'] },
    { sectionKey: 'steps', label: 'Guide Steps', icon: '📋', description: '8-step walkthrough', zones: ['guide_steps'] },
    { sectionKey: 'cta', label: 'Guide CTA', icon: '🚀', description: 'Bottom CTA', zones: ['guide_cta_text', 'guide_cta_note'] },
  ],
  compare: [
    { sectionKey: 'hero', label: 'Hero', icon: '🎯', description: 'Eyebrow, headline, sub, CTA', zones: ['hero_eyebrow', 'hero_headline_line1', 'hero_headline_line2', 'hero_subheadline', 'hero_cta_label', 'hero_cta_href'] },
    { sectionKey: 'thesis', label: 'Thesis', icon: '💭', description: 'Why HMU exists', zones: ['thesis_label', 'thesis_headline', 'thesis_paragraph'] },
    { sectionKey: 'comparison_grid', label: 'Comparison Grid', icon: '📊', description: 'Platform-by-platform table — add competitors here. HMU pricing numbers derive from pricing_modes.config (live)', zones: ['grid_label', 'grid_headline', 'grid_subheadline', 'example_fare_dollars', 'grid_columns', 'grid_rows', 'grid_footnote'] },
    { sectionKey: 'membership_callout', label: 'Membership Callout', icon: '💸', description: '$25/day = $750/mo reframe', zones: ['membership_callout_label', 'membership_callout_headline', 'membership_callout_body', 'membership_callout_math'] },
    { sectionKey: 'worked_example', label: 'Worked Example', icon: '🧮', description: 'Concrete dollars on the example ride', zones: ['example_label', 'example_headline', 'example_scenarios'] },
    { sectionKey: 'faq', label: 'FAQ', icon: '❓', description: 'Honest-answers Q&A', zones: ['faq_label', 'faq_headline', 'faq_items'] },
    { sectionKey: 'cta', label: 'Final CTA', icon: '🚀', description: 'Primary + secondary buttons', zones: ['cta_eyebrow', 'cta_headline', 'cta_subheadline', 'cta_primary_label', 'cta_primary_href', 'cta_secondary_label', 'cta_secondary_href'] },
  ],
};

// Get default section order for a page
export function getDefaultSectionOrder(pageSlug: string): string[] {
  const sections = PAGE_SECTIONS[pageSlug];
  if (!sections) return [];
  return sections.map((s) => s.sectionKey);
}

// Get section definitions for a page
export function getSectionsForPage(pageSlug: string): SectionDefinition[] {
  return PAGE_SECTIONS[pageSlug] || [];
}
