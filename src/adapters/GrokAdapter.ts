import type { UsageRecord, SourceMeta, SupportedProvider, TokenBreakdown } from '../types/index.js';
import { JsonUsageAdapter } from './JsonUsageAdapter.js';

export class GrokAdapter extends JsonUsageAdapter {
  readonly provider: SupportedProvider = 'grok';
  readonly parserVersion = 'grok-acp-v1';

  normalizeRecord(raw: any, sourceMeta: SourceMeta): UsageRecord | null {
    if (!raw || typeof raw !== 'object') return null;

    // Check for Grok ACP updates.jsonl format
    const update = raw.params?.update;
    const usage = update?.usage?.modelUsage;
    const timestamp = raw.timestamp ?? raw.params?.timestamp;

    if (usage && typeof usage === 'object') {
      const observedAt = timestamp ? new Date(timestamp * (timestamp < 1e12 ? 1000 : 1)).toISOString() : new Date().toISOString();

      // Find first model in modelUsage
      const [modelName, mData] = Object.entries(usage)[0] as [string, any];
      if (!mData) return null;

      const inputTokens = mData.inputTokens ?? mData.input_tokens ?? 0;
      const cachedReadTokens = mData.cachedReadTokens ?? mData.cached_read_tokens ?? 0;
      const outputTokens = mData.outputTokens ?? mData.output_tokens ?? 0;

      const tokens: TokenBreakdown = {
        input: Math.max(0, inputTokens - cachedReadTokens),
        output: outputTokens,
      };
      if (cachedReadTokens > 0) {
        tokens.cacheRead = cachedReadTokens;
      }

      let cost = undefined;
      const costUsdTicks = mData.costUsdTicks ?? mData.cost_usd_ticks;
      if (typeof costUsdTicks === 'number') {
        cost = {
          amount: costUsdTicks / 1e10,
          currency: 'USD',
          source: 'imported' as const,
        };
      }

      return {
        provider: this.provider,
        model: modelName,
        sessionId: raw.sessionId ?? raw.params?.sessionId,
        observedAt,
        tokens,
        cost,
        source: sourceMeta,
        raw,
      };
    }

    // Generic fallback
    const genericUsage = raw.usage ?? raw.payload?.usage;
    if (genericUsage) {
      const tokens = this.normalizeTokens(genericUsage);
      if (Object.keys(tokens).length === 0) return null;

      return {
        provider: this.provider,
        model: raw.model ?? raw.payload?.model,
        sessionId: raw.sessionId,
        observedAt: raw.timestamp ? new Date(raw.timestamp).toISOString() : new Date().toISOString(),
        tokens,
        source: sourceMeta,
        raw,
      };
    }

    return null;
  }
}

