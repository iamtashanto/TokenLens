import * as vscode from 'vscode';
import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult } from './base.js';
import { httpGetJson, withTimeout } from '../util/http.js';

interface OllamaVersionResponse {
  version?: string;
}

interface OllamaTagsResponse {
  models?: Array<{ name: string; size?: number }>;
}

interface OllamaPsResponse {
  models?: Array<{ name: string; size?: number }>;
}

export class OllamaProvider implements ProviderInterface {
  readonly id = 'ollama';
  readonly displayName = 'Ollama (Local)';
  readonly brandColor = '#FFFFFF';

  private getUrl(): string {
    return vscode.workspace
      .getConfiguration('tokenlens')
      .get<string>('providers.ollama.url', 'http://localhost:11434')
      .replace(/\/+$/, '');
  }

  async isAvailable(): Promise<boolean> {
    try {
      await httpGetJson<OllamaVersionResponse>(`${this.getUrl()}/api/version`, { timeoutMs: 1500 });
      return true;
    } catch {
      return false;
    }
  }

  async fetch(): Promise<ProviderResult> {
    try {
      return await withTimeout(this.fetchInternal(), 20_000, 'Ollama');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    const url = this.getUrl();

    const [versionRes, tagsRes, psRes] = await Promise.all([
      httpGetJson<OllamaVersionResponse>(`${url}/api/version`, { timeoutMs: 3000 }),
      httpGetJson<OllamaTagsResponse>(`${url}/api/tags`, { timeoutMs: 3000 }).catch(() => ({ models: [] })),
      httpGetJson<OllamaPsResponse>(`${url}/api/ps`, { timeoutMs: 3000 }).catch(() => ({ models: [] })),
    ]);

    const lines: MetricLine[] = [];

    const totalModels = tagsRes.models?.length ?? 0;
    const runningModels = psRes.models?.length ?? 0;

    lines.push({
      type: 'badge',
      label: 'Server',
      text: `v${versionRes.version ?? 'unknown'}`,
      color: '#22c55e',
    });

    lines.push({
      type: 'text',
      label: 'Installed Models',
      value: `${totalModels} model${totalModels === 1 ? '' : 's'}`,
    });

    if (runningModels > 0) {
      const runningNames = psRes.models?.map((m) => m.name.split(':')[0]).join(', ');
      lines.push({
        type: 'text',
        label: 'Running',
        value: `${runningModels} (${runningNames})`,
      });
    }

    return {
      id: this.id,
      name: this.displayName,
      icon: this.id,
      brandColor: this.brandColor,
      plan: 'Local AI',
      lines,
    };
  }
}

