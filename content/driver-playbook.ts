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
    'Who does the work keeps the money.',
    'At Uber, that\'s Uber.',
    'At HMU, that\'s YOU.',
  ],
  tail: 'Promoting. Greeting. Driving. It\'s all you — so the money\'s all yours.',
};

export const PLAYBOOK_SECTIONS: PlaybookSection[] = [
  {
    slug: 'profile',
    icon: '🪪',
    title: 'Get Seen',
    headline: 'Your profile is your storefront.',
    lead: 'If riders can\'t see you, they can\'t book you. These five fields move the needle.',
    bullets: [
      { text: 'Profile photo', sub: 'Face clear, no shades. Riders pick faces they trust.' },
      { text: 'Vehicle photo + plate', sub: 'Proves you\'re real. No photo, no bookings.' },
      { text: 'Video intro', sub: '15 seconds. Say your name + where you run. Biggest single thing that gets you picked.' },
      { text: 'Pricing', sub: 'Blank prices = hidden profile. Let HMU set defaults ($25 min), then tweak.' },
      { text: 'Areas', sub: 'Pick where you actually drive. Fake areas = canceled rides.' },
    ],
    tags: ['profile', 'photo', 'video', 'setup', 'bio', 'picture'],
  },
  {
    slug: 'pricing',
    icon: '💵',
    title: 'Price for the Win',
    headline: 'Priced right, you stay booked.',
    lead: 'Most drivers either under-charge and burn out, or over-charge and go unmatched. Land in the middle.',
    bullets: [
      { text: 'Min ride $25', sub: 'Covers gas + time. Lower than that and you\'re losing money.' },
      { text: '30 min / 1 hr / 2 hr tiers', sub: 'Riders book longer trips when they see a clear rate.' },
      { text: 'Out-of-town per hour', sub: 'Don\'t undersell. You\'re giving up your night.' },
      { text: 'Round-trip', sub: 'Flag it. 3am rides home pay 1.5x for the peace of mind.' },
      { text: 'Stack the cap', sub: 'Daily cap hits = $0 platform fee. Past $300, HMU stops taking cuts.' },
    ],
    tags: ['pricing', 'money', 'minimum', 'rate', 'fee', 'cap'],
  },
  {
    slug: 'get-riders',
    icon: '📣',
    title: 'Run the Ads',
    headline: 'Uber buys ads. You ARE the ad.',
    lead: 'Your HMU link is the ad. Every post = potential booking. Post once a day and you\'ll never run dry.',
    bullets: [
      { text: 'Drop your link in FB groups, comments, story, bio', sub: 'Not your number. The link tracks. The link saves payment. A number can\'t do either.' },
      { text: 'Why link > direct DM', sub: 'Link holds rider payment up-front — no ghosting. Link tracks what works. You lose nothing.' },
      { text: 'Caption script', sub: '"Running [area] rides tonight — $25 min. HMU: [your link]"' },
      { text: 'Post across 3-5 groups daily', sub: 'The feed moves fast. One post = one shot. Five posts = five shots.' },
      { text: 'Use the curated group list below', sub: 'Admin keeps this fresh. Groups that actually convert.' },
    ],
    tags: ['facebook', 'fb', 'group', 'promotion', 'link', 'share', 'marketing', 'ads', 'post'],
  },
  {
    slug: 'retention',
    icon: '⭐',
    title: 'Cool AF Keeps You Paid',
    headline: 'One CHILL rating = 10 future rides.',
    lead: 'Your CHILL score is public. OG riders read driver comments. Repeat business is where the real money is.',
    bullets: [
      { text: 'Every rating compounds', sub: 'Cool AF > CHILL > silence. If you earn a Cool AF, that rider is telling everyone about you.' },
      { text: 'OG riders read comments', sub: 'If yours says "solid, on time, chill" — they pick you first.' },
      { text: 'Don\'t flirt, don\'t push', sub: 'Ride first, vibe second. WEIRDO flags = fewer matches + admin review.' },
      { text: 'On time, clean car, music low', sub: 'The three things that turn a one-time ride into a repeat.' },
    ],
    tags: ['ratings', 'chill', 'score', 'retention', 'repeat', 'comments'],
  },
];
