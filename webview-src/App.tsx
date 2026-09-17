import { useState, useEffect, useCallback, useRef } from 'react';
import { postMessage } from './vscode';
import type {
  ProviderResult,
  UsageSummary,
  BudgetState,
  ROIResult,
  ExtensionMessage,
  TimeRangeKind,
  SupportedCurrency,
  DisplayCurrencyState,
} from '../src/types/index';
import ProviderCard from './components/ProviderCard';
import TrendChart from './components/TrendChart';
import ModelLeaderboard from './components/ModelLeaderboard';
import ROICard from './components/ROICard';
import BudgetMeter from './components/BudgetMeter';
import ShareCard from './components/ShareCard';
import CacheAnalyzer from './components/CacheAnalyzer';
import OptimizationTips from './components/OptimizationTips';
import ProjectBreakdown from './components/ProjectBreakdown';
import CurrencySwitcher from './components/CurrencySwitcher';
import ExportModal from './components/ExportModal';

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.38 1.07V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.07-.38H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .38-1.07V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.35.69.6 1 .29.24.67.38 1.07.38H21a2 2 0 1 1 0 4h-.09c-.4 0-.78.14-1.07.38-.25.31-.46.64-.6 1Z" />
    </svg>
  );
}

type Tab = 'overview' | 'trend' | 'cache' | 'insights' | 'leaderboard' | 'projects' | 'roi' | 'budget' | 'export';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Quotas', icon: '⏱️' },
  { id: 'trend', label: 'Trend', icon: '📈' },
  { id: 'cache', label: 'Cache', icon: '⚡' },
  { id: 'insights', label: 'Advisor', icon: '💡' },
  { id: 'leaderboard', label: 'Models', icon: '🏆' },
  { id: 'projects', label: 'Projects', icon: '📁' },
  { id: 'roi', label: 'ROI', icon: '🚀' },
  { id: 'budget', label: 'Budget', icon: '💰' },
  { id: 'export', label: 'Export', icon: '📊' },
];

const DEFAULT_CURRENCY: DisplayCurrencyState = {
  code: 'USD',
  symbol: '$',
  rate: 1.0,
  source: 'fallback',
};

const DEFAULT_SUMMARY: UsageSummary = {
  range: {
    kind: 'thisWeek',
    startDate: '',
    endDate: '',
    start: '',
    end: '',
  },
  totals: {
    records: 0,
    sessions: 0,
    tokens: {},
    activeModels: 0,
  },
  providerSplit: [],
  modelSplit: [],
  projectSplit: [],
  cacheAnalytics: {
    totalInputTokens: 0,
    cachedReadTokens: 0,
    cacheWriteTokens: 0,
    uncachedInputTokens: 0,
    hitRatePercent: 0,
    estimatedSavingsUsd: 0,
  },
  optimizationTips: [],
  trend: [],
  trendGranularity: 'day',
  sessions: [],
  warnings: [],
  errors: [],
  sourceMeta: [],
};

const DEFAULT_BUDGET: BudgetState = {
  monthly: 20,
  alertEnabled: true,
  currentSpend: 0,
  percent: 0,
  alertLevel: 'safe',
};

const DEFAULT_ROI: ROIResult = {
  totalCost: 0,
  estimatedSessions: 0,
  savedHours: 0,
  savedMoney: 0,
  roi: 0,
};

