// ============================================================
// TokenLens — Comprehensive Shared Types
// ============================================================

// ------------------------------------------------------------------
// Provider Data Types (Enhanced MetricLine system)
// ------------------------------------------------------------------

export type MetricFormat = {
  kind: 'percent' | 'dollars' | 'count';
  suffix?: string; // e.g. 'credits', 'req/min', 'tokens'
};

export interface ProgressLine {
  type: 'progress';
  label: string;
  used: number; // value used (percent 0-100, dollars, or count)
  limit: number; // max value
  format: MetricFormat;
  resetsAt?: string | null; // ISO 8601 datetime string
  resetPeriodLabel?: string; // e.g. "5-Hour Window", "Weekly Limit", "Monthly Reset"
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
  color?: string; // hex or theme color
}

export type MetricLine = ProgressLine | TextLine | BadgeLine;

/** Result returned by every provider */
export interface ProviderResult {
  id: string; // 'claude' | 'cursor' | 'copilot' | 'openrouter' | ...
  name: string; // Display name
  icon: string; // Icon key for webview
  brandColor: string; // Hex accent color
  plan?: string | null; // e.g. "Pro", "Business", "Free"
  lines: MetricLine[];
  error?: string | null;
  quotaSummary?: {
    primaryPercent?: number;
    primaryResetIso?: string | null;
    primaryResetLabel?: string;
    monthlySpendUsd?: number;
  };
}

// ------------------------------------------------------------------
// Local Log / JSONL Types
// ------------------------------------------------------------------

export type SupportedProvider =
  | 'claude'
  | 'codex'
  | 'grok'
  | 'cline'
  | 'roocode'
  | 'openrouter'
  | 'groq';

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
  note?: string;
};

export type SourceMeta = {
  sourcePath: string;
  sourceKind: 'json' | 'jsonl' | 'sqlite' | 'directory';
  parserVersion: string;
  readAt: string;
  projectName?: string;
};

export type UsageRecord = {
  provider: SupportedProvider;
  model?: string;
  sessionId?: string;
  startedAt?: string;
  endedAt?: string;
  observedAt: string;
  tokens: TokenBreakdown;
  cost?: UsageCost;
  projectName?: string;
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
// Aggregated Usage Summary
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
  projectName?: string;
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
  avgCostPerRecord?: number;
};

export type ProjectSplit = {
  projectName: string;
  records: number;
  sessions: number;
  tokens: TokenBreakdown;
  costUsd: number;
  topModel?: string;
};

export type CacheAnalytics = {
  totalInputTokens: number;
  cachedReadTokens: number;
  cacheWriteTokens: number;
  uncachedInputTokens: number;
  hitRatePercent: number;
  estimatedSavingsUsd: number;
};

export type OptimizationTip = {
  id: string;
  title: string;
  description: string;
  projectedMonthlySavingsUsd: number;
  impactLevel: 'high' | 'medium' | 'low';
  category: 'model_downgrade' | 'cache_utilization' | 'session_length';
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
  projectSplit: ProjectSplit[];
  cacheAnalytics: CacheAnalytics;
  optimizationTips: OptimizationTip[];
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
// Budget & ROI Types
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
// Currency Support
// ------------------------------------------------------------------

export type SupportedCurrency = 'USD' | 'BDT' | 'EUR' | 'GBP' | 'INR' | 'JPY' | 'CAD' | 'AUD';

export interface DisplayCurrencyState {
  code: SupportedCurrency | string;
  symbol: string;
  rate: number; // multiplier from USD
  source: 'manual' | 'public' | 'fallback';
}

export type PublicExchangeRates = {
  updatedAt: string;
  rates: Record<string, number>;
};

// ------------------------------------------------------------------
// Webview Message Protocol
// ------------------------------------------------------------------

export interface DashboardState {
  providers: ProviderResult[];
  summary: UsageSummary;
  budget: BudgetState;
  roi: ROIResult;
  currency: DisplayCurrencyState;
  updatedAt: string;
}

export type ExtensionMessage =
  | { type: 'state'; data: DashboardState }
  | { type: 'loading'; loading: boolean }
  | { type: 'refreshing'; id: string; refreshing: boolean }
  | { type: 'error'; message: string };

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'refreshAll' }
  | { type: 'refreshProvider'; id: string }
  | { type: 'setRange'; range: TimeRangeKind }
  | { type: 'setBudget'; monthly: number }
  | { type: 'setROIRate'; hourlyRate: number }
  | { type: 'setCurrency'; currency: SupportedCurrency }
  | { type: 'exportCSV' }
  | { type: 'exportJSON' }
  | { type: 'exportPNG' }
  | { type: 'openSettings' }
  | { type: 'detectSources' };
