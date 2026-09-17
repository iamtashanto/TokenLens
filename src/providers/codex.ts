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

  private async refreshAccessToken(refreshToken: string): Promise<string> {
    const res = await httpPostJson<{
      grant_type: string;
      client_id: string;
      refresh_token: string;
    }, { access_token?: string }>('https://auth0.openai.com/oauth/token', {
      grant_type: 'refresh_token',
      client_id: 'pdlLIX2Y72MIlZrhfrK2DeVorvdKoulz',
      refresh_token: refreshToken,
    });
    if (!res.access_token) {
      throw new Error('No access token in Codex refresh response');
    }
    return res.access_token;
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

    let token = auth.token;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'codex-cli/1.0',
    };
    if (auth.accountId) {
      headers['ChatGPT-Account-Id'] = auth.accountId;
    }

    let res;
    try {
      res = await httpRequest('https://chatgpt.com/backend-api/wham/usage', {
        method: 'GET',
        headers,
      });
    } catch (err) {
      // If 401 and refresh token exists, try refreshing
      if (auth.refreshToken) {
        try {
          token = await this.refreshAccessToken(auth.refreshToken);
          headers['Authorization'] = `Bearer ${token}`;
          res = await httpRequest('https://chatgpt.com/backend-api/wham/usage', {
            method: 'GET',
            headers,
          });
        } catch {
          throw err;
        }
      } else {
        throw err;
      }
    }

    const lines: MetricLine[] = [];

    // Parse headers or body (OpenAI WHAM endpoint)
    let body: any = null;
    if (res.body) {
      try {
        body = JSON.parse(res.body);
      } catch {
        // ignore
      }
    }

    const primaryPct = res.headers['x-codex-primary-used-percent'] ?? body?.rate_limit?.primary_window?.used_percent;
    const primaryReset = res.headers['x-codex-primary-resets-at'] ?? body?.rate_limit?.primary_window?.reset_at;
    if (primaryPct !== undefined) {
      lines.push({
        type: 'progress',
        label: 'Session Limit',
        used: clamp(Number(primaryPct), 0, 100),
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: typeof primaryReset === 'string' ? primaryReset : null,
        resetPeriodLabel: '5-Hour Window',
      });
    }

    const secondaryPct = res.headers['x-codex-secondary-used-percent'] ?? body?.rate_limit?.secondary_window?.used_percent;
    const secondaryReset = res.headers['x-codex-secondary-resets-at'] ?? body?.rate_limit?.secondary_window?.reset_at;
    if (secondaryPct !== undefined) {
      lines.push({
        type: 'progress',
        label: 'Weekly Limit',
        used: clamp(Number(secondaryPct), 0, 100),
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: typeof secondaryReset === 'string' ? secondaryReset : null,
        resetPeriodLabel: 'Weekly Reset',
      });
    }

    const creditsBalance = res.headers['x-codex-credits-balance'] ?? body?.credits?.balance;
    if (creditsBalance !== undefined) {
      const balance = Number(creditsBalance);
      lines.push({
        type: 'progress',
        label: 'Credits',
        used: clamp(1000 - balance, 0, 1000),
        limit: 1000,
        format: { kind: 'count', suffix: 'credits' },
        resetPeriodLabel: 'Credit Balance',
      });
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
