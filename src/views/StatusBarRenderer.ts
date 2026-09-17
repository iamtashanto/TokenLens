import * as vscode from 'vscode';
import type { ProviderResult, AlertLevel, BudgetState } from '../types/index.js';

export const PROVIDER_SHORT_NAMES: Record<string, string> = {
  antigravity: 'AG',
  codex: 'Codex',
  claude: 'Claude',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  ollama: 'Ollama',
  openrouter: 'OpenRouter',
  copilot: 'Copilot',
  groq: 'Groq',
};

export const PROVIDER_PRIORITIES: Record<string, number> = {
  antigravity: 110,
  codex: 109,
  claude: 108,
  cursor: 107,
  copilot: 106,
  windsurf: 105,
  deepseek: 104,
  mistral: 103,
  ollama: 102,
  openrouter: 101,
  groq: 100,
};

export type StatusBarStyle = 'circle' | 'compact' | 'blocks' | 'percent' | 'minimal';

/** Compact 5-block micro meter: █░░░░ */
export function renderMicroBlocks(pct: number): string {
  const total = 5;
  const filled = Math.round(Math.min(100, Math.max(0, pct)) / 20);
  return '█'.repeat(filled) + '░'.repeat(total - filled);
}

/** Render countdown string from ISO date (e.g. "2h 15m", "4d 12h") */
export function formatResetCountdown(resetsAt?: string | null): string | null {
  if (!resetsAt) return null;
  const target = new Date(resetsAt).getTime();
  if (isNaN(target)) return null;

  const diffMs = target - Date.now();
  if (diffMs <= 0) return 'resets soon';

  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return '< 1m';
}

/** Extract primary percent for a provider */
export function getPrimaryPercent(result: ProviderResult): number | undefined {
  const progressLines = result.lines.filter((l) => l.type === 'progress');
  if (progressLines.length === 0) return undefined;

  // If Antigravity, look for Gemini Models 5-Hour Limit or first Gemini line
  if (result.id === 'antigravity') {
    const gemini = progressLines.find(
      (l) => /gemini.*5-hour/i.test(l.label) || /gemini/i.test(l.label),
    );
    if (gemini && gemini.type === 'progress') {
      return gemini.format.kind === 'percent' ? gemini.used : (gemini.used / gemini.limit) * 100;
    }
  }

  const first = progressLines[0];
  if (!first || first.type !== 'progress') return undefined;

  return first.format.kind === 'percent'
    ? first.used
    : first.limit > 0
      ? (first.used / first.limit) * 100
      : 0;
}

/**
 * Dynamic Circular Progress Gauge:
 * ○ (0 - 15%)
 * ◔ (16 - 39%)
 * ◑ (40 - 64%)
 * ◕ (65 - 89%)
 * ● (90 - 100%)
 */
export function getCircleGauge(pct?: number, hasError?: boolean): string {
  if (hasError) return '⊘';
  if (pct === undefined) return '●';
  if (pct < 15) return '○';
  if (pct < 40) return '◔';
  if (pct < 65) return '◑';
  if (pct < 90) return '◕';
  return '●';
}

/**
 * Render single provider status bar label with circle gauge:
 * e.g. "◕ AG 73%", "◔ Codex 21%", "● Copilot ✓"
 */
export function renderProviderStatusBarText(
  result: ProviderResult,
  style: StatusBarStyle = 'circle',
): string {
  const shortName = PROVIDER_SHORT_NAMES[result.id] ?? result.name.split(' ')[0];
  if (result.error) {
    return `⊘ ${shortName}`;
  }

  const pct = getPrimaryPercent(result);
  const circle = getCircleGauge(pct, !!result.error);

  if (pct !== undefined) {
    const rounded = Math.round(pct);
    if (style === 'blocks') {
      return `${circle} ${shortName} ${renderMicroBlocks(rounded)} ${rounded}%`;
    }
    if (style === 'percent') {
      return `${shortName} ${rounded}%`;
    }
    if (style === 'minimal') {
      return `${circle} ${shortName}`;
    }
    return `${circle} ${shortName} ${rounded}%`;
  }

  const badge = result.lines.find((l) => l.type === 'badge');
  if (badge && badge.type === 'badge') {
    return `${circle} ${shortName} ✓`;
  }

  return `${circle} ${shortName}`;
}

