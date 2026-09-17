import * as fs from 'fs';
import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult, clamp } from './base.js';
import { getCodexAuthPaths } from '../util/platform.js';
import { httpRequest, httpPostJson, withTimeout } from '../util/http.js';

interface CodexTokens {
  access_token?: string;
  refresh_token?: string;
  account_id?: string;
}

interface CodexAuthFile {
  tokens?: CodexTokens;
  access_token?: string;
  refresh_token?: string;
}

export class CodexProvider implements ProviderInterface {
  readonly id = 'codex';
  readonly displayName = 'OpenAI Codex';
  readonly brandColor = '#10A37F';

  async isAvailable(): Promise<boolean> {
    const paths = getCodexAuthPaths();
    return paths.some((p) => fs.existsSync(p));
  }

  private getAuth(): { token: string; accountId?: string; refreshToken?: string } | null {
    for (const p of getCodexAuthPaths()) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8');
          const data = JSON.parse(raw) as CodexAuthFile;
          const token = data.tokens?.access_token ?? data.access_token;
          if (token) {
            return {
              token,
              accountId: data.tokens?.account_id,
              refreshToken: data.tokens?.refresh_token ?? data.refresh_token,
            };
          }
        } catch {
          // continue
        }
      }
    }
    return null;
  }

  async fetch(): Promise<ProviderResult> {
    try {
      return await withTimeout(this.fetchInternal(), 20_000, 'Codex');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    const auth = this.getAuth();
    if (!auth) {
      throw new Error('Codex auth.json not found. Run `codex` CLI to login.');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth.token}`,
      'User-Agent': 'codex-cli/1.0',
    };
    if (auth.accountId) {
      headers['ChatGPT-Account-Id'] = auth.accountId;
    }

    const res = await httpRequest('https://chatgpt.com/backend-api/wham/usage', {
      method: 'GET',
      headers,
    });

    const lines: MetricLine[] = [];

    // Parse headers (preferred by OpenAI WHAM endpoint)
    const primaryPct = res.headers['x-codex-primary-used-percent'];
    if (primaryPct !== undefined) {
      lines.push({
        type: 'progress',
        label: 'Session',
        used: clamp(Number(primaryPct), 0, 100),
        limit: 100,
        format: { kind: 'percent' },
      });
    }

    const secondaryPct = res.headers['x-codex-secondary-used-percent'];
    if (secondaryPct !== undefined) {
      lines.push({
        type: 'progress',
        label: 'Weekly',
        used: clamp(Number(secondaryPct), 0, 100),
        limit: 100,
        format: { kind: 'percent' },
      });
    }

    const creditsBalance = res.headers['x-codex-credits-balance'];
    if (creditsBalance !== undefined) {
      const balance = Number(creditsBalance);
      lines.push({
        type: 'progress',
        label: 'Credits',
        used: clamp(1000 - balance, 0, 1000),
        limit: 1000,
        format: { kind: 'count', suffix: 'credits' },
      });
    }

    // Body fallback
    if (lines.length === 0 && res.body) {
      try {
        const body = JSON.parse(res.body);
        if (body.rate_limit?.primary_window?.used_percent != null) {
          lines.push({
            type: 'progress',
            label: 'Session',
            used: clamp(Number(body.rate_limit.primary_window.used_percent), 0, 100),
            limit: 100,
            format: { kind: 'percent' },
            resetsAt: body.rate_limit.primary_window.reset_at,
          });
        }
      } catch {
        // ignore body parse
      }
    }

    if (lines.length === 0) {
      lines.push({
        type: 'badge',
        label: 'Status',
        text: 'Connected',
        color: '#22c55e',
      });
    }

    return {
      id: this.id,
      name: this.displayName,
      icon: this.id,
      brandColor: this.brandColor,
      plan: 'Plus / Team',
      lines,
    };
  }
}

