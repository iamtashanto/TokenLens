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

export type StatusBarStyle = 'compact' | 'blocks' | 'percent' | 'minimal';

/** Compact 5-block micro meter: █░░░░ 21% */
export function renderMicroBlocks(pct: number): string {
  const total = 5;
  const filled = Math.round(Math.min(100, Math.max(0, pct)) / 20);
  return '█'.repeat(filled) + '░'.repeat(total - filled);
}

/** Render progress in percent style: 45% */
export function renderProgressPercent(pct: number): string {
  return `${Math.round(pct)}%`;
}

/**
 * Extract the primary usage percentage for a provider.
 * For Antigravity, prioritizes Gemini or primary line.
 */
export function getPrimaryPercent(result: ProviderResult): number | undefined {
  const progressLines = result.lines.filter((l) => l.type === 'progress');
  if (progressLines.length === 0) return undefined;

  // If Antigravity, look for Gemini Flash / primary model first
  if (result.id === 'antigravity') {
    const flash = progressLines.find((l) => /flash/i.test(l.label));
    if (flash && flash.type === 'progress') {
      return flash.format.kind === 'percent' ? flash.used : (flash.used / flash.limit) * 100;
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
 * Render compact status bar text for all active providers.
 */
export function renderMultiStatusBarText(
  activeResults: ProviderResult[],
  style: StatusBarStyle = 'compact',
): string {
  if (activeResults.length === 0) {
    return '$(telescope) TokenLens';
  }

  const parts = activeResults.map((result) => {
    const shortName = PROVIDER_SHORT_NAMES[result.id] ?? result.name.split(' ')[0];
    const pct = getPrimaryPercent(result);

    if (pct !== undefined) {
      const rounded = Math.round(pct);
      if (style === 'blocks') {
        return `${shortName} ${renderMicroBlocks(rounded)} ${rounded}%`;
      }
      return `${shortName} ${rounded}%`;
    }

    // Badge or state fallback
    const badge = result.lines.find((l) => l.type === 'badge');
    if (badge && badge.type === 'badge') {
      return `${shortName} ✓`;
    }

    return shortName;
  });

  return `$(telescope) ${parts.join(' · ')}`;
}

/**
 * Get status bar background color based on usage percent and budget alert level.
 */
export function getStatusBarColor(
  results: ProviderResult[],
  alertLevel: AlertLevel,
): vscode.ThemeColor | undefined {
  if (alertLevel === 'panic') {
    return new vscode.ThemeColor('statusBarItem.errorBackground');
  }
  if (alertLevel === 'critical' || alertLevel === 'warning') {
    return new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  // Only turn warning/error if an in-use provider is genuinely exhausted (>= 95%)
  for (const r of results) {
    const pct = getPrimaryPercent(r);
    if (pct !== undefined && pct >= 98) {
      return new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    if (pct !== undefined && pct >= 92) {
      return new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  }

  return undefined;
}

/**
 * Build a rich markdown tooltip for the status bar item.
 */
export function renderTooltip(
  allResults: ProviderResult[],
  budget: BudgetState,
): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;

  md.appendMarkdown(`### 🔭 TokenLens — AI Quotas & Usage\n\n`);

  const active = allResults.filter(
    (r) =>
      !r.error &&
      r.lines.some(
        (l) =>
          l.type === 'progress' ||
          (l.type === 'badge' &&
            !l.text.toLowerCase().includes('idle') &&
            !l.text.toLowerCase().includes('not installed')),
      ),
  );

  if (active.length === 0) {
    md.appendMarkdown('No active AI sessions detected.\n\n');
  } else {
    for (const result of active) {
      const planBadge = result.plan ? ` *(${result.plan})*` : '';
      md.appendMarkdown(`**${result.name}**${planBadge}\n\n`);

      for (const line of result.lines) {
        if (line.type === 'progress') {
          const pct =
            line.format.kind === 'percent'
              ? line.used
              : line.limit > 0
                ? (line.used / line.limit) * 100
                : 0;
          const bar = renderMicroBlocks(pct);
          const resetInfo = line.resetPeriodLabel ? ` *(⏱️ ${line.resetPeriodLabel})*` : '';
          md.appendMarkdown(`- ${line.label}: \`${bar}\` **${Math.round(pct)}%**${resetInfo}\n`);
        } else if (line.type === 'text') {
          md.appendMarkdown(`- ${line.label}: **${line.value}**\n`);
        } else if (line.type === 'badge') {
          md.appendMarkdown(`- ${line.label}: \`${line.text}\`\n`);
        }
      }
      md.appendMarkdown('\n');
    }
  }

  // Budget Section
  md.appendMarkdown('---\n\n');
  const alertIcon =
    budget.alertLevel === 'panic'
      ? '🚨'
      : budget.alertLevel === 'critical'
        ? '🔴'
        : budget.alertLevel === 'warning'
          ? '⚠️'
          : '✅';
  md.appendMarkdown(
    `💰 **Budget:** \$${budget.currentSpend.toFixed(2)} / \$${budget.monthly.toFixed(2)} ${alertIcon} (${budget.percent}%)\n\n`,
  );

  // Quick Action Links
  md.appendMarkdown('---\n\n');
  md.appendMarkdown(
    `[$(graph) Open Dashboard](command:tokenlens.openDashboard)  •  [$(gear) Settings](command:tokenlens.openSettings)  •  [$(refresh) Refresh](command:tokenlens.refresh)\n`,
  );

  return md;
}
