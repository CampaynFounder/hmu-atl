// Design tokens — mirrors hmu-atl web exactly.
// All colors, typography, spacing, and radius values come from this file.
// Do NOT hardcode design values in screen files.

export const colors = {
  // Backgrounds
  bg: '#080808',
  card: '#141414',
  cardAlt: '#1a1a1a',

  // Brand
  green: '#00E676',
  greenDim: 'rgba(0,230,118,0.10)',
  greenBorder: 'rgba(0,230,118,0.22)',
  greenGlow: 'rgba(0,230,118,0.25)',

  // Semantic
  amber: '#FFB300',
  amberDim: 'rgba(255,179,0,0.08)',
  amberBorder: 'rgba(255,179,0,0.25)',
  red: '#FF5252',
  redDim: 'rgba(255,68,68,0.08)',
  redBorder: 'rgba(255,68,68,0.25)',
  blue: '#448AFF',
  blueDim: 'rgba(68,138,255,0.06)',
  blueBorder: 'rgba(68,138,255,0.22)',
  pink: '#FF4081',
  pinkDim: 'rgba(255,64,129,0.06)',
  pinkBorder: 'rgba(255,64,129,0.18)',
  cash: '#FFC107',
  cashDim: 'rgba(255,193,7,0.08)',
  cashBorder: 'rgba(255,193,7,0.15)',

  // Text hierarchy
  textPrimary: '#ffffff',
  textSecondary: '#bbb',
  textTertiary: '#888',
  textFaint: '#555',

  // Borders
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.08)',
} as const;

export const fonts = {
  display: 'BebasNeue_400Regular',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
} as const;

export const radius = {
  pill: 100,
  card: 20,
  cardInner: 14,
  tag: 8,
  sm: 6,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  glow: {
    shadowColor: '#00E676',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;