/** Status bar color for a single provider */
export function getProviderStatusBarColor(
  result: ProviderResult,
  alertLevel?: AlertLevel,
): vscode.ThemeColor | undefined {
  if (result.error) {
    return new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  const pct = getPrimaryPercent(result);
  if (pct !== undefined && pct >= 98) {
    return new vscode.ThemeColor('statusBarItem.errorBackground');
  }
  if (pct !== undefined && pct >= 90) {
    return new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  if (alertLevel === 'panic') {
    return new vscode.ThemeColor('statusBarItem.errorBackground');
  }
  if (alertLevel === 'critical') {
    return new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  return undefined;
}

/** Build rich markdown tooltip for a specific provider */
export function renderProviderTooltip(
  result: ProviderResult,
  budget?: BudgetState,
): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;
  md.supportHtml = true;

  const planBadge = result.plan ? ` *(${result.plan})*` : '';
  md.appendMarkdown(`### 🔭 TokenLens — **${result.name}**${planBadge}\n\n`);

  if (result.error) {
    md.appendMarkdown(`⚠️ **Status:** ${result.error}\n\n`);
  }

  for (const line of result.lines) {
    if (line.type === 'progress') {
      const pct =
        line.format.kind === 'percent'
          ? line.used
          : line.limit > 0
            ? (line.used / line.limit) * 100
            : 0;
      const bar = renderMicroBlocks(pct);
      const countdown = formatResetCountdown(line.resetsAt);
      const resetInfo = countdown
        ? ` *(⏱️ ${line.resetPeriodLabel ?? 'Reset'}: in ${countdown})*`
        : line.resetPeriodLabel
          ? ` *(${line.resetPeriodLabel})*`
          : '';

      md.appendMarkdown(`- **${line.label}:** \`${bar}\` **${Math.round(pct)}%**${resetInfo}\n`);
    } else if (line.type === 'text') {
      md.appendMarkdown(`- **${line.label}:** ${line.value}\n`);
    } else if (line.type === 'badge') {
      md.appendMarkdown(`- **${line.label}:** \`${line.text}\`\n`);
    }
  }

  // Budget info
  if (budget) {
    md.appendMarkdown('\n---\n\n');
    const alertIcon =
      budget.alertLevel === 'panic'
        ? '🚨'
        : budget.alertLevel === 'critical'
          ? '🔴'
          : budget.alertLevel === 'warning'
            ? '⚠️'
            : '✅';
    md.appendMarkdown(
      `💰 **Monthly Budget:** \$${budget.currentSpend.toFixed(2)} / \$${budget.monthly.toFixed(2)} ${alertIcon} (${budget.percent}%)\n`,
    );
  }

  // Action links
  md.appendMarkdown('\n---\n\n');
  md.appendMarkdown(
    `[$(graph) Dashboard](command:tokenlens.openDashboard)  •  [$(eye) Show/Hide](command:tokenlens.configureStatusBar)  •  [$(refresh) Refresh](command:tokenlens.refresh)  •  [$(gear) Settings](command:tokenlens.openSettings)\n`,
  );

  return md;
}

/** Render tooltip when multiple or all providers are shown */
export function renderOverviewTooltip(
  results: ProviderResult[],
  budget: BudgetState,
): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;
  md.supportHtml = true;

  md.appendMarkdown(`### 🔭 TokenLens — AI Quotas & Usage\n\n`);

  if (results.length === 0) {
    md.appendMarkdown('No active AI sessions detected.\n\n');
  } else {
    for (const result of results) {
      const planBadge = result.plan ? ` *(${result.plan})*` : '';
      md.appendMarkdown(`**${result.name}**${planBadge}\n`);

      for (const line of result.lines) {
        if (line.type === 'progress') {
          const pct =
            line.format.kind === 'percent'
              ? line.used
              : line.limit > 0
                ? (line.used / line.limit) * 100
                : 0;
          const bar = renderMicroBlocks(pct);
          const countdown = formatResetCountdown(line.resetsAt);
          const resetInfo = countdown ? ` *(⏱️ ${countdown})*` : '';
          md.appendMarkdown(`- ${line.label}: \`${bar}\` **${Math.round(pct)}%**${resetInfo}\n`);
        }
      }
      md.appendMarkdown('\n');
    }
  }

  md.appendMarkdown('---\n\n');
  md.appendMarkdown(
    `💰 **Budget:** \$${budget.currentSpend.toFixed(2)} / \$${budget.monthly.toFixed(2)} (${budget.percent}%)\n\n`,
  );
  md.appendMarkdown(
    `[$(graph) Open Dashboard](command:tokenlens.openDashboard)  •  [$(eye) Show/Hide Providers](command:tokenlens.configureStatusBar)  •  [$(refresh) Refresh](command:tokenlens.refresh)\n`,
  );

  return md;
}
