import type {
  UsageRecord,
  TimeRange,
  UsageSummary,
  UsageSession,
  TokenBreakdown,
  ProviderSplit,
  ModelSplit,
  TrendBucket,
  TokenCategory,
  SupportedProvider,
} from '../types/index.js';
import type { PricingService } from './PricingService.js';
import { CacheAnalyticsService } from './CacheAnalyticsService.js';
import { OptimizationAdvisorService } from './OptimizationAdvisorService.js';
import { ProjectSplitService } from './ProjectSplitService.js';

export class UsageAggregator {
  private readonly cacheService = new CacheAnalyticsService();
  private readonly advisorService = new OptimizationAdvisorService();
  private readonly projectService = new ProjectSplitService();

  constructor(private readonly pricingService: PricingService) {}

  private addTokens(a: TokenBreakdown, b: TokenBreakdown): TokenBreakdown {
    const res: TokenBreakdown = { ...a };
    for (const [k, v] of Object.entries(b)) {
      const cat = k as TokenCategory;
      if (typeof v === 'number') {
        res[cat] = (res[cat] ?? 0) + v;
      }
    }
    return res;
  }

  aggregate(records: UsageRecord[], range: TimeRange): UsageSummary {
    const startMs = new Date(range.start).getTime();
    const endMs = new Date(range.end).getTime();

    // Filter by time range
    const inRange = records.filter((r) => {
      const time = new Date(r.startedAt ?? r.observedAt).getTime();
      return time >= startMs && time <= endMs;
    });

    const spanMs = endMs - startMs;
    const trendGranularity: 'hour' | 'day' = spanMs <= 48 * 3_600_000 ? 'hour' : 'day';

    let totalTokens: TokenBreakdown = {};
    let totalCostUsd = 0;
    const activeModels = new Set<string>();

    const sessionMap = new Map<string, UsageSession>();
    const providerMap = new Map<SupportedProvider, ProviderSplit>();
    const modelMap = new Map<string, ModelSplit>();
    const trendMap = new Map<string, TrendBucket>();

    for (const record of inRange) {
      if (record.model) activeModels.add(record.model);
      totalTokens = this.addTokens(totalTokens, record.tokens);

      // Estimate cost if not present
      let cost = record.cost;
      if (!cost) {
        const est = this.pricingService.estimateCost(record);
        if (est.available) cost = est.cost;
      }
      if (cost?.currency === 'USD') {
        totalCostUsd += cost.amount;
      }

      // 1. Session grouping: `${provider}:${sessionId ?? sourcePath}:${model}`
      const sId = record.sessionId ?? record.source.sourcePath;
      const sKey = `${record.provider}:${sId}:${record.model ?? 'unknown'}`;
      if (!sessionMap.has(sKey)) {
        sessionMap.set(sKey, {
          provider: record.provider,
          sessionId: sId,
          model: record.model,
          startedAt: record.startedAt ?? record.observedAt,
          endedAt: record.endedAt ?? record.observedAt,
          records: 0,
          tokens: {},
          cost: cost ? { amount: 0, currency: cost.currency, source: cost.source } : undefined,
          projectName: record.projectName,
        });
      }
      const sess = sessionMap.get(sKey)!;
      sess.records += 1;
      sess.tokens = this.addTokens(sess.tokens, record.tokens);
      if (cost && sess.cost) {
        sess.cost.amount += cost.amount;
      }
      if (record.endedAt && (!sess.endedAt || record.endedAt > sess.endedAt)) {
        sess.endedAt = record.endedAt;
      }

      // 2. Provider split
      if (!providerMap.has(record.provider)) {
        providerMap.set(record.provider, {
          provider: record.provider,
          records: 0,
          sessions: 0,
          tokens: {},
          cost: { amount: 0, currency: 'USD', source: 'calculated' },
        });
      }
      const pSplit = providerMap.get(record.provider)!;
      pSplit.records += 1;
      pSplit.tokens = this.addTokens(pSplit.tokens, record.tokens);
      if (cost && pSplit.cost) {
        pSplit.cost.amount += cost.amount;
      }

      // 3. Model split
      const mKey = `${record.provider}:${record.model ?? 'unknown'}`;
      if (!modelMap.has(mKey)) {
        modelMap.set(mKey, {
          provider: record.provider,
          model: record.model ?? 'unknown',
          records: 0,
          tokens: {},
          cost: { amount: 0, currency: 'USD', source: 'calculated' },
        });
      }
      const mSplit = modelMap.get(mKey)!;
      mSplit.records += 1;
      mSplit.tokens = this.addTokens(mSplit.tokens, record.tokens);
      if (cost && mSplit.cost) {
        mSplit.cost.amount += cost.amount;
      }

      // 4. Trend bucketing
      const obsDate = new Date(record.startedAt ?? record.observedAt);
      const bKey =
        trendGranularity === 'hour'
          ? obsDate.toISOString().slice(0, 13)
          : obsDate.toISOString().slice(0, 10);

      if (!trendMap.has(bKey)) {
        trendMap.set(bKey, {
          bucket: bKey,
          records: 0,
          sessions: 0,
          tokens: {},
          cost: { amount: 0, currency: 'USD', source: 'calculated' },
        });
      }
      const bData = trendMap.get(bKey)!;
      bData.records += 1;
      bData.tokens = this.addTokens(bData.tokens, record.tokens);
      if (cost && bData.cost) {
        bData.cost.amount += cost.amount;
      }
    }

    // Compute unique session counts per provider
    for (const sess of sessionMap.values()) {
      const p = providerMap.get(sess.provider);
      if (p) p.sessions += 1;
    }

    // Compute average cost per record in modelSplit
    const modelSplitArray = Array.from(modelMap.values())
      .map((m) => ({
        ...m,
        avgCostPerRecord: m.records > 0 ? (m.cost?.amount ?? 0) / m.records : 0,
      }))
      .sort((a, b) => (b.cost?.amount ?? 0) - (a.cost?.amount ?? 0));

    // Cache analytics, project split, optimization tips
    const cacheAnalytics = this.cacheService.calculate(inRange);
    const projectSplit = this.projectService.calculate(inRange);
    const optimizationTips = this.advisorService.generateTips(modelSplitArray, cacheAnalytics);

    const sortedTrend = Array.from(trendMap.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));

    return {
      range,
      totals: {
        records: inRange.length,
        sessions: sessionMap.size,
        tokens: totalTokens,
        cost: {
          amount: Math.round(totalCostUsd * 10000) / 10000,
          currency: 'USD',
          source: 'calculated',
        },
        activeModels: activeModels.size,
      },
      providerSplit: Array.from(providerMap.values()),
      modelSplit: modelSplitArray,
      projectSplit,
      cacheAnalytics,
      optimizationTips,
      trend: sortedTrend,
      trendGranularity,
      sessions: Array.from(sessionMap.values()).sort((a, b) => b.startedAt?.localeCompare(a.startedAt ?? '') ?? 0),
      warnings: [],
      errors: [],
      sourceMeta: [],
    };
  }
}
