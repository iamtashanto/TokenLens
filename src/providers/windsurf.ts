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

interface LsDiscovery {
  ports: number[];
  csrf: string;
}

function extractFlag(cmd: string, flag: string): string | null {
  const parts = cmd.split(/\s+/);
  const eq = `${flag}=`;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === flag && i + 1 < parts.length) return parts[i + 1];
    if (parts[i].startsWith(eq)) return parts[i].slice(eq.length);
  }
  const regex = new RegExp(`${flag}[=\\s]+([^\\s"']+)`, 'i');
  const match = regex.exec(cmd);
  return match ? match[1] : null;
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

  private discoverLanguageServer(): LsDiscovery | null {
    try {
      const psOut = child_process.execSync(
        process.platform === 'win32'
          ? 'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object CommandLine, ProcessId"'
          : 'ps -ax -o pid= -o command=',
        { encoding: 'utf8', timeout: 5000 },
      );

      for (const line of psOut.split('\n')) {
        if (!line.includes('language_server') || !line.toLowerCase().includes('windsurf')) {
          continue;
        }

        const csrf = extractFlag(line, '--csrf_token') || extractFlag(line, '--extension_server_csrf_token');
        const extPortStr = extractFlag(line, '--extension_server_port');
        const pidStr = line.trim().split(/\s+/)[0];

        const ports: number[] = [];
        if (extPortStr) {
          const p = parseInt(extPortStr, 10);
          if (!isNaN(p) && p > 0) ports.push(p);
        }

        if (pidStr && /^\d+$/.test(pidStr) && process.platform !== 'win32') {
          try {
            const lsofOut = child_process.execSync(`lsof -nP -iTCP -sTCP:LISTEN -a -p ${pidStr}`, {
              encoding: 'utf8',
              timeout: 5000,
            });
            const re = /:(\d+)\s+\(LISTEN\)/g;
            let m;
            while ((m = re.exec(lsofOut)) !== null) {
              const port = parseInt(m[1], 10);
              if (!isNaN(port) && port > 0 && !ports.includes(port)) {
                ports.unshift(port);
              }
            }
          } catch {
            // ignore
          }
        }

        if (csrf && ports.length > 0) {
          return { ports, csrf };
        }
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

    if (!ls || ls.ports.length === 0) {
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

    let data: WindsurfUserStatusResponse | null = null;

    for (const port of ls.ports) {
      for (const scheme of ['https', 'http'] as const) {
        try {
          const res = await httpRequest(
            `${scheme}://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/GetUserStatus`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'x-codeium-csrf-token': ls.csrf,
              },
              body: payload,
              timeoutMs: 4000,
            },
          );
          if (res.statusCode >= 200 && res.statusCode < 300 && res.body) {
            data = JSON.parse(res.body) as WindsurfUserStatusResponse;
            if (data?.user) break;
          }
        } catch {
          // try next port
        }
      }
      if (data?.user) break;
    }

    if (!data?.user) {
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
              text: 'Connected',
              color: '#22c55e',
            },
          ],
        };
      }
      throw new Error('Could not communicate with Windsurf language server.');
    }

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
