import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult, clamp } from './base.js';
import { SecretStore } from '../util/secrets.js';
import { httpRequest, withTimeout } from '../util/http.js';

export class GroqProvider implements ProviderInterface {
  readonly id = 'groq';
  readonly displayName = 'Groq Cloud';
  readonly brandColor = '#F55036';

  constructor(private readonly secretStore?: SecretStore) {}

  async isAvailable(): Promise<boolean> {
    if (process.env['GROQ_API_KEY']) return true;
    if (this.secretStore) {
      const key = await this.secretStore.get('groq.apiKey');
      if (key) return true;
    }
    return false;
  }

  private async getApiKey(): Promise<string | null> {
    if (process.env['GROQ_API_KEY']) return process.env['GROQ_API_KEY'];
    if (this.secretStore) {
      const key = await this.secretStore.get('groq.apiKey');
      if (key) return key;
    }
    return null;
  }

  async fetch(): Promise<ProviderResult> {
    try {
      return await withTimeout(this.fetchInternal(), 20_000, 'Groq');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Groq API key not configured. Set GROQ_API_KEY or save key in TokenLens.');
    }

    const res = await httpRequest('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const lines: MetricLine[] = [];

    // Parse Groq rate-limit headers
    const reqLimit = Number(res.headers['x-ratelimit-limit-requests']);
    const reqRemaining = Number(res.headers['x-ratelimit-remaining-requests']);
    const reqReset = res.headers['x-ratelimit-reset-requests'] as string | undefined;

    const tokLimit = Number(res.headers['x-ratelimit-limit-tokens']);
    const tokRemaining = Number(res.headers['x-ratelimit-remaining-tokens']);
    const tokReset = res.headers['x-ratelimit-reset-tokens'] as string | undefined;

    if (!isNaN(reqLimit) && !isNaN(reqRemaining) && reqLimit > 0) {
      const used = Math.max(0, reqLimit - reqRemaining);
      lines.push({
        type: 'progress',
        label: 'Requests / min',
        used: clamp(Math.round((used / reqLimit) * 100), 0, 100),
        limit: 100,
        format: { kind: 'percent' },
        resetPeriodLabel: reqReset ? `Resets in ${reqReset}` : '1-Min Window',
      });
    }

    if (!isNaN(tokLimit) && !isNaN(tokRemaining) && tokLimit > 0) {
      const used = Math.max(0, tokLimit - tokRemaining);
      lines.push({
        type: 'progress',
        label: 'Tokens / min',
        used: clamp(Math.round((used / tokLimit) * 100), 0, 100),
        limit: 100,
        format: { kind: 'percent' },
        resetPeriodLabel: tokReset ? `Resets in ${tokReset}` : '1-Min Window',
      });
    }

    if (lines.length === 0) {
      lines.push({
        type: 'badge',
        label: 'Status',
        text: 'Connected / Active',
        color: '#22c55e',
      });
    }

    return {
      id: this.id,
      name: this.displayName,
      icon: this.id,
      brandColor: this.brandColor,
      plan: 'Developer',
      lines,
    };
  }
}

