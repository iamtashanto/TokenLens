import * as vscode from 'vscode';
import * as fs from 'fs';
import * as child_process from 'child_process';
import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult, clamp } from './base.js';
import { getGhHostsPath, getGhExecutablePaths } from '../util/platform.js';
import { httpGetJson, withTimeout } from '../util/http.js';
import { SecretStore, SECRET_KEYS } from '../util/secrets.js';

interface CopilotUserResponse {
  copilot_plan?: string;
  limited_user_quotas?: Record<string, number>;
  monthly_quotas?: Record<string, number>;
  limited_user_reset_date?: string;
  quotas?: Record<string, { used: number; total: number; reset_date?: string; unlimited?: boolean }>;
  quota_snapshots?: {
    premium_interactions?: { percent_remaining: number; reset_date?: string };
    chat?: { percent_remaining: number };
  };
}

export class CopilotProvider implements ProviderInterface {
  readonly id = 'copilot';
  readonly displayName = 'GitHub Copilot';
  readonly brandColor = '#24292e';

  constructor(private readonly secretStore?: SecretStore) {}

  async isAvailable(): Promise<boolean> {
    const token = await this.getGitHubToken();
    if (token) return true;
    const copilotExt =
      vscode.extensions?.getExtension('github.copilot') ||
      vscode.extensions?.getExtension('github.copilot-chat');
    return !!copilotExt;
  }

  private async getGitHubToken(): Promise<string | null> {
    // 1. SecretStore override
    if (this.secretStore) {
      try {
        const stored =
          (await this.secretStore.get('copilot.token')) ||
          (await this.secretStore.get('github.token'));
        if (stored) return stored;
      } catch {
        // ignore
      }
    }

    // 2. Environment variables
    const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.COPILOT_TOKEN;
    if (envToken) return envToken.trim();

    // 3. VS Code authentication provider sessions (try all common GitHub scopes)
    if (vscode.authentication?.getSession) {
      const scopeSets = [
        ['copilot'],
        ['read:user', 'user:email'],
        ['read:user'],
        ['user:email'],
        ['repo'],
        [],
      ];

      for (const scopes of scopeSets) {
        try {
          const session = await vscode.authentication.getSession('github', scopes, { silent: true });
          if (session?.accessToken) return session.accessToken;
        } catch {
          // try next scope set
        }
      }

      try {
        const entSession = await vscode.authentication.getSession('github-enterprise', [], { silent: true });
        if (entSession?.accessToken) return entSession.accessToken;
      } catch {
        // ignore
      }
    }

    // 4. GitHub CLI hosts.yml
    const hostsPath = getGhHostsPath();
    if (hostsPath && fs.existsSync(hostsPath)) {
      try {
        const content = fs.readFileSync(hostsPath, 'utf8');
        const match = /oauth_token:\s*([^\s\n]+)/.exec(content);
        if (match?.[1]) return match[1];
      } catch {
        // ignore
      }
    }

    // 5. GitHub CLI binary `gh auth token`
    for (const bin of getGhExecutablePaths()) {
      try {
        const token = child_process
          .execFileSync(bin, ['auth', 'token', '--hostname', 'github.com'], {
            encoding: 'utf8',
            timeout: 3000,
          })
          .trim();
        if (token) return token;
      } catch {
        // try next
      }
    }

    return null;
  }

