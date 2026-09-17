import * as vscode from 'vscode';
import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult, clamp } from './base.js';
import { SecretStore, SECRET_KEYS } from '../util/secrets.js';
import { httpRequest, withTimeout } from '../util/http.js';

interface MistralBillingCategory {
  total_cost?: number;
}

interface MistralBillingResponse {
  total_cost?: number;
  categories?: Record<string, MistralBillingCategory>;
}

export class MistralProvider implements ProviderInterface {
  readonly id = 'mistral';
  readonly displayName = 'Mistral AI';
  readonly brandColor = '#FF7000';

  constructor(private readonly secretStore?: SecretStore) {}

  async isAvailable(): Promise<boolean> {
    if (this.secretStore) {
      const cookie = await this.secretStore.get(SECRET_KEYS.MISTRAL_COOKIE);
      if (cookie) return true;
    }
    return false;
  }

  async fetch(): Promise<ProviderResult> {
    try {
      return await withTimeout(this.fetchInternal(), 20_000, 'Mistral');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    const cookie = this.secretStore ? await this.secretStore.get(SECRET_KEYS.MISTRAL_COOKIE) : undefined;
    if (!cookie) {
      throw new Error('Mistral admin cookie not set. Run command `TokenLens: Set Mistral Admin Cookie`.');
    }

    const csrfMatch = /csrftoken=([a-zA-Z0-9_-]+)/.exec(cookie);
    const csrf = csrfMatch ? csrfMatch[1] : '';

    const headers: Record<string, string> = {
      Cookie: cookie,
      'User-Agent': 'Mozilla/5.0',
    };
    if (csrf) {
      headers['X-CSRFTOKEN'] = csrf;
    }

    const metricMode = vscode.workspace
      .getConfiguration('tokenlens')
      .get<string>('providers.mistral.metric', 'billing');

    const lines: MetricLine[] = [];
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // 1. Billing Usage API
    try {
      const res = await httpRequest(
        `https://admin.mistral.ai/api/billing/v2/usage?month=${month}&year=${year}`,
        { method: 'GET', headers, timeoutMs: 8000 },
      );

      const data = JSON.parse(res.body) as MistralBillingResponse;
      const totalCost = data.total_cost ?? 0;

      lines.push({
        type: 'text',
        label: 'Monthly Spend',
        value: `\$${totalCost.toFixed(2)} (this month)`,
      });
    } catch {
      // billing API optional
    }

    // 2. Vibe Plan Usage via tRPC
    try {
      const vibeRes = await httpRequest(
        'https://console.mistral.ai/api-ui/trpc/billing.vibeUsage?batch=1&input=%7B%7D',
        { method: 'GET', headers, timeoutMs: 8000 },
      );

      const vibeData = JSON.parse(vibeRes.body);
      const usagePct = vibeData?.[0]?.result?.data?.json?.usage_percentage;
      if (usagePct != null) {
        lines.push({
          type: 'progress',
          label: 'Vibe Plan',
          used: clamp(Number(usagePct), 0, 100),
          limit: 100,
          format: { kind: 'percent' },
        });
      }
    } catch {
      // vibe API optional
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
      plan: metricMode === 'vibe' ? 'Vibe' : 'La Plateforme',
      lines,
    };
  }
}
