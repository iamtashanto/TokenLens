import type { UsageRecord, SourceMeta, SupportedProvider } from '../types/index.js';
import { JsonUsageAdapter } from './JsonUsageAdapter.js';

export class ClaudeAdapter extends JsonUsageAdapter {
  readonly provider: SupportedProvider = 'claude';
  readonly parserVersion = 'claude-jsonl-v1';

  normalizeRecord(raw: any, sourceMeta: SourceMeta): UsageRecord | null {
    if (!raw || typeof raw !== 'object') return null;

    // Ignore system logs
    if (raw.role === 'system' || raw.type === 'system') return null;

    const model =
      raw.model ??
      raw.message?.model ??
      raw.response?.model ??
      raw.payload?.model;

    const sessionId =
      raw.sessionId ??
      raw.session_id ??
      raw.conversationId ??
      raw.conversation_id;

    const observedAt =
      raw.timestamp ??
      raw.created_at ??
      raw.createdAt ??
      new Date().toISOString();

    const usageObj =
      raw.usage ??
      raw.message?.usage ??
      raw.response?.usage ??
      raw.tokens ??
      raw;

    const tokens = this.normalizeTokens(usageObj);
    if (Object.keys(tokens).length === 0) return null;

    // Direct imported cost if Claude CLI recorded it
    let cost = undefined;
    const costUsd =
      raw.costUsd ??
      raw.cost_usd ??
      raw.totalCostUsd ??
      raw.message?.usage?.cost?.total;

    if (typeof costUsd === 'number' && costUsd > 0) {
      cost = {
        amount: costUsd,
        currency: 'USD',
        source: 'imported' as const,
      };
    }

    return {
      provider: this.provider,
      model,
      sessionId,
      observedAt,
      tokens,
      cost,
      source: sourceMeta,
      raw,
    };
  }
}
