import * as fs from 'fs';
import * as path from 'path';
import type {
  UsageRecord,
  AdapterImportResult,
  ImportIssue,
  SourceMeta,
  SupportedProvider,
  TokenBreakdown,
} from '../types/index.js';
import { streamJsonlLines } from './jsonlStream.js';

export abstract class JsonUsageAdapter {
  abstract readonly provider: SupportedProvider;
  abstract readonly parserVersion: string;

  protected normalizeTokens(source: any): TokenBreakdown {
    if (!source || typeof source !== 'object') return {};

    const input =
      source.input ??
      source.inputTokens ??
      source.input_tokens ??
      source.prompt_tokens ??
      0;

    const output =
      source.output ??
      source.outputTokens ??
      source.output_tokens ??
      source.completion_tokens ??
      0;

    const cachedInput =
      source.cachedInput ??
      source.cached_input ??
      source.cachedInputTokens ??
      source.cached_input_tokens;

    const cacheRead =
      source.cacheRead ??
      source.cache_read ??
      source.cache_read_input_tokens;

    const cacheWrite5m =
      source.cacheWrite5m ??
      source.cache_write_5m ??
      source.cacheWrite ??
      source.cache_write ??
      source.cache_creation_input_tokens ??
      source.ephemeral_5m_input_tokens;

    const cacheWrite1h =
      source.cacheWrite1h ??
      source.cache_write_1h ??
      source.ephemeral_1h_input_tokens;

    const tokens: TokenBreakdown = {};
    if (typeof input === 'number' && input > 0) tokens.input = input;
    if (typeof output === 'number' && output > 0) tokens.output = output;
    if (typeof cachedInput === 'number' && cachedInput > 0) tokens.cachedInput = cachedInput;
    if (typeof cacheRead === 'number' && cacheRead > 0) tokens.cacheRead = cacheRead;
    if (typeof cacheWrite5m === 'number' && cacheWrite5m > 0) tokens.cacheWrite5m = cacheWrite5m;
    if (typeof cacheWrite1h === 'number' && cacheWrite1h > 0) tokens.cacheWrite1h = cacheWrite1h;

    return tokens;
  }

  abstract normalizeRecord(raw: any, sourceMeta: SourceMeta): UsageRecord | null;

  async importUsage(filePaths: string[]): Promise<AdapterImportResult> {
    const records: UsageRecord[] = [];
    const warnings: ImportIssue[] = [];
    const errors: ImportIssue[] = [];
    const sourceMetaList: SourceMeta[] = [];

    for (const p of filePaths) {
      if (!fs.existsSync(p)) continue;
      const stat = fs.statSync(p);

      if (stat.isDirectory()) {
        const files = this.collectFiles(p);
        for (const file of files) {
          await this.parseFile(file, records, warnings, errors, sourceMetaList);
        }
      } else {
        await this.parseFile(p, records, warnings, errors, sourceMetaList);
      }
    }

    return {
      provider: this.provider,
      records,
      warnings,
      errors,
      sourceMeta: sourceMetaList,
    };
  }

  private collectFiles(dir: string, maxDepth = 4, depth = 0): string[] {
    if (depth > maxDepth || !fs.existsSync(dir)) return [];
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.collectFiles(full, maxDepth, depth + 1));
        } else if (/\.(json|jsonl)$/i.test(entry.name) && !entry.name.endsWith('.meta.json')) {
          results.push(full);
        }
      }
    } catch {
      // ignore
    }
    return results;
  }

  private async parseFile(
    filePath: string,
    records: UsageRecord[],
    warnings: ImportIssue[],
    errors: ImportIssue[],
    sourceMetaList: SourceMeta[],
  ): Promise<void> {
    const isJsonl = filePath.endsWith('.jsonl');
    const sourceMeta: SourceMeta = {
      sourcePath: filePath,
      sourceKind: isJsonl ? 'jsonl' : 'json',
      parserVersion: this.parserVersion,
      readAt: new Date().toISOString(),
    };
    sourceMetaList.push(sourceMeta);

    if (isJsonl) {
      try {
        await streamJsonlLines(filePath, (line, lineNum) => {
          try {
            const raw = JSON.parse(line);
            const rec = this.normalizeRecord(raw, sourceMeta);
            if (rec) records.push(rec);
          } catch {
            // line parse warning
          }
        });
      } catch (err) {
        errors.push({
          severity: 'error',
          code: 'FILE_READ_ERROR',
          message: err instanceof Error ? err.message : String(err),
          sourcePath: filePath,
        });
      }
    } else {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const rec = this.normalizeRecord(item, sourceMeta);
            if (rec) records.push(rec);
          }
        } else {
          const rec = this.normalizeRecord(parsed, sourceMeta);
          if (rec) records.push(rec);
        }
      } catch (err) {
        errors.push({
          severity: 'error',
          code: 'JSON_PARSE_ERROR',
          message: err instanceof Error ? err.message : String(err),
          sourcePath: filePath,
        });
      }
    }
  }
}
