import * as path from 'path';
import type { UsageRecord, SourceMeta, SupportedProvider, TokenBreakdown } from '../types/index.js';
import { JsonUsageAdapter } from './JsonUsageAdapter.js';

export class CodexAdapter extends JsonUsageAdapter {
  readonly provider: SupportedProvider = 'codex';
  readonly parserVersion = 'codex-jsonl-v1';

  private lastTotalUsageBySession = new Map<string, { input: number; cachedInput: number; output: number }>();

  normalizeRecord(raw: any, sourceMeta: SourceMeta): UsageRecord | null {
    if (!raw || typeof raw !== 'object') return null;

    const sessionId =
      raw.sessionId ??
      raw.session_id ??
      path.basename(sourceMeta.sourcePath, path.extname(sourceMeta.sourcePath));

    const observedAt = raw.timestamp ?? raw.created_at ?? new Date().toISOString();
    let model = raw.model ?? raw.payload?.model ?? raw.info?.model;

    let tokens: TokenBreakdown = {};

    // 1. Token count events from Codex CLI
    if (raw.type === 'event_msg' && raw.payload?.type === 'token_count') {
      const info = raw.payload.info;
      const total = info?.total_token_usage;

      if (total) {
        const last = this.lastTotalUsageBySession.get(sessionId) ?? { input: 0, cachedInput: 0, output: 0 };
        const currInput = total.input_tokens ?? 0;
        const currCached = total.cached_input_tokens ?? 0;
        const currOutput = total.output_tokens ?? 0;

        const deltaInput = Math.max(0, currInput - last.input);
        const deltaCached = Math.max(0, currCached - last.cachedInput);
        const deltaOutput = Math.max(0, currOutput - last.output);

        this.lastTotalUsageBySession.set(sessionId, {
          input: currInput,
          cachedInput: currCached,
          output: currOutput,
        });

        // Split uncached input
        tokens.input = Math.max(0, deltaInput - deltaCached);
        if (deltaCached > 0) tokens.cachedInput = deltaCached;
        if (deltaOutput > 0) tokens.output = deltaOutput;
      } else if (info?.last_token_usage) {
        const last = info.last_token_usage;
        const inp = last.input_tokens ?? 0;
        const cached = last.cached_input_tokens ?? 0;
        tokens.input = Math.max(0, inp - cached);
        if (cached > 0) tokens.cachedInput = cached;
        if (last.output_tokens > 0) tokens.output = last.output_tokens;
      }
    } else {
      // 2. Generic usage structure
      const usage = raw.usage ?? raw.payload?.usage ?? raw.response?.usage;
      if (usage) {
        const rawTokens = this.normalizeTokens(usage);
        if (rawTokens.input != null && rawTokens.cachedInput != null) {
          tokens.input = Math.max(0, rawTokens.input - rawTokens.cachedInput);
          tokens.cachedInput = rawTokens.cachedInput;
        } else {
          tokens.input = rawTokens.input;
        }
        tokens.output = rawTokens.output;
      }
    }

    if (Object.keys(tokens).length === 0) return null;

    return {
      provider: this.provider,
      model,
      sessionId,
      observedAt,
      tokens,
      source: sourceMeta,
      raw,
    };
  }
}

