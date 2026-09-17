import * as vscode from 'vscode';
import * as fs from 'fs';
import * as child_process from 'child_process';
import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult, clamp } from './base.js';
import { getGhHostsPath, getGhExecutablePaths } from '../util/platform.js';
import { httpGetJson, withTimeout } from '../util/http.js';

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
  readonly brandColor = '#000000';

  async isAvailable(): Promise<boolean> {
    const session = await vscode.authentication.getSession('github', ['copilot'], { silent: true });
    if (session) return true;
    const hostsPath = getGhHostsPath();
    if (hostsPath && fs.existsSync(hostsPath)) return true;
    return false;
  }

  private async getGitHubToken(): Promise<string | null> {
    try {
      const session = await vscode.authentication.getSession('github', ['copilot'], { silent: true });
      if (session?.accessToken) return session.accessToken;
    } catch {
      // ignore
    }

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

    for (const bin of getGhExecutablePaths()) {
      try {
        const token = child_process
          .execFileSync(bin, ['auth', 'token', '--hostname', 'github.com'], {
            encoding: 'utf8',
            timeout: 5000,
          })
          .trim();
        if (token) return token;
      } catch {
        // continue
      }
    }

    return null;
  }

  async fetch(): Promise<ProviderResult> {
    try {
      return await withTimeout(this.fetchInternal(), 20_000, 'Copilot');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    const token = await this.getGitHubToken();
    if (!token) {
      throw new Error('GitHub token not found. Sign in via VS Code or `gh auth login`.');
    }

    const data = await httpGetJson<CopilotUserResponse>('https://api.github.com/copilot_internal/user', {
      headers: {
        Authorization: `token ${token}`,
        'Editor-Version': 'vscode/1.96.2',
        'Editor-Plugin-Version': 'copilot-chat/0.26.7',
        'X-Github-Api-Version': '2025-04-01',
        'User-Agent': 'GitHubCopilotChat/0.26.7',
      },
    });

    const lines: MetricLine[] = [];
    let primaryResetIso: string | undefined;

    // Format 1: New quotas object
    if (data.quotas && typeof data.quotas === 'object') {
      for (const [key, q] of Object.entries(data.quotas)) {
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
    if (lines.length === 0 && data.limited_user_quotas && data.monthly_quotas) {
      primaryResetIso = data.limited_user_reset_date;
      for (const [key, remaining] of Object.entries(data.limited_user_quotas)) {
        const total = data.monthly_quotas[key] ?? 100;
        const used = Math.max(total - remaining, 0);
        const label = key === 'chat' ? 'Chat Messages' : key === 'completions' ? 'Completions' : key;
        lines.push({
          type: 'progress',
          label,
          used: clamp(Math.round((used / total) * 100), 0, 100),
          limit: 100,
          format: { kind: 'percent' },
          resetsAt: data.limited_user_reset_date ?? null,
          resetPeriodLabel: 'Monthly Free Tier',
        });
      }
    }

    // Format 3: Quota snapshots
    if (lines.length === 0 && data.quota_snapshots?.premium_interactions) {
      const snap = data.quota_snapshots.premium_interactions;
      const pctUsed = clamp(100 - (snap.percent_remaining ?? 100), 0, 100);
      primaryResetIso = snap.reset_date;
      lines.push({
        type: 'progress',
        label: 'Premium Quota',
        used: pctUsed,
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: snap.reset_date ?? null,
        resetPeriodLabel: 'Monthly Reset',
      });
    }

    if (lines.length === 0) {
      lines.push({
        type: 'badge',
        label: 'Status',
        text: 'Unlimited / Active',
        color: '#22c55e',
      });
    }

    return {
      id: this.id,
      name: this.displayName,
      icon: this.id,
      brandColor: this.brandColor,
      plan: data.copilot_plan ? data.copilot_plan.toUpperCase() : 'Copilot Individual',
      lines,
      quotaSummary: {
        primaryResetIso,
        primaryResetLabel: 'Monthly Reset',
      },
    };
  }
}
