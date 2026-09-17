import * as fs from 'fs';
import * as path from 'path';
import type {
  UsageRecord,
  SourceMeta,
  SupportedProvider,
  TokenBreakdown,
  AdapterImportResult,
  ImportIssue,
} from '../types/index.js';
import { JsonUsageAdapter } from './JsonUsageAdapter.js';

export class ClineAdapter extends JsonUsageAdapter {
  readonly provider: SupportedProvider = 'cline';
  readonly parserVersion = 'cline-roo-v1';

  normalizeRecord(raw: any, sourceMeta: SourceMeta): UsageRecord | null {
    if (!raw || typeof raw !== 'object') return null;

    // Check for Cline/Roo ui_messages or task update format
    const tokens: TokenBreakdown = {};
    const usage = raw.usage ?? raw.payload?.usage ?? raw.apiMetrics;

    if (usage) {
      if (typeof usage.tokensIn === 'number') tokens.input = usage.tokensIn;
      else if (typeof usage.inputTokens === 'number') tokens.input = usage.inputTokens;
      else if (typeof usage.input === 'number') tokens.input = usage.input;

      if (typeof usage.tokensOut === 'number') tokens.output = usage.tokensOut;
      else if (typeof usage.outputTokens === 'number') tokens.output = usage.outputTokens;
      else if (typeof usage.output === 'number') tokens.output = usage.output;

      if (typeof usage.cacheReads === 'number') tokens.cacheRead = usage.cacheReads;
      if (typeof usage.cacheWrites === 'number') tokens.cacheWrite5m = usage.cacheWrites;
    }

    if (Object.keys(tokens).length === 0) return null;

    const model = raw.model ?? raw.apiConfiguration?.apiModelId ?? raw.modelId;
    const sessionId = raw.taskId ?? raw.sessionId ?? path.basename(path.dirname(sourceMeta.sourcePath));
    const observedAt = raw.ts ? new Date(raw.ts).toISOString() : new Date().toISOString();

    let cost = undefined;
    const totalCost = raw.totalCost ?? raw.cost ?? usage?.cost;
    if (typeof totalCost === 'number' && totalCost > 0) {
      cost = {
        amount: totalCost,
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

