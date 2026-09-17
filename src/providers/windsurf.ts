import * as fs from 'fs';
import * as child_process from 'child_process';
import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult } from './base.js';
import { getWindsurfDbPaths } from '../util/platform.js';
import { readDbValue } from '../util/sqlite.js';
import { httpRequest, withTimeout } from '../util/http.js';

interface WindsurfUserStatusResponse {
  user?: {
    planStatus?: {
      planName?: string;
      availablePromptCredits?: number;
      usedPromptCredits?: number;
      availableFlexCredits?: number;
      usedFlexCredits?: number;
    };
  };
}

export class WindsurfProvider implements ProviderInterface {
  readonly id = 'windsurf';
  readonly displayName = 'Windsurf';
  readonly brandColor = '#00B4D8';

  async isAvailable(): Promise<boolean> {
    const paths = getWindsurfDbPaths();
    return paths.some((p) => fs.existsSync(p));
  }

  private async getApiKey(): Promise<string | null> {
    for (const dbPath of getWindsurfDbPaths()) {
      if (fs.existsSync(dbPath)) {
        const raw = await readDbValue(dbPath, 'windsurfAuthStatus');
        if (raw) {
          try {
            const data = JSON.parse(raw);
            if (data.apiKey) return data.apiKey;
          } catch {
            // continue
          }
        }
      }
    }
    return null;
  }

  private discoverLanguageServer(): { port: number; csrf: string } | null {
    try {
      const output = child_process.execSync(
        process.platform === 'win32'
          ? 'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object CommandLine"'
          : 'ps aux',
        { encoding: 'utf8', timeout: 5000 },
      );

      const match = /language_server.*--ide_name=windsurf.*--extension_server_port=(\d+).*--csrf_token=([a-zA-Z0-9_-]+)/i.exec(
        output,
      );
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
      return await withTimeout(this.fetchInternal(), 20_000, 'Windsurf');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    const apiKey = await this.getApiKey();
    const ls = this.discoverLanguageServer();

    if (!ls) {
      // Fallback result if LS is not actively running but DB exists
      if (apiKey) {
        return {
          id: this.id,
          name: this.displayName,
          icon: this.id,
          brandColor: this.brandColor,
          plan: 'Windsurf',
          lines: [
            {
              type: 'badge',
              label: 'Credits',
              text: 'Connected (LS idle)',
              color: '#22c55e',
            },
          ],
        };
      }
      throw new Error('Windsurf language server not running.');
    }

    const payload = JSON.stringify({
      metadata: {
        apiKey: apiKey ?? '',
        ideName: 'windsurf',
        ideVersion: '1.0',
        extensionName: 'windsurf',
        extensionVersion: '1.0',
        locale: 'en',
      },
    });

    const res = await httpRequest(
      `http://127.0.0.1:${ls.port}/exa.language_server_pb.LanguageServerService/GetUserStatus`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Connect-Protocol-Version': '1',
          'x-codeium-csrf-token': ls.csrf,
        },
        body: payload,
      },
    );

    const data = JSON.parse(res.body) as WindsurfUserStatusResponse;
    const planStatus = data.user?.planStatus;
    const lines: MetricLine[] = [];

    if (planStatus) {
      if (planStatus.availablePromptCredits != null && planStatus.usedPromptCredits != null) {
        const total = (planStatus.availablePromptCredits + planStatus.usedPromptCredits) / 100;
        const used = planStatus.usedPromptCredits / 100;
        lines.push({
          type: 'progress',
          label: 'Prompt Credits',
          used,
          limit: total,
          format: { kind: 'count', suffix: 'credits' },
        });
      }

      if (planStatus.availableFlexCredits != null && planStatus.usedFlexCredits != null) {
        const total = (planStatus.availableFlexCredits + planStatus.usedFlexCredits) / 100;
        const used = planStatus.usedFlexCredits / 100;
        lines.push({
          type: 'progress',
          label: 'Flex Credits',
          used,
          limit: total,
          format: { kind: 'count', suffix: 'credits' },
        });
      }
    }

    if (lines.length === 0) {
      lines.push({
        type: 'badge',
        label: 'Credits',
        text: 'Unlimited',
        color: '#22c55e',
      });
    }

    return {
      id: this.id,
      name: this.displayName,
      icon: this.id,
      brandColor: this.brandColor,
      plan: planStatus?.planName ?? 'Windsurf',
      lines,
    };
  }
}
