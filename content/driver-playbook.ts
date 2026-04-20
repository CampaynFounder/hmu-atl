// Driver Playbook content — authored in HMU voice.
// Non-admin-editable in v1. If we need admin editing later, port to content_zones.

export interface PlaybookBullet {
  text: string;
  sub?: string;
}

export interface PlaybookSection {
  slug: string;
  icon: string;
  title: string;
  headline: string;
  lead: string;
  bullets: PlaybookBullet[];
  tags: string[];
}

export const ECONOMICS_HERO = {
  lines: [
    'Uber/Lyft treat drivers like workers.',
    'HMU is for Owners.',
  ],
  tail: 'Find Riders Here:',
};

export const PLAYBOOK_SECTIONS: PlaybookSection[] = [
  {
    slug: 'get-riders',
    icon: '📣',
    title: 'Get Riders Here',
    headline: 'Your HMU link IS your ad.',
    lead: 'Post your link in the groups below. One post = one shot at a booking. Five posts a day = five shots.',
    bullets: [
      { text: 'Drop your link — not your number', sub: 'The link verifies the rider paid. We hold the money up-front. You get paid the second they get in your car.' },
      { text: 'Caption script', sub: '"Running [area] rides tonight — $25 min. HMU: [your link]"' },
      { text: 'Post across 3–5 groups a day', sub: 'Feeds move fast. More posts = more shots.' },
      { text: 'Tap a group below to join + post', sub: 'Admin keeps this list fresh. More groups appear as they\'re added.' },
    ],
    tags: ['facebook', 'fb', 'group', 'promote', 'promotion', 'link', 'share', 'marketing', 'ads', 'post', 'riders'],
  },
  {
    slug: 'pricing',
    icon: '💵',
    title: 'Set Your Prices and Menu',
    headline: 'Floor + add-ons = $100+ nights.',
    lead: 'Your minimum protects you. Your menu grows you. Riders pay up-front for whatever you put on it.',
    bullets: [
      { text: 'Min ride $25', sub: 'Covers gas + time. Lower than that and you\'re losing money.' },
      { text: 'Time-based tiers', sub: '30 min / 1 hr / 2 hr rates. Riders book longer trips when they see a clear hourly.' },
      { text: 'Out-of-town rate', sub: 'Don\'t undersell. You\'re giving up your whole night.' },
      { text: 'Round-trip flag', sub: '3am rides home pay 1.5x for the peace of mind.' },
      { text: 'Build your menu', sub: 'Add items riders pre-order at booking — extra stops, drinks, car seat, phone chargers. Riders check out, pay up-front, you deliver.' },
      { text: 'Stack the daily cap', sub: 'Once you hit the cap, HMU stops taking its cut. Menu items get you there faster.' },
    ],
    tags: ['pricing', 'money', 'minimum', 'rate', 'fee', 'cap', 'menu', 'services', 'addons', 'upsell'],
  },
  {
    slug: 'ratings',
    icon: '⭐',
    title: 'Ratings',
    headline: 'Cool AF = 10 future rides.',
    lead: 'Your rating is public. Repeat riders are where the real money is.',
    bullets: [
      { text: 'Every rating compounds', sub: 'Cool AF > CHILL > silence. A Cool AF means that rider is telling everyone about you.' },
      { text: 'OG riders read comments', sub: 'If yours says "solid, on time, chill" — they pick you first.' },
      { text: 'Ride first, vibe second', sub: 'Don\'t flirt, don\'t push. WEIRDO flags = fewer matches + admin review.' },
      { text: 'On time. Clean car. Music low.', sub: 'The three things that turn a one-time ride into a repeat.' },
    ],
    tags: ['ratings', 'chill', 'cool af', 'score', 'retention', 'repeat', 'comments', 'weirdo'],
  },
  {
    slug: 'payout',
    icon: '💳',
    title: 'Get Paid Today',
    headline: 'Your money, today — not next week.',
    lead: 'Connect a payout account once. Stripe verifies you one time. After that, money moves fast.',
    bullets: [
      { text: 'First payout: 1–3 business days', sub: 'Stripe does a one-time verification the first time you cash out. After that, you\'re on the fast track.' },
      { text: 'Standard payout: free, same-day', sub: 'Cash App, Venmo, Zelle, or bank — $0 fee. Queues into the 6am ET batch and hits by morning.' },
      { text: 'Instant payout: HMU First only', sub: '$9.99/mo. Tap Cash Out → money\'s in your account in seconds. Zero fee. Free tier can still use instant for 1% or $1 min.' },
      { text: 'Card on file = bookable', sub: 'Riders need a card on file to book you. You get paid up-front, not at drop-off. No more ghost trips.' },
      { text: 'Daily + weekly fee caps', sub: 'Free: $40/day · $150/week max platform fee. HMU First: $25/day · $100/week. Hit the cap and the rest of the day is ALL yours.' },
    ],
    tags: ['payout', 'cash out', 'stripe', 'verification', 'instant', 'hmu first', 'bank', 'cash app', 'venmo', 'zelle', 'card'],
  },
  {
    slug: 'profile',
    icon: '🪪',
    title: 'Get Seen',
    headline: 'Profile closes the deal.',
    lead: 'Once the link\'s out there, your profile is what converts the click into a booking.',
    bullets: [
      { text: 'Profile photo', sub: 'Face clear. No shades. Riders pick faces they trust.' },
      { text: 'Video intro (15 sec)', sub: 'Say your name + where you run. Biggest single thing that gets you picked.' },
      { text: 'Vehicle photo + plate', sub: 'Proves you\'re real. No photo, no bookings.' },
      { text: 'Service areas', sub: 'Pick where you actually drive. Fake areas = canceled rides.' },
    ],
    tags: ['profile', 'photo', 'video', 'bio', 'vehicle', 'areas', 'setup'],
  },
];
