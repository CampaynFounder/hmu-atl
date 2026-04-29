// Static inventory of every admin destination available to the search palette.
// Each entry pairs a route with the permission slug needed to *view* it (must
// match the sidebar's gating in `app/admin/components/admin-sidebar.tsx`) and
// a list of keywords/synonyms used by the fuzzy matcher.
//
// Adding a new admin page: append an entry here so it shows up in search.
// Items without a `permission` are visible to every admin (matches sidebar).

export interface AdminSearchItem {
  id: string;
  label: string;
  href: string;
  section: 'Monitor' | 'Act' | 'Grow' | 'Raise' | 'System';
  icon: string;
  // Sidebar permission slug — server checks `hasPermission(permission + '.view')`.
  // Omit for routes that should be visible to all admins.
  permission?: string;
  // Synonyms / common phrasings. The fuzzy matcher weights label highest, then
  // these. Keep them short and Atlanta-team-vocab where it matters.
  keywords: string[];
}

export const ADMIN_SEARCH_MANIFEST: AdminSearchItem[] = [
  // ── MONITOR ─────────────────────────────────────────────────────────
  {
    id: 'live-ops',
    label: 'Live Ops',
    href: '/admin',
    section: 'Monitor',
    icon: '⚡',
    permission: 'monitor.liveops',
    keywords: ['dashboard', 'home', 'realtime', 'overview', 'now', 'today'],
  },
  {
    id: 'growth',
    label: 'Growth',
    href: '/admin/growth',
    section: 'Monitor',
    icon: '📈',
    permission: 'monitor.liveops',
    keywords: ['signups', 'charts', 'targets', 'area coverage', 'metrics'],
  },
  {
    id: 'revenue',
    label: 'Revenue',
    href: '/admin/money',
    section: 'Monitor',
    icon: '💰',
    permission: 'monitor.revenue',
    keywords: ['money', 'payouts', 'fees', 'earnings', 'transactions', 'finance'],
  },
  {
    id: 'pricing',
    label: 'Pricing',
    href: '/admin/pricing',
    section: 'Monitor',
    icon: '⚙️',
    permission: 'monitor.pricing',
    keywords: ['rates', 'tiers', 'fees', 'platform fee', 'caps'],
  },
  {
    id: 'schedule',
    label: 'Schedules',
    href: '/admin/schedule',
    section: 'Monitor',
    icon: '📅',
    permission: 'monitor.schedules',
    keywords: ['calendar', 'driver schedule', 'availability'],
  },

  // ── ACT ─────────────────────────────────────────────────────────────
  {
    id: 'support',
    label: 'Support',
    href: '/admin/support',
    section: 'Act',
    icon: '🎫',
    permission: 'act.support',
    keywords: ['tickets', 'help', 'inbox', 'cs'],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    href: '/admin/notifications',
    section: 'Act',
    icon: '🔔',
    permission: 'act.notifications',
    keywords: ['push', 'broadcast', 'alerts'],
  },
  {
    id: 'disputes',
    label: 'Disputes',
    href: '/admin/disputes',
    section: 'Act',
    icon: '⚖️',
    permission: 'act.disputes',
    keywords: ['refunds', 'complaints', 'nah fam', 'queue'],
  },
  {
    id: 'safety',
    label: 'Safety',
    href: '/admin/safety',
    section: 'Act',
    icon: '🛡️',
    keywords: ['weirdo', 'incidents', 'check-ins', 'distress'],
  },
  {
    id: 'users',
    label: 'Users',
    href: '/admin/users',
    section: 'Act',
    icon: '👥',
    permission: 'act.users',
    keywords: ['riders', 'drivers', 'accounts', 'profiles', 'people'],
  },
  {
    id: 'ride-requests',
    label: 'Ride Requests',
    href: '/admin/ride-requests',
    section: 'Act',
    icon: '🚖',
    keywords: ['rides', 'requests', 'pending'],
  },
  {
    id: 'hmus',
    label: 'HMUs',
    href: '/admin/hmus',
    section: 'Act',
    icon: '📣',
    keywords: ['driver to rider', 'link', 'hmu link', 'directed interest'],
  },
  {
    id: 'suspect-usage',
    label: 'Suspect Usage',
    href: '/admin/suspect-usage',
    section: 'Act',
    icon: '🚨',
    permission: 'act.suspect',
    keywords: ['fraud', 'abuse', 'flags', 'anomaly'],
  },

  // ── GROW ────────────────────────────────────────────────────────────
  {
    id: 'outreach',
    label: 'Outreach',
    href: '/admin/marketing',
    section: 'Grow',
    icon: '📣',
    permission: 'grow.outreach',
    keywords: ['marketing', 'sms', 'blast', 'campaign', 'csv', 'thread'],
  },
  {
    id: 'messages',
    label: 'Messages',
    href: '/admin/messages',
    section: 'Grow',
    icon: '💬',
    permission: 'grow.messages',
    keywords: ['sms inbox', 'threads', 'conversations', 'replies'],
  },
  {
    id: 'leads',
    label: 'Leads',
    href: '/admin/leads',
    section: 'Grow',
    icon: '📧',
    permission: 'grow.leads',
    keywords: ['homepage leads', 'email signups', 'waitlist'],
  },
  {
    id: 'content',
    label: 'Content',
    href: '/admin/content',
    section: 'Grow',
    icon: '🎬',
    permission: 'grow.content',
    keywords: ['videos', 'social', 'ads', 'creative'],
  },
  {
    id: 'funnel',
    label: 'Funnel CMS',
    href: '/admin/funnel',
    section: 'Grow',
    icon: '📝',
    permission: 'grow.funnel',
    keywords: ['copy', 'pages', 'cms', 'zones', 'landing'],
  },
  {
    id: 'driver-playbook',
    label: 'Playbook FB Groups',
    href: '/admin/driver-playbook/fb-groups',
    section: 'Grow',
    icon: '👥',
    keywords: ['facebook', 'groups', 'playbook', 'driver recruit'],
  },
  {
    id: 'conversation-agent',
    label: 'Conversation Agent',
    href: '/admin/conversation-agent',
    section: 'Grow',
    icon: '💬',
    keywords: ['ai', 'auto reply', 'gpt', 'agent'],
  },
  {
    id: 'chat-booking',
    label: 'Chat Booking',
    href: '/admin/chat-booking',
    section: 'Grow',
    icon: '🤖',
    keywords: ['sms booking', 'inbound book', 'auto book'],
  },

  // ── RAISE ───────────────────────────────────────────────────────────
  {
    id: 'data-room',
    label: 'Data Room',
    href: '/admin/data-room',
    section: 'Raise',
    icon: '🔒',
    permission: 'raise.dataroom',
    keywords: ['investors', 'metrics', 'fundraise'],
  },
  {
    id: 'pitch-videos',
    label: 'Pitch Videos',
    href: '/admin/pitch-videos',
    section: 'Raise',
    icon: '📱',
    permission: 'raise.pitch',
    keywords: ['investor video', 'pitch deck'],
  },
  {
    id: 'videos',
    label: 'Videos',
    href: '/admin/videos',
    section: 'Raise',
    icon: '🎥',
    permission: 'raise.videos',
    keywords: ['remotion', 'feature videos', 'documentation'],
  },
  {
    id: 'docs',
    label: 'Tech Docs',
    href: '/admin/docs',
    section: 'Raise',
    icon: '📄',
    permission: 'raise.docs',
    keywords: ['documentation', 'architecture', 'whitepaper'],
  },

  // ── SYSTEM ──────────────────────────────────────────────────────────
  {
    id: 'roles',
    label: 'Roles',
    href: '/admin/roles',
    section: 'System',
    icon: '🔑',
    permission: 'admin.roles',
    keywords: ['rbac', 'permissions', 'access', 'admin users'],
  },
  {
    id: 'markets',
    label: 'Markets',
    href: '/admin/markets',
    section: 'System',
    icon: '🌎',
    keywords: ['atl', 'nola', 'cities', 'regions', 'expansion'],
  },
  {
    id: 'feature-flags',
    label: 'Feature Flags',
    href: '/admin/feature-flags',
    section: 'System',
    icon: '🚩',
    keywords: ['flags', 'toggles', 'experiments', 'gates'],
  },
  {
    id: 'hmu-config',
    label: 'HMU Config',
    href: '/admin/hmu-config',
    section: 'System',
    icon: '📣',
    keywords: ['driver to rider', 'cap', 'hmu link cap'],
  },
  {
    id: 'onboarding-config',
    label: 'Onboarding Config',
    href: '/admin/onboarding-config',
    section: 'System',
    icon: '🛂',
    keywords: ['express signup', 'driver onboarding', 'fields', 'required'],
  },
  {
    id: 'realtime-banners',
    label: 'Realtime Banners',
    href: '/admin/realtime-notifications',
    section: 'System',
    icon: '⚡',
    keywords: ['signup banner', 'super admin alert', 'live notification'],
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    href: '/admin/maintenance',
    section: 'System',
    icon: '🚧',
    keywords: ['cleanup', 'backfill', 'scripts', 'jobs'],
  },
  {
    id: 'voip-debug',
    label: 'VoIP Debug',
    href: '/admin/voip-debug',
    section: 'System',
    icon: '📡',
    keywords: ['voip.ms', 'sms debug', 'phone numbers', 'did'],
  },
  {
    id: 'audit-log',
    label: 'Audit Log',
    href: '/admin/audit',
    section: 'System',
    icon: '📋',
    permission: 'admin.audit',
    keywords: ['history', 'who did what', 'admin actions', 'changes'],
  },
];
