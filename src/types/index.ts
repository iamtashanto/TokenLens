// ============================================================
// TokenLens — Shared Types
// Combines patterns from smart-usage-bar, usagedock, and ai-code-usage
// ============================================================

// ------------------------------------------------------------------
// Provider Data Types (usagedock MetricLine system)
// ------------------------------------------------------------------

export type MetricFormat = {
  kind: 'percent' | 'dollars' | 'count';
  suffix?: string; // e.g. 'credits' for count kind
};

export interface ProgressLine {
  type: 'progress';
  label: string;
  used: number; // value used (percent 0-100, dollars, or count)
  limit: number; // max value
  format: MetricFormat;
  resetsAt?: string | null; // ISO 8601 datetime string
}

export interface TextLine {
  type: 'text';
  label: string;
  value: string;
}

export interface BadgeLine {
  type: 'badge';
  label: string;
  text: string;
  color?: string; // hex color
}

export type MetricLine = ProgressLine | TextLine | BadgeLine;

/** Full result returned by every provider's fetch() */
export interface ProviderResult {
  id: string; // 'claude' | 'cursor' | 'copilot' | ...
  name: string; // Display name
  icon: string; // Icon key for webview
  brandColor: string; // Hex accent color
  plan?: string | null; // Plan name (e.g. "Pro", "Business")
  lines: MetricLine[];
  error?: string | null;
}

// ------------------------------------------------------------------
// Local Log / JSONL Types (ai-code-usage pattern)
// ------------------------------------------------------------------

export type SupportedProvider = 'claude' | 'codex' | 'grok';

export type TokenCategory =
  | 'input'
  | 'output'
  | 'cachedInput'
  | 'cacheRead'
  | 'cacheWrite5m'
  | 'cacheWrite1h'
  | 'unknown';

export type TokenBreakdown = Partial<Record<TokenCategory, number>>;

export type CostSource = 'calculated' | 'imported';

export type UsageCost = {
  amount: number;
  currency: string; // e.g. "USD"
  source: CostSource;
  note?: string; // "partial" when some records are unpriced
};

export type SourceMeta = {
  sourcePath: string;
  sourceKind: 'json' | 'jsonl' | 'sqlite' | 'directory';
  parserVersion: string;
  readAt: string; // ISO timestamp
};

export type UsageRecord = {
  provider: SupportedProvider;
  model?: string;
  sessionId?: string;
  startedAt?: string; // ISO timestamp
  endedAt?: string;
  observedAt: string; // ISO timestamp (always present)
  tokens: TokenBreakdown;
  cost?: UsageCost;
  source: SourceMeta;
  raw?: unknown;
};

export type AdapterImportResult = {
  provider: SupportedProvider;
  records: UsageRecord[];
  warnings: ImportIssue[];
  errors: ImportIssue[];
  sourceMeta: SourceMeta[];
};

export type ImportIssue = {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  sourcePath?: string;
  line?: number;
};

// ------------------------------------------------------------------
// Time Range Types
// ------------------------------------------------------------------

export type TimeRangeKind =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom';

export type TimeRange = {
  kind: TimeRangeKind;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
  start: string; // ISO UTC start
  end: string; // ISO UTC end
};

// ------------------------------------------------------------------
// Aggregated Usage Summary (for dashboard)
// ------------------------------------------------------------------

export type UsageSession = {
  provider: SupportedProvider;
  sessionId: string;
  model?: string;
  startedAt?: string;
  endedAt?: string;
  records: number;
  tokens: TokenBreakdown;
  cost?: UsageCost;
};

export type TrendBucket = {
  bucket: string; // "YYYY-MM-DD" or "YYYY-MM-DDTHH"
  records: number;
  sessions: number;
  tokens: TokenBreakdown;
  cost?: UsageCost;
};

export type ProviderSplit = {
  provider: SupportedProvider;
  records: number;
  sessions: number;
  tokens: TokenBreakdown;
  cost?: UsageCost;
};

export type ModelSplit = {
  provider: SupportedProvider;
  model: string;
  records: number;
  tokens: TokenBreakdown;
  cost?: UsageCost;
};

export type UsageSummary = {
  range: TimeRange;
  totals: {
    records: number;
    sessions: number;
    tokens: TokenBreakdown;
    cost?: UsageCost;
    activeModels: number;
  };
  providerSplit: ProviderSplit[];
  modelSplit: ModelSplit[];
  trend: TrendBucket[];
  trendGranularity: 'hour' | 'day';
  sessions: UsageSession[];
  warnings: ImportIssue[];
  errors: ImportIssue[];
  sourceMeta: SourceMeta[];
};

// ------------------------------------------------------------------
// Pricing Types
// ------------------------------------------------------------------

export type PricingRule = {
  provider: string;
  model: string;
  modelAliases: string[];
  currency: string;
  priceUnit: 'per_1m_tokens';
  sourceUrl: string;
  checkedAt: string;
  rates: Partial<Record<TokenCategory, number>>;
  longContext?: {
    appliesAboveInputTokens: number;
    rates: PricingRule['rates'];
  };
};

export type CostEstimate =
  | { available: true; cost: UsageCost }
  | {
      available: false;
      reason: 'unknown_model' | 'missing_tokens' | 'missing_pricing_metadata';
      importedCost?: UsageCost;
    };

// ------------------------------------------------------------------
// Budget & ROI Types (TokenLens exclusive)
// ------------------------------------------------------------------

export type AlertLevel = 'safe' | 'warning' | 'critical' | 'panic';

export interface BudgetState {
  monthly: number;
  alertEnabled: boolean;
  currentSpend: number;
  percent: number;
  alertLevel: AlertLevel;
}

export interface ROIConfig {
  hourlyRate: number;
  minutesPerInteraction: number;
}

export interface ROIResult {
  totalCost: number;
  estimatedSessions: number;
  savedHours: number;
  savedMoney: number;
  roi: number; // percentage
}

// ------------------------------------------------------------------
// Webview Message Protocol
// ------------------------------------------------------------------

/** Full dashboard state sent from Extension → Webview */
export interface DashboardState {
  providers: ProviderResult[]; // Live API data from all providers
  summary: UsageSummary; // Aggregated JSONL/local log data
  budget: BudgetState;
  roi: ROIResult;
  updatedAt: string; // ISO timestamp
}

/** Messages from Extension → Webview */
export type ExtensionMessage =
  | { type: 'state'; data: DashboardState }
  | { type: 'loading'; loading: boolean }
  | { type: 'refreshing'; id: string; refreshing: boolean }
  | { type: 'error'; message: string };

/** Messages from Webview → Extension */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'refreshAll' }
  | { type: 'refreshProvider'; id: string }
  | { type: 'setRange'; range: TimeRangeKind }
  | { type: 'setBudget'; monthly: number }
  | { type: 'setROIRate'; hourlyRate: number }
  | { type: 'exportPNG' }
  | { type: 'openSettings' }
  | { type: 'detectSources' };

// ------------------------------------------------------------------
// Exchange Rate Types
// ------------------------------------------------------------------

export type PublicExchangeRates = {
  updatedAt: string;
  rates: Record<string, number>;
};

export type DisplayCurrencyState = {
  code: string;
  rate: number; // multiplier from USD
  source: 'manual' | 'public' | 'fallback';
};
