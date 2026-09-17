import * as fs from 'fs';
import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult, clamp } from './base.js';
import { getClaudeCredentialsPath } from '../util/platform.js';
import { SecretStore, SECRET_KEYS } from '../util/secrets.js';
import { httpGetJson, httpPostJson, withTimeout } from '../util/http.js';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const REFRESH_URL = 'https://platform.claude.com/v1/oauth/token';
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    subscriptionType?: string;
  };
}

interface UsageWindow {
  utilization?: number;
  used_percentage?: number;
  resets_at?: string;
}

interface ExtraUsage {
  is_enabled?: boolean;
  used_credits?: number;
  monthly_limit?: number;
}

interface OAuthUsageResponse {
  five_hour?: UsageWindow;
  seven_day?: UsageWindow;
  seven_day_sonnet?: UsageWindow;
  seven_day_opus?: UsageWindow;
  seven_day_routines?: UsageWindow;
  extra_usage?: ExtraUsage;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class ClaudeProvider implements ProviderInterface {
  readonly id = 'claude';
  readonly displayName = 'Claude Code';
  readonly brandColor = '#D97757';

  constructor(private readonly secretStore?: SecretStore) {}

  async isAvailable(): Promise<boolean> {
    const credPath = getClaudeCredentialsPath();
    if (fs.existsSync(credPath)) return true;
    if (this.secretStore) {
      const cookie = await this.secretStore.get(SECRET_KEYS.CLAUDE_COOKIE);
      if (cookie) return true;
    }
    return false;
  }

  private async refreshAccessToken(refreshToken: string): Promise<string> {
    const res = await httpPostJson<{
      grant_type: string;
      refresh_token: string;
      client_id: string;
      scope: string;
    }, { access_token?: string }>(REFRESH_URL, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      scope: 'user:profile user:inference user:sessions:claude_code user:mcp_servers',
    });
    if (!res.access_token) {
      throw new Error('No access token in Claude refresh response');
    }
    return res.access_token;
  }

  async fetch(): Promise<ProviderResult> {
    try {
      return await withTimeout(this.fetchInternal(), 20_000, 'Claude');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    const credPath = getClaudeCredentialsPath();
    let token: string | undefined;
    let plan: string | undefined;

    if (fs.existsSync(credPath)) {
      try {
        const raw = fs.readFileSync(credPath, 'utf8');
        const creds = JSON.parse(raw) as ClaudeCredentials;
        const oauth = creds.claudeAiOauth;
        if (oauth?.accessToken) {
          token = oauth.accessToken;
          plan = oauth.subscriptionType ? capitalize(oauth.subscriptionType) : undefined;
          if (oauth.expiresAt && Date.now() >= oauth.expiresAt - 300_000 && oauth.refreshToken) {
            try {
              token = await this.refreshAccessToken(oauth.refreshToken);
            } catch {
              // fallback with current token
            }
          }
        }
      } catch (e) {
        console.warn('[TokenLens] Claude credentials parse error:', e);
      }
    }

    if (!token) {
      throw new Error('Claude credentials not found. Run `claude` CLI or set session cookie.');
    }

    const data = await httpGetJson<OAuthUsageResponse>(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    });

    const lines: MetricLine[] = [];

    // 1. 5-Hour Session Window
    const sessionPct = data.five_hour?.utilization ?? data.five_hour?.used_percentage;
    if (sessionPct != null) {
      lines.push({
        type: 'progress',
        label: 'Session Limit',
        used: clamp(sessionPct, 0, 100),
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: data.five_hour?.resets_at ?? null,
        resetPeriodLabel: '5-Hour Window',
      });
    }

    // 2. 7-Day Weekly Window
    const weeklyPct = data.seven_day?.utilization ?? data.seven_day?.used_percentage;
    if (weeklyPct != null) {
      lines.push({
        type: 'progress',
        label: 'Weekly Limit',
        used: clamp(weeklyPct, 0, 100),
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: data.seven_day?.resets_at ?? null,
        resetPeriodLabel: '7-Day Weekly',
      });
    }

    // 3. Sonnet / Opus specific rate limits if present
    const sonnetPct = data.seven_day_sonnet?.utilization ?? data.seven_day_sonnet?.used_percentage;
    if (sonnetPct != null) {
      lines.push({
        type: 'progress',
        label: 'Sonnet Weekly',
        used: clamp(sonnetPct, 0, 100),
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: data.seven_day_sonnet?.resets_at ?? null,
        resetPeriodLabel: 'Weekly Sonnet',
      });
    }

    const opusPct = data.seven_day_opus?.utilization ?? data.seven_day_opus?.used_percentage;
    if (opusPct != null) {
      lines.push({
        type: 'progress',
        label: 'Opus Weekly',
        used: clamp(opusPct, 0, 100),
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: data.seven_day_opus?.resets_at ?? null,
        resetPeriodLabel: 'Weekly Opus',
      });
    }

    // 4. Extra usage (dollar-based)
    if (data.extra_usage?.is_enabled === true) {
      const used = (data.extra_usage.used_credits ?? 0) / 100;
      const limit = (data.extra_usage.monthly_limit ?? 0) / 100;
      if (limit > 0) {
        lines.push({
          type: 'progress',
          label: 'Extra Usage',
          used,
          limit,
          format: { kind: 'dollars' },
          resetPeriodLabel: 'Monthly Spend Limit',
        });
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
      plan: plan ?? 'Pro',
      lines,
      quotaSummary: {
        primaryPercent: sessionPct ?? weeklyPct,
        primaryResetIso: data.five_hour?.resets_at ?? data.seven_day?.resets_at,
        primaryResetLabel: sessionPct != null ? '5h Session' : 'Weekly',
      },
    };
  }
}
