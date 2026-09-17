import { useState, useEffect, useCallback, useRef } from 'react';
import { postMessage } from './vscode';
import type {
  ProviderResult,
  UsageSummary,
  BudgetState,
  ROIResult,
  ExtensionMessage,
  TimeRangeKind,
} from '../src/types/index';
import ProviderCard from './components/ProviderCard';
import TrendChart from './components/TrendChart';
import ModelLeaderboard from './components/ModelLeaderboard';
import ROICard from './components/ROICard';
import BudgetMeter from './components/BudgetMeter';
import ShareCard from './components/ShareCard';

// ── Utility ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

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

// ── Tab definitions ───────────────────────────────────────────────────────────

type Tab = 'overview' | 'trend' | 'leaderboard' | 'roi' | 'budget';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'trend', label: 'Trend' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'roi', label: 'ROI' },
  { id: 'budget', label: 'Budget' },
];

// ── Default states ────────────────────────────────────────────────────────────

const DEFAULT_SUMMARY: UsageSummary = {
  range: {
    kind: 'thisMonth',
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

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [providers, setProviders] = useState<ProviderResult[]>([]);
  const [summary, setSummary] = useState<UsageSummary>(DEFAULT_SUMMARY);
  const [budget, setBudget] = useState<BudgetState>(DEFAULT_BUDGET);
  const [roi, setROI] = useState<ROIResult>(DEFAULT_ROI);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  const tabsRef = useRef<Tab[]>(TABS.map((t) => t.id));

  // ── Message handler ────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as ExtensionMessage;
      if (!msg || !msg.type) return;

      if (msg.type === 'state') {
        setProviders(msg.data.providers);
        setSummary(msg.data.summary);
        setBudget(msg.data.budget);
        setROI(msg.data.roi);
        setLastUpdated(new Date());
        setIsLoading(false);
      } else if (msg.type === 'loading') {
        setIsLoading(msg.loading);
      } else if (msg.type === 'refreshing') {
        setRefreshingIds((prev) => {
          const next = new Set(prev);
          if (msg.refreshing) {
            next.add(msg.id);
          } else {
            next.delete(msg.id);
          }
          return next;
        });
      }
    };

    window.addEventListener('message', handler);
    postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Tick "Updated X ago" every 30s ────────────────────────────────────────

  useEffect(() => {
    if (!lastUpdated) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

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
      // Arrow keys cycle tabs
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

  // ── ROI rate change ────────────────────────────────────────────────────────

  const handleROIRateChange = useCallback((rate: number) => {
    postMessage({ type: 'setROIRate', hourlyRate: rate });
  }, []);

  // ── Budget change ──────────────────────────────────────────────────────────

  const handleBudgetChange = useCallback((monthly: number) => {
    postMessage({ type: 'setBudget', monthly });
    setBudget((prev) => ({ ...prev, monthly }));
  }, []);

  // ── Range change ───────────────────────────────────────────────────────────

  const handleRangeChange = useCallback((range: TimeRangeKind) => {
    postMessage({ type: 'setRange', range });
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const statusText = lastUpdated
    ? `Updated ${timeAgo(lastUpdated)}`
    : 'Not yet loaded';

  return (
    <div className="tokenlens-app">
      {/* Header */}
      <header className="tl-header">
        <div className="tl-header-brand">
          <span className="tl-brand-icon">🔭</span>
          <span className="tl-brand-name">TokenLens</span>
        </div>
        <div className="tl-header-actions">
          <span className="tl-status-label">{statusText}</span>
          <button
            className={`tl-btn-icon${isLoading ? ' spinning' : ''}`}
            onClick={refreshAll}
            title="Refresh all (R)"
            aria-label="Refresh all providers"
          >
            <RefreshIcon />
          </button>
          <button
            className="tl-btn-icon"
            onClick={() => postMessage({ type: 'openSettings' })}
            title="Open settings"
            aria-label="Open TokenLens settings"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="tl-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tl-tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Main content */}
      <main className="tl-main">
        {/* ── Overview ── */}
        {activeTab === 'overview' && (
          <div className="tl-tab-content">
            {/* Time range picker */}
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

            {/* Provider cards */}
            {isLoading && providers.length === 0 ? (
              <div className="tl-loading-state">
                <div className="tl-skeleton" style={{ height: 80, marginBottom: 8 }} />
                <div className="tl-skeleton" style={{ height: 80, marginBottom: 8 }} />
                <div className="tl-skeleton" style={{ height: 80 }} />
              </div>
            ) : providers.length === 0 ? (
              <div className="tl-empty-state">
                <span className="tl-empty-icon">🔭</span>
                <p>No providers loaded yet.</p>
                <button className="tl-empty-cta" onClick={refreshAll}>
                  Refresh Now
                </button>
              </div>
            ) : (
              <div className="tl-provider-list">
                {providers.map((result) => (
                  <ProviderCard
                    key={result.id}
                    result={result}
                    refreshing={refreshingIds.has(result.id)}
                  />
                ))}
              </div>
            )}

            {/* Summary totals strip */}
            {summary.totals.records > 0 && (
              <div className="tl-totals-strip">
                <div className="tl-total-item">
                  <span className="tl-total-label">Total Cost</span>
                  <span className="tl-total-value">
                    {summary.totals.cost
                      ? `$${summary.totals.cost.amount.toFixed(2)}`
                      : '—'}
                  </span>
                </div>
                <div className="tl-total-item">
                  <span className="tl-total-label">Records</span>
                  <span className="tl-total-value">{summary.totals.records.toLocaleString()}</span>
                </div>
                <div className="tl-total-item">
                  <span className="tl-total-label">Sessions</span>
                  <span className="tl-total-value">{summary.totals.sessions.toLocaleString()}</span>
                </div>
                <div className="tl-total-item">
                  <span className="tl-total-label">Models</span>
                  <span className="tl-total-value">{summary.totals.activeModels}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Trend ── */}
        {activeTab === 'trend' && (
          <div className="tl-tab-content">
            <TrendChart summary={summary} metric="cost" />
          </div>
        )}

        {/* ── Leaderboard ── */}
        {activeTab === 'leaderboard' && (
          <div className="tl-tab-content">
            <ModelLeaderboard summary={summary} />
          </div>
        )}

        {/* ── ROI ── */}
        {activeTab === 'roi' && (
          <div className="tl-tab-content">
            <ROICard roi={roi} onRateChange={handleROIRateChange} />
            <ShareCard summary={summary} budget={budget} roi={roi} />
          </div>
        )}

        {/* ── Budget ── */}
        {activeTab === 'budget' && (
          <div className="tl-tab-content">
            <BudgetMeter budget={budget} onBudgetChange={handleBudgetChange} />
          </div>
        )}
      </main>

      {/* Footer hint */}
      <footer className="tl-footer">
        <span>Press <kbd>R</kbd> to refresh · Arrow keys cycle tabs · 🔒 100% Local</span>
      </footer>
    </div>
  );
}
