import type { UsageRecord, CacheAnalytics } from '../types/index.js';

export class CacheAnalyticsService {
  calculate(records: UsageRecord[]): CacheAnalytics {
    let uncachedInputTokens = 0;
    let cachedReadTokens = 0;
    let cacheWriteTokens = 0;

    for (const r of records) {
      uncachedInputTokens += r.tokens.input ?? 0;
      cachedReadTokens += (r.tokens.cachedInput ?? 0) + (r.tokens.cacheRead ?? 0);
      cacheWriteTokens += (r.tokens.cacheWrite5m ?? 0) + (r.tokens.cacheWrite1h ?? 0);
    }

    const totalInputTokens = uncachedInputTokens + cachedReadTokens;
    const hitRatePercent =
      totalInputTokens > 0 ? Math.round((cachedReadTokens / totalInputTokens) * 1000) / 10 : 0;

    // Estimate savings: Cache reads cost ~10% of base input. So savings ~ 90% of base input price (~$3/1M average)
    const estimatedSavingsUsd =
      Math.round(((cachedReadTokens * 0.9 * 3.0) / 1_000_000) * 100) / 100;

    return {
      totalInputTokens,
      cachedReadTokens,
      cacheWriteTokens,
      uncachedInputTokens,
      hitRatePercent,
      estimatedSavingsUsd,
    };
  }
}

