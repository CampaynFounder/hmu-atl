// Blast v3 — TypeScript contracts shared across all parallel streams.
// Per docs/BLAST-V3-AGENT-CONTRACT.md §7. Locked in Gate 2; do not modify
// without coordinating with all stream agents.

// ============================================================================
// Form & draft
// ============================================================================

export type GenderOption = 'man' | 'woman' | 'nonbinary';

export interface GenderPreference {
  preferred: GenderOption[];
  strict: boolean;
}

export interface BlastDraft {
  pickup: { lat: number; lng: number; address: string; mapboxId?: string };
  dropoff: { lat: number; lng: number; address: string; mapboxId?: string };
  tripType: 'one_way' | 'round_trip';
  scheduledFor: string | null;       // ISO timestamp; null = ASAP
  storage: boolean;
  priceDollars: number;
  riderGender: GenderOption | null;
  driverPreference: GenderPreference;
  parsedFromText?: string;            // original "next Wednesday" string for audit
  nlpConfidence?: number;             // 0..1 if parsed by LLM
  draftCreatedAt: number;             // epoch ms
}

// ============================================================================
// Create blast
// ============================================================================

export interface BlastCreateInput extends BlastDraft {
  marketSlug: string;
}

export interface BlastCreateResult {
  blastId: string;
  shortcode: string;
  expiresAt: string;
  targetedCount: number;
}

// ============================================================================
// Matching
// ============================================================================

export type RewardFunction =
  | 'revenue_per_blast'
  | 'accept_rate'
  | 'accept_x_completion'
  | 'time_to_first_hmu';

export interface BlastConfig {
  weights: Record<string, number>;
  hardFilters: Record<string, unknown>;
  limits: Record<string, number | boolean>;
  rewardFunction: RewardFunction;
  counterOfferMaxPct: number;         // 0..1, e.g. 0.25 = ±25%
  feedMinScorePercentile: number;     // 0..100
  nlpChipOnly: boolean;
  configVersion: number;
}

export interface FilterResult {
  filter: string;
  passed: boolean;
  value: unknown;
  threshold: unknown;
}

export interface MatchCandidate {
  driverId: string;
  rawFeatures: Record<string, number>;
  normalizedFeatures: Record<string, number>;
  filterResults: FilterResult[];
  score: number;
  scoreBreakdown: Record<string, number>;
}

export interface MatchResult {
  configVersion: number;
  providerName: string;
  experimentArmId?: string;
  candidates: MatchCandidate[];       // ALL considered, full funnel
  notifiedDriverIds: string[];
  fallbackDriverIds: string[];
  expandedRadius: boolean;
}

export interface MatchingProvider {
  name: string;
  match(input: BlastCreateInput, config: BlastConfig): Promise<MatchResult>;
}

// ============================================================================
// Targets & responses
// ============================================================================

export type DriverResponseType = 'hmu' | 'counter' | 'pass' | 'expired';

export interface BlastDriverTargetSnapshot {
  id: string;
  blastId: string;
  driverId: string;
  matchScore: number;
  scoreBreakdown: Record<string, number>;
  notifiedAt: string | null;
  notificationChannels: ('push' | 'sms')[];
  hmuAt: string | null;
  counterPrice: number | null;
  passedAt: string | null;
  selectedAt: string | null;          // soft hold, 5min
  pullUpAt: string | null;            // hard, payment captured
  rejectedAt: string | null;
  interestAt: string | null;          // non-targeted driver expressed interest via /driver/requests
}

// ============================================================================
// Event log (per contract §9)
// ============================================================================

export type BlastEventType =
  | 'candidate_considered'
  | 'filter_failed'
  | 'scored'
  | 'notify_eligible'
  | 'notify_skipped'
  | 'sms_sent'
  | 'sms_delivered'
  | 'sms_failed'
  | 'push_sent'
  | 'push_delivered'
  | 'feed_impression'
  | 'deep_link_clicked'
  | 'offer_page_viewed'
  | 'hmu'
  | 'counter'
  | 'pass'
  | 'expired'
  | 'selected'
  | 'pull_up'
  | 'rejected';

export type BlastEventSource =
  | 'matcher'
  | 'notifier'
  | 'voipms_webhook'
  | 'client_beacon'
  | 'driver_action'
  | 'rider_action';

export interface BlastDriverEvent {
  id: string;
  blastId: string;
  driverId: string;
  eventType: BlastEventType;
  eventData: Record<string, unknown> | null;
  source: BlastEventSource;
  occurredAt: string;
}

// ============================================================================
// Schedule blocks
// ============================================================================

export type ScheduleBlockType = 'soft' | 'hard';

export interface DriverScheduleBlock {
  id: string;
  driverId: string;
  blastId: string | null;
  blockedFrom: string;
  blockedUntil: string;
  blockType: ScheduleBlockType;
  releasedAt: string | null;
  createdAt: string;
}

// ============================================================================
// Bandit / experiments
// ============================================================================

export interface BlastExperimentLogEntry {
  id: string;
  blastId: string;
  experimentId: string;
  armId: string;
  assignmentSeed: string | null;
  occurredAt: string;
}

export interface BlastModelVersion {
  id: string;
  modelKind: string;
  coefficients: Record<string, number>;
  trainingDataThrough: string | null;
  auc: number | null;
  calibration: Record<string, unknown> | null;
  deployed: boolean;
  createdAt: string;
}