  async fetch(): Promise<ProviderResult> {
    try {
      return await withTimeout(this.fetchInternal(), 15_000, 'Copilot');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    const token = await this.getGitHubToken();

    // If no token detected, check if Copilot extension is installed/active
    if (!token) {
      const copilotExt =
        vscode.extensions?.getExtension('github.copilot') ||
        vscode.extensions?.getExtension('github.copilot-chat');

      if (copilotExt?.isActive) {
        return {
          id: this.id,
          name: this.displayName,
          icon: this.id,
          brandColor: this.brandColor,
          plan: 'GitHub Copilot',
          lines: [
            {
              type: 'badge',
              label: 'Status',
              text: 'Active (VS Code Extension)',
              color: '#22c55e',
            },
          ],
        };
      }

      return {
        id: this.id,
        name: this.displayName,
        icon: this.id,
        brandColor: this.brandColor,
        plan: 'Copilot',
        lines: [
          {
            type: 'badge',
            label: 'Status',
            text: 'Sign in to GitHub or set GitHub Token',
            color: '#f59e0b',
          },
        ],
      };
    }

    const headersList = [
      {
        Authorization: `Bearer ${token}`,
        'Editor-Version': 'vscode/1.96.2',
        'Editor-Plugin-Version': 'copilot-chat/0.26.7',
        'X-Github-Api-Version': '2025-04-01',
        'User-Agent': 'GitHubCopilotChat/0.26.7',
      },
      {
        Authorization: `token ${token}`,
        'User-Agent': 'TokenLens/0.1.0',
        Accept: 'application/vnd.github.v3+json',
      },
    ];

    let userCopilotData: CopilotUserResponse | null = null;
    let fallbackPlan = 'Copilot Individual';
    let username = '';

    // Step 1: Try copilot internal user endpoint
    for (const headers of headersList) {
      try {
        userCopilotData = await httpGetJson<CopilotUserResponse>(
          'https://api.github.com/copilot_internal/user',
          { headers, timeoutMs: 7000 },
        );
        if (userCopilotData) break;
      } catch {
        // try next headers
      }
    }

    // Step 2: If internal endpoint failed, query user and copilot subscription endpoints
    if (!userCopilotData) {
      for (const headers of headersList) {
        try {
          const userRes = await httpGetJson<any>('https://api.github.com/user', {
            headers,
            timeoutMs: 5000,
          });
          if (userRes?.login) {
            username = userRes.login;
            if (userRes.plan?.name) {
              fallbackPlan = `GitHub ${userRes.plan.name.toUpperCase()}`;
            }
            break;
          }
        } catch {
          // continue
        }
      }

      // Check copilot subscription status
      for (const headers of headersList) {
        try {
          const subRes = await httpGetJson<any>('https://api.github.com/user/copilot', {
            headers,
            timeoutMs: 5000,
          });
          if (subRes?.plan_type) {
            fallbackPlan = `Copilot ${subRes.plan_type.toUpperCase()}`;
          }
        } catch {
          // continue
        }
      }
    }

    const lines: MetricLine[] = [];
    let primaryResetIso: string | undefined;

    // Format 1: New quotas object
    if (userCopilotData?.quotas && typeof userCopilotData.quotas === 'object') {
      for (const [key, q] of Object.entries(userCopilotData.quotas)) {
        if (q.unlimited === true) continue;
        const total = q.total ?? 100;
        const used = q.used ?? 0;
        const label = key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        if (q.reset_date) primaryResetIso = q.reset_date;
        lines.push({
          type: 'progress',
          label,
          used: clamp(Math.round((used / total) * 100), 0, 100),
          limit: 100,
          format: { kind: 'percent' },
          resetsAt: q.reset_date ?? null,
          resetPeriodLabel: 'Monthly Quota',
        });
      }
    }

    // Format 2: Free tier / limited user quotas
    if (lines.length === 0 && userCopilotData?.limited_user_quotas && userCopilotData?.monthly_quotas) {
      primaryResetIso = userCopilotData.limited_user_reset_date;
      for (const [key, remaining] of Object.entries(userCopilotData.limited_user_quotas)) {
        const total = userCopilotData.monthly_quotas[key] ?? 100;
        const used = Math.max(total - remaining, 0);
        const label = key === 'chat' ? 'Chat Messages' : key === 'completions' ? 'Completions' : key;
        lines.push({
          type: 'progress',
          label,
          used: clamp(Math.round((used / total) * 100), 0, 100),
          limit: 100,
          format: { kind: 'percent' },
          resetsAt: userCopilotData.limited_user_reset_date ?? null,
          resetPeriodLabel: 'Monthly Free Tier',
        });
      }
    }

    // Format 3: Quota snapshots
    if (lines.length === 0 && userCopilotData?.quota_snapshots?.premium_interactions) {
      const snap = userCopilotData.quota_snapshots.premium_interactions;
      const pctUsed = clamp(100 - (snap.percent_remaining ?? 100), 0, 100);
      primaryResetIso = snap.reset_date;
      lines.push({
        type: 'progress',
        label: 'Premium Interactions',
        used: pctUsed,
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: snap.reset_date ?? null,
        resetPeriodLabel: 'Monthly Reset',
      });
    }

    // Fallback: Active Connected State
    if (lines.length === 0) {
      lines.push({
        type: 'badge',
        label: 'Status',
        text: username ? `Active (${username})` : 'Active / Unlimited',
        color: '#22c55e',
      });
    }

    const plan = userCopilotData?.copilot_plan
      ? `Copilot ${userCopilotData.copilot_plan.toUpperCase()}`
      : fallbackPlan;

    return {
      id: this.id,
      name: this.displayName,
      icon: this.id,
      brandColor: this.brandColor,
      plan,
      lines,
      quotaSummary: primaryResetIso
        ? {
            primaryResetIso,
            primaryResetLabel: 'Monthly Reset',
          }
        : undefined,
    };
  }
}
