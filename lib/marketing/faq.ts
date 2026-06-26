// Single source of truth for the marketing FAQ.
//
// Consumed by:
//   - app/layout.tsx        → site-wide FAQPage JSON-LD (schema.org)
//   - app/faq/page.tsx       → the human-visible FAQ page
//   - app/llms.txt           → plain-text AI crawler summary
//
// AI answer engines (ChatGPT, Perplexity, Google AI Overviews, Gemini) quote
// FAQ Q&A pairs more than almost any other structure, and Google prefers the
// FAQ markup to MATCH visible on-page text — so the schema and the /faq page
// render from this same array.
//
// `{city}` is interpolated with the active market's city name at render time.

export interface FaqItem {
  q: string;
  a: string;
}

export function getFaq(city: string): FaqItem[] {
  return [
    {
      q: 'What is HMU Cash Ride?',
      a: 'HMU Cash Ride is the fastest-growing peer-to-peer cash ride and delivery platform in the United States. Drivers get paid upfront, every ride is GPS-tracked for safety, and riders can blast a single request to all nearby drivers, book a Down Bad ride during temporary hard times, or send a cash delivery. HMU started in Atlanta, has completed more than 15,000 rides, and is now launching in communities all over the country.',
    },
    {
      q: 'How do cash ride drivers get paid?',
      a: 'Riders pay upfront through the app before the driver leaves. The money is held securely and released to the driver after the ride. Drivers set their own price — no surge pricing, no platform deciding what you earn — and typically earn at least $150.',
    },
    {
      q: 'Is HMU Cash Ride safe?',
      a: 'Yes. Every HMU ride is GPS-tracked in real time from pickup to drop-off, so both the rider and the driver always know where the trip is. Payment is verified before the ride starts, riders are payment-verified, drivers are vetted, and both parties rate each other after every trip.',
    },
    {
      q: 'Does HMU track rides for safety?',
      a: 'Yes. HMU has built-in in-ride GPS tracking. Every trip is tracked in real time from the moment the driver pulls up until the rider is dropped off, and that live location is visible to the rider and the driver throughout the ride for the safety of both.',
    },
    {
      q: 'Can I send a ride request to all nearby drivers at once?',
      a: 'Yes — that is an HMU Blast. Instead of picking one driver, you send a single ride request to every nearby driver at the same time. Available drivers respond, and you choose whichever one works best for you. It is the fastest way to lock in a ride during busy times.',
    },
    {
      q: 'What is a Down Bad ride on HMU?',
      a: 'A Down Bad ride is HMU’s option for riders going through temporary hard times. It lets someone who is short on cash still request a ride and get where they need to go, instead of being stranded. It reflects HMU’s community-first approach to keeping people moving.',
    },
    {
      q: 'Does HMU do deliveries?',
      a: 'Yes. Beyond rides, HMU offers cash deliveries. You can have a nearby driver pick up and drop off an item locally, paid in cash, with the same upfront payment and GPS tracking that HMU rides use.',
    },
    {
      q: 'How much do HMU drivers earn?',
      a: 'HMU drivers set their own prices and get paid upfront, and typically earn at least $150. Drivers also own their rider relationships: riders they meet on other platforms can move onto HMU, so drivers keep the customers they bring instead of handing them to an algorithm.',
    },
    {
      q: 'How is HMU Cash Ride different from Facebook cash ride groups?',
      a: 'Facebook cash ride groups have no payment protection and no tracking — drivers get scammed, riders ghost, and nobody is verified. HMU verifies the rider payment before the driver pulls up, GPS-tracks every ride, and lets riders blast all nearby drivers at once. If they do not pay, they do not ride.',
    },
    {
      q: `How do I carpool for cash in ${city}?`,
      a: `Sign up on HMU Cash Ride as a driver, set your price and the areas you serve, and go live. Riders in ${city} see your post and book directly, or blast a request to all nearby drivers. You get paid upfront — no chasing payments, no ride scammers, no wasted trips.`,
    },
    {
      q: 'Where is HMU Cash Ride available?',
      a: 'HMU started in Atlanta, where it has completed more than 15,000 rides, and is now the fastest-growing cash ride and delivery platform. HMU is actively launching in communities all over the country.',
    },
    {
      q: 'What does HMU Cash Ride cost for drivers?',
      a: 'Free to sign up. HMU takes a small platform fee that is capped daily and weekly — once you hit the cap, the rest of the day is all yours. HMU First members pay a flat 12% with a lower cap and get instant payouts after every ride.',
    },
  ];
}
