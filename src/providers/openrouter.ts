import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult } from './base.js';
import { SecretStore } from '../util/secrets.js';
import { httpGetJson, withTimeout } from '../util/http.js';

interface OpenRouterKeyResponse {
  data?: {
    label?: string;
    usage?: number; // total USD usage
    limit?: number; // credit limit
    is_free_tier?: boolean;
    rate_limit?: {
      requests?: number;
      interval?: string;
    };
  };
}

interface OpenRouterCreditsResponse {
  data?: {
    total_credits?: number;
    total_usage?: number;
  };
}

export class OpenRouterProvider implements ProviderInterface {
  readonly id = 'openrouter';
  readonly displayName = 'OpenRouter';
  readonly brandColor = '#6566F1';

  constructor(private readonly secretStore?: SecretStore) {}

  async isAvailable(): Promise<boolean> {
    if (process.env['OPENROUTER_API_KEY']) return true;
    if (this.secretStore) {
      const key = await this.secretStore.get('openrouter.apiKey');
      if (key) return true;
    }
    return false;
  }

  private async getApiKey(): Promise<string | null> {
    if (process.env['OPENROUTER_API_KEY']) return process.env['OPENROUTER_API_KEY'];
    if (this.secretStore) {
      const key = await this.secretStore.get('openrouter.apiKey');
      if (key) return key;
    }
    return null;
  }

  async fetch(): Promise<ProviderResult> {
    try {
      return await withTimeout(this.fetchInternal(), 20_000, 'OpenRouter');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured. Set OPENROUTER_API_KEY or save key in TokenLens.');
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const [keyData, creditsData] = await Promise.all([
      httpGetJson<OpenRouterKeyResponse>('https://openrouter.ai/api/v1/auth/key', { headers }),
      httpGetJson<OpenRouterCreditsResponse>('https://openrouter.ai/api/v1/credits', { headers }).catch(() => ({} as OpenRouterCreditsResponse)),
    ]);

    const lines: MetricLine[] = [];
    const info = keyData.data;
    const credits = creditsData.data;

    const totalUsage = info?.usage ?? credits?.total_usage ?? 0;
    const limit = info?.limit ?? credits?.total_credits;

    if (limit !== undefined && limit > 0) {
      lines.push({
        type: 'progress',
        label: 'Credit Usage',
        used: totalUsage,
        limit,
        format: { kind: 'dollars' },
        resetPeriodLabel: 'Lifetime Balance',
      });
    } else {
      lines.push({
        type: 'text',
        label: 'Total Usage',
        value: `$${totalUsage.toFixed(2)} USD`,
      });
    }

    if (info?.rate_limit?.requests) {
      lines.push({
        type: 'badge',
        label: 'Rate Limit',
        text: `${info.rate_limit.requests} req/${info.rate_limit.interval ?? 's'}`,
        color: '#22c55e',
      });
    }

    return {
      id: this.id,
      name: this.displayName,
      icon: this.id,
      brandColor: this.brandColor,
      plan: info?.is_free_tier ? 'Free Tier' : 'Pay as you go',
      lines,
      quotaSummary: {
        monthlySpendUsd: totalUsage,
      },
    };
  }
}