export default function App() {
  const [providers, setProviders] = useState<ProviderResult[]>([]);
  const [summary, setSummary] = useState<UsageSummary>(DEFAULT_SUMMARY);
  const [budget, setBudget] = useState<BudgetState>(DEFAULT_BUDGET);
  const [roi, setROI] = useState<ROIResult>(DEFAULT_ROI);
  const [currency, setCurrency] = useState<DisplayCurrencyState>(DEFAULT_CURRENCY);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  const tabsRef = useRef<Tab[]>(TABS.map((t) => t.id));

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as ExtensionMessage;
      if (!msg || !msg.type) return;

      if (msg.type === 'state') {
        setProviders(msg.data.providers);
        setSummary(msg.data.summary);
        setBudget(msg.data.budget);
        setROI(msg.data.roi);
        if (msg.data.currency) setCurrency(msg.data.currency);
        setLastUpdated(new Date());
        setIsLoading(false);
      } else if (msg.type === 'loading') {
        setIsLoading(msg.loading);
      } else if (msg.type === 'refreshing') {
        setRefreshingIds((prev) => {
          const next = new Set(prev);
          if (msg.refreshing) next.add(msg.id);
          else next.delete(msg.id);
          return next;
        });
      }
    };

    window.addEventListener('message', handler);
    postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (!lastUpdated) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const refreshAll = useCallback(() => {
    postMessage({ type: 'refreshAll' });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        refreshAll();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        setActiveTab((prev) => {
          const tabs = tabsRef.current;
          const idx = tabs.indexOf(prev);
          const next = e.key === 'ArrowRight'
            ? (idx + 1) % tabs.length
            : (idx - 1 + tabs.length) % tabs.length;
          return tabs[next] ?? prev;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [refreshAll]);

  const handleROIRateChange = useCallback((rate: number) => {
    postMessage({ type: 'setROIRate', hourlyRate: rate });
  }, []);

  const handleBudgetChange = useCallback((monthly: number) => {
    postMessage({ type: 'setBudget', monthly });
    setBudget((prev) => ({ ...prev, monthly }));
  }, []);

  const handleRangeChange = useCallback((range: TimeRangeKind) => {
    postMessage({ type: 'setRange', range });
  }, []);

  const handleCurrencyChange = useCallback((code: SupportedCurrency) => {
    postMessage({ type: 'setCurrency', currency: code });
  }, []);

  const statusText = lastUpdated
    ? `Updated ${timeAgo(lastUpdated)}`
    : 'Connecting...';

  const totalCostConverted = (summary.totals.cost?.amount ?? 0) * currency.rate;
  const formattedTotalCost =
    currency.code === 'JPY'
      ? `${currency.symbol}${Math.round(totalCostConverted).toLocaleString()}`
      : `${currency.symbol}${totalCostConverted.toFixed(2)}`;

  const [filterMode, setFilterMode] = useState<'active' | 'all'>('active');

  const isConnected = (p: ProviderResult) =>
    !p.error &&
    p.lines.some(
      (l) =>
        l.type === 'progress' ||
        (l.type === 'badge' &&
          !l.text.toLowerCase().includes('not installed') &&
          !l.text.toLowerCase().includes('idle') &&
          !l.text.toLowerCase().includes('unconfigured')),
    );

  const activeProviders = providers.filter(isConnected);
  const inactiveProviders = providers.filter((p) => !isConnected(p));
  const displayedProviders =
    filterMode === 'active' && activeProviders.length > 0
      ? activeProviders
      : [...activeProviders, ...inactiveProviders];

  return (
    <div className="tokenlens-app">
      {/* Top Header */}
      <header className="tl-header">
        <div className="tl-header-brand">
          <span className="tl-brand-icon">🔭</span>
          <span className="tl-brand-name">TokenLens</span>
          <span className="tl-brand-version">v0.1.1</span>
        </div>
        <div className="tl-header-actions">
          <span className="tl-status-label">{statusText}</span>
          <button
            className={`tl-btn-icon${isLoading ? ' spinning' : ''}`}
            onClick={refreshAll}
            title="Refresh all (R)"
          >
            <RefreshIcon />
          </button>
          <button
            className="tl-btn-icon"
            onClick={() => postMessage({ type: 'openSettings' })}
            title="Open settings"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {/* Currency Switcher Bar */}
      <CurrencySwitcher currency={currency} onCurrencyChange={handleCurrencyChange} />

      {/* Navigation Tabs */}
      <nav className="tl-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tl-tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tl-tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Main Content Area */}
      <main className="tl-main">
        {/* ── Overview & Quotas ── */}
        {activeTab === 'overview' && (
          <div className="tl-tab-content">
            {/* Range Selector */}
            <div className="tl-range-row">
              {(['today', 'thisWeek', 'thisMonth', 'lastMonth'] as TimeRangeKind[]).map((kind) => (
                <button
                  key={kind}
                  className={`tl-range-btn${summary.range.kind === kind ? ' active' : ''}`}
                  onClick={() => handleRangeChange(kind)}
                >
                  {kind === 'today' ? 'Today'
                    : kind === 'thisWeek' ? 'This Week'
                    : kind === 'thisMonth' ? 'This Month'
                    : 'Last Month'}
                </button>
              ))}
            </div>

            {/* Quick KPI Strip */}
            <div className="tl-totals-strip">
              <div className="tl-total-item">
                <span className="tl-total-label">Total Spend ({currency.code})</span>
                <strong className="tl-total-value">{formattedTotalCost}</strong>
              </div>
              <div className="tl-total-item">
                <span className="tl-total-label">AI Sessions</span>
                <strong className="tl-total-value">{summary.totals.sessions.toLocaleString()}</strong>
              </div>
              <div className="tl-total-item">
                <span className="tl-total-label">Cache Hit Rate</span>
                <strong className="tl-total-value text-green">
                  {summary.cacheAnalytics.hitRatePercent}%
                </strong>
              </div>
              <div className="tl-total-item">
                <span className="tl-total-label">Active Models</span>
                <strong className="tl-total-value text-purple">{summary.totals.activeModels}</strong>
              </div>
            </div>

            {/* Provider Rate Limits & Reset Countdowns Header */}
            <div className="tl-provider-header-row">
              <span className="tl-section-title">AI Quotas & Rate Limits</span>
              {activeProviders.length > 0 && inactiveProviders.length > 0 && (
                <div className="tl-filter-pills">
                  <button
                    className={`tl-filter-pill${filterMode === 'active' ? ' active' : ''}`}
                    onClick={() => setFilterMode('active')}
                  >
                    Active ({activeProviders.length})
                  </button>
                  <button
                    className={`tl-filter-pill${filterMode === 'all' ? ' active' : ''}`}
                    onClick={() => setFilterMode('all')}
                  >
                    All ({providers.length})
                  </button>
                </div>
              )}
            </div>

            {/* Provider Cards */}
            {isLoading && providers.length === 0 ? (
              <div className="tl-loading-state">
                <div className="tl-skeleton" style={{ height: 90, marginBottom: 8 }} />
                <div className="tl-skeleton" style={{ height: 90, marginBottom: 8 }} />
                <div className="tl-skeleton" style={{ height: 90 }} />
              </div>
            ) : displayedProviders.length === 0 ? (
              <div className="tl-empty-state">
                <span className="tl-empty-icon">🔭</span>
                <p>No active AI providers detected.</p>
                <button className="tl-empty-cta" onClick={() => setFilterMode('all')}>
                  Show All Providers ({providers.length})
                </button>
              </div>
            ) : (
              <div className="tl-provider-list">
                {displayedProviders.map((result) => (
                  <ProviderCard
                    key={result.id}
                    result={result}
                    currency={currency}
                    refreshing={refreshingIds.has(result.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Trend Chart ── */}
        {activeTab === 'trend' && (
          <div className="tl-tab-content">
            <TrendChart summary={summary} metric="cost" />
          </div>
        )}

        {/* ── Prompt Cache Analyzer ── */}
        {activeTab === 'cache' && (
          <div className="tl-tab-content">
            <CacheAnalyzer cache={summary.cacheAnalytics} currency={currency} />
          </div>
        )}

        {/* ── AI Cost Optimization Advisor ── */}
        {activeTab === 'insights' && (
          <div className="tl-tab-content">
            <OptimizationTips tips={summary.optimizationTips} currency={currency} />
          </div>
        )}

        {/* ── Model Leaderboard ── */}
        {activeTab === 'leaderboard' && (
          <div className="tl-tab-content">
            <ModelLeaderboard summary={summary} />
          </div>
        )}

        {/* ── Workspace / Project Breakdown ── */}
        {activeTab === 'projects' && (
          <div className="tl-tab-content">
            <ProjectBreakdown projects={summary.projectSplit} currency={currency} />
          </div>
        )}

        {/* ── ROI Calculator & Share Card ── */}
        {activeTab === 'roi' && (
          <div className="tl-tab-content">
            <ROICard roi={roi} onRateChange={handleROIRateChange} />
            <ShareCard summary={summary} budget={budget} roi={roi} />
          </div>
        )}

        {/* ── Smart Budget ── */}
        {activeTab === 'budget' && (
          <div className="tl-tab-content">
            <BudgetMeter budget={budget} onBudgetChange={handleBudgetChange} />
          </div>
        )}

        {/* ── Data Export ── */}
        {activeTab === 'export' && (
          <div className="tl-tab-content">
            <ExportModal />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="tl-footer">
        <span>Press <kbd>R</kbd> to refresh · Arrow keys cycle tabs · 🔒 100% Local</span>
      </footer>
    </div>
  );
}
