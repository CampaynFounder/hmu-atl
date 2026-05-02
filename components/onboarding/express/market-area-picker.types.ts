export type Cardinal = 'central' | 'northside' | 'eastside' | 'southside' | 'westside';

export interface MarketAreaChip {
  slug: string;
  name: string;
  cardinal: Cardinal;
}
