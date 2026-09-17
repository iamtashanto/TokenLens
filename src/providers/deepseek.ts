import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult } from './base.js';
import { SecretStore, SECRET_KEYS } from '../util/secrets.js';
import { httpGetJson, withTimeout } from '../util/http.js';

interface BalanceInfo {
  currency?: string;
  total_balance?: string;
  granted_balance?: string;
  topped_up_balance?: string;
  is_sufficient?: boolean;
}

interface DeepSeekBalanceResponse {
  is_available?: boolean;
  balance_infos?: BalanceInfo[];
}

export class DeepSeekProvider implements ProviderInterface {
  readonly id = 'deepseek';
  readonly displayName = 'DeepSeek';
  readonly brandColor = '#4D6BFE';

  constructor(private readonly secretStore?: SecretStore) {}

  async isAvailable(): Promise<boolean> {
    if (process.env['DEEPSEEK_API_KEY']) return true;
    if (this.secretStore) {
      const key = await this.secretStore.get(SECRET_KEYS.DEEPSEEK_API_KEY);
      if (key) return true;
    }
    return false;
  }

  private async getApiKey(): Promise<string | null> {
    if (process.env['DEEPSEEK_API_KEY']) {
      return process.env['DEEPSEEK_API_KEY'];
    }
    if (this.secretStore) {
      const key = await this.secretStore.get(SECRET_KEYS.DEEPSEEK_API_KEY);
      if (key) return key;
    }
    return null;
  }

  async fetch(): Promise<ProviderResult> {
    try {
      return await withTimeout(this.fetchInternal(), 20_000, 'DeepSeek');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('DeepSeek API key not found. Run command `TokenLens: Set DeepSeek API Key`.');
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    };

    const data = await httpGetJson<DeepSeekBalanceResponse>('https://api.deepseek.com/user/balance', {
      headers,
    });

    const lines: MetricLine[] = [];

    if (data.balance_infos && data.balance_infos.length > 0) {
      // Prefer USD or first sufficient balance
      const info =
        data.balance_infos.find((b) => b.currency === 'USD') ??
        data.balance_infos.find((b) => b.is_sufficient) ??
        data.balance_infos[0];

      if (info) {
        const currency = info.currency ?? 'USD';
        const total = parseFloat(info.total_balance ?? '0');
        const symbol = currency === 'CNY' ? '¥' : '$';

        lines.push({
          type: 'text',
          label: 'Account Balance',
          value: `${symbol}${total.toFixed(2)} ${currency}`,
        });

        if (info.granted_balance && parseFloat(info.granted_balance) > 0) {
          lines.push({
            type: 'text',
            label: 'Grant Balance',
            value: `${symbol}${parseFloat(info.granted_balance).toFixed(2)}`,
          });
        }
      }
    }

    if (lines.length === 0) {
      lines.push({
        type: 'badge',
        label: 'Status',
        text: data.is_available ? 'Active' : 'Connected',
        color: '#22c55e',
      });
    }

    return {
      id: this.id,
      name: this.displayName,
      icon: this.id,
      brandColor: this.brandColor,
      plan: 'API Key',
      lines,
    };
  }
}
