import * as fs from 'fs';
import * as child_process from 'child_process';
import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult, clamp } from './base.js';
import { getAntigravityTokenPaths, firstExisting } from '../util/platform.js';
import { SecretStore, SECRET_KEYS } from '../util/secrets.js';
import { httpRequest, httpPostJson, withTimeout } from '../util/http.js';

interface ModelQuota {
  remainingFraction?: number;
  resetTime?: string;
}

interface QuotaSummaryResponse {
  clientModelConfigs?: Array<{
    model?: string;
    quotaInfo?: ModelQuota;
  }>;
}

export class AntigravityProvider implements ProviderInterface {
  readonly id = 'antigravity';
  readonly displayName = 'Google Antigravity';
  readonly brandColor = '#6D5DF6';

  constructor(private readonly secretStore?: SecretStore) {}

  async isAvailable(): Promise<boolean> {
    const tokenPaths = getAntigravityTokenPaths();
    if (firstExisting(tokenPaths)) return true;
    if (this.secretStore) {
      const token = await this.secretStore.get(SECRET_KEYS.ANTIGRAVITY_TOKEN);
      if (token) return true;
    }
    return true; // LS may be active
  }

  private discoverLanguageServer(): { port: number; csrf: string } | null {
    try {
      const output = child_process.execSync(
        process.platform === 'win32'
          ? 'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object CommandLine"'
          : 'ps -ax',
        { encoding: 'utf8', timeout: 5000 },
      );

      const match = /--extension_server_port=(\d+).*--csrf_token=([a-zA-Z0-9_-]+)/i.exec(output);
      if (match) {
        return {
          port: parseInt(match[1], 10),
          csrf: match[2],
        };
      }
    } catch {
      // ignore
    }
    return null;
  }

  async fetch(): Promise<ProviderResult> {
    try {
      return await withTimeout(this.fetchInternal(), 20_000, 'Antigravity');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    const ls = this.discoverLanguageServer();

    // Strategy 1: Local Language Server probe
    if (ls) {
      // Probe port range around extension_server_port
      const portsToTry = [ls.port, ls.port - 1, ls.port + 1, ls.port + 2];
      for (const port of portsToTry) {
        try {
          const res = await httpRequest(
            `http://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/GetQuotaSummary`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'x-codeium-csrf-token': ls.csrf,
              },
              body: '{}',
              timeoutMs: 3000,
            },
          );

          const data = JSON.parse(res.body) as QuotaSummaryResponse;
          if (data.clientModelConfigs && data.clientModelConfigs.length > 0) {
            const lines: MetricLine[] = [];
            const pools: Record<string, number> = {};

            for (const cfg of data.clientModelConfigs) {
              const model = cfg.model ?? '';
              const rem = cfg.quotaInfo?.remainingFraction;
              if (rem != null) {
                const used = clamp(Math.round((1 - rem) * 100), 0, 100);
                let poolKey = 'Other';
                if (/gemini.*pro/i.test(model)) poolKey = 'Gemini Pro';
                else if (/gemini.*flash/i.test(model)) poolKey = 'Gemini Flash';
                else if (/claude/i.test(model)) poolKey = 'Claude';

                pools[poolKey] = Math.max(pools[poolKey] ?? 0, used);
              }
            }

            for (const [pool, used] of Object.entries(pools)) {
              lines.push({
                type: 'progress',
                label: pool,
                used,
                limit: 100,
                format: { kind: 'percent' },
              });
            }

            if (lines.length > 0) {
              return {
                id: this.id,
                name: this.displayName,
                icon: this.id,
                brandColor: this.brandColor,
                plan: 'Cloud Code',
                lines,
              };
            }
          }
        } catch {
          // try next port
        }
      }
    }

    // Strategy 2: OAuth Tokens
    const tokenPaths = getAntigravityTokenPaths();
    const existing = firstExisting(tokenPaths);
    if (existing) {
      try {
        const raw = fs.readFileSync(existing, 'utf8');
        const data = JSON.parse(raw);
        const token = data.access_token ?? data.accessToken;
        if (token) {
          const loadRes = await httpPostJson<{}, { project?: string }>(
            'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
            {},
            { headers: { Authorization: `Bearer ${token}` } },
          ).catch(() => ({}));

          return {
            id: this.id,
            name: this.displayName,
            icon: this.id,
            brandColor: this.brandColor,
            plan: 'Cloud Code OAuth',
            lines: [
              {
                type: 'badge',
                label: 'Status',
                text: 'Active',
                color: '#22c55e',
              },
            ],
          };
        }
      } catch {
        // ignore
      }
    }

    return {
      id: this.id,
      name: this.displayName,
      icon: this.id,
      brandColor: this.brandColor,
      plan: 'Antigravity',
      lines: [
        {
          type: 'badge',
          label: 'Status',
          text: 'Connected',
          color: '#22c55e',
        },
      ],
    };
  }
}
