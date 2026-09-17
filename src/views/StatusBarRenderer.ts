import * as vscode from 'vscode';
import type { ProviderResult, AlertLevel, BudgetState } from '../types/index.js';

/**
 * Status bar display style type
 */
type StatusBarStyle = 'blocks' | 'percent' | 'minimal';

/** Render progress bar in blocks style: ████████░░░░ 75% */
export function renderProgressBlocks(pct: number): string {
  const total = 10;
  const filled = Math.round(Math.min(100, Math.max(0, pct)) / 10);
  return '█'.repeat(filled) + '░'.repeat(total - filled) + ` ${Math.round(pct)}%`;
}

/** Render progress bar in dots style: ●●●●●●●●○○ 75% */
export function renderProgressDots(pct: number): string {
  const total = 10;
  const filled = Math.round(Math.min(100, Math.max(0, pct)) / 10);
  return '●'.repeat(filled) + '○'.repeat(total - filled) + ` ${Math.round(pct)}%`;
}

/** Render progress in percent-only style: 75% */
export function renderProgressPercent(pct: number): string {
  return `${Math.round(pct)}%`;
}

/**
 * Render the status bar text for a provider result.
 */
export function renderStatusBarText(
  result: ProviderResult,
  style: StatusBarStyle = 'blocks',
): string {
  // Find the primary progress line (first one)
  const primaryLine = result.lines.find((l) => l.type === 'progress');
  if (!primaryLine || primaryLine.type !== 'progress') {
    // No progress line — show error or minimal info
    if (result.error) return `$(warning) ${result.name}: Error`;
    return result.name;
  }

  const pct =
    primaryLine.format.kind === 'percent'
      ? primaryLine.used
      : primaryLine.limit > 0
        ? (primaryLine.used / primaryLine.limit) * 100
        : 0;

  let bar: string;
  switch (style) {
    case 'dots':
      bar = renderProgressDots(pct);
      break;
    case 'percent':
      bar = renderProgressPercent(pct);
      break;
    case 'blocks':
    default:
      bar = renderProgressBlocks(pct);
      break;
  }

  // For dollar-based plans, also show dollar amount
  if (primaryLine.format.kind === 'dollars') {
    return `${bar} · \$${primaryLine.used.toFixed(2)}`;
  }

  return bar;
}

/**
 * Get the primary usage percent from a ProviderResult (for status bar color).
 * Returns the highest percent among all progress lines.
 */
export function getProviderPercent(result: ProviderResult): number | undefined {
  const progressLines = result.lines.filter((l) => l.type === 'progress');
  if (progressLines.length === 0) return undefined;

  let maxPct = 0;
  for (const line of progressLines) {
    if (line.type !== 'progress') continue;
    const pct =
      line.format.kind === 'percent'
        ? line.used
        : line.limit > 0
          ? (line.used / line.limit) * 100
          : 0;
    maxPct = Math.max(maxPct, pct);
  }
  return maxPct;
}

/**
 * Get status bar background color based on usage percent and budget alert level.
 * Budget alert takes priority over individual provider percent.
 */
export function getStatusBarColor(
  pct: number | undefined,
  alertLevel: AlertLevel,
): vscode.ThemeColor | undefined {
  // Budget alert takes priority
  if (alertLevel === 'panic' || alertLevel === 'critical') {
    return new vscode.ThemeColor('statusBarItem.errorBackground');
  }
  if (alertLevel === 'warning') {
    return new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  // Individual provider percent
  if (pct === undefined) return undefined;
  if (pct >= 100) return new vscode.ThemeColor('statusBarItem.errorBackground');
  if (pct >= 90) return new vscode.ThemeColor('statusBarItem.errorBackground');
  if (pct >= 75) return new vscode.ThemeColor('statusBarItem.warningBackground');
  return undefined;
}

/**
 * Build a rich markdown tooltip for the status bar item.
 */
export function renderTooltip(
  selectedResult: ProviderResult,
  allResults: ProviderResult[],
  budget: BudgetState,
): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;

  // Title
  md.appendMarkdown(`### $(eye) TokenLens — ${selectedResult.name}\n\n`);

  if (selectedResult.error) {
    md.appendMarkdown(`$(warning) **Error:** ${selectedResult.error}\n\n`);
  } else {
    // Show all metric lines for selected provider
    for (const line of selectedResult.lines) {
      if (line.type === 'progress') {
        const pct =
          line.format.kind === 'percent'
            ? line.used
            : line.limit > 0
              ? (line.used / line.limit) * 100
              : 0;
        const bar = renderProgressBlocks(pct);
        md.appendMarkdown(`**${line.label}:** ${bar}`);
        if (line.resetsAt) {
          const resetDate = new Date(line.resetsAt);
          const diff = resetDate.getTime() - Date.now();
          if (diff > 0) {
            const hours = Math.floor(diff / 3_600_000);
            const mins = Math.floor((diff % 3_600_000) / 60_000);
            md.appendMarkdown(` *(resets in ${hours}h ${mins}m)*`);
          }
        }
        md.appendMarkdown('\n\n');
      } else if (line.type === 'text') {
        md.appendMarkdown(`**${line.label}:** ${line.value}\n\n`);
      } else if (line.type === 'badge') {
        md.appendMarkdown(`${line.label}: \`${line.text}\`\n\n`);
      }
    }
  }

  // Budget section
  md.appendMarkdown('---\n\n');
  md.appendMarkdown(`**$(shield) Budget:** \$${budget.currentSpend.toFixed(2)} / \$${budget.monthly.toFixed(2)}`);
  const alertIcon =
    budget.alertLevel === 'panic'
      ? '🚨'
      : budget.alertLevel === 'critical'
        ? '🔴'
        : budget.alertLevel === 'warning'
          ? '⚠️'
          : '✅';
  md.appendMarkdown(` ${alertIcon}\n\n`);

  // Other providers summary
  const others = allResults.filter((r) => r.id !== selectedResult.id && !r.error);
  if (others.length > 0) {
    md.appendMarkdown('**Other providers:**\n\n');
    for (const r of others) {
      const pct = getProviderPercent(r);
      const pctStr = pct !== undefined ? ` ${Math.round(pct)}%` : '';
      md.appendMarkdown(`- ${r.name}${pctStr}\n`);
    }
    md.appendMarkdown('\n');
  }

  md.appendMarkdown('---\n\n');
  md.appendMarkdown('$(refresh) Click to select provider · $(graph) Open Dashboard\n');

  return md;
}

/** Format a dollar amount for display */
export function formatDollars(amount: number): string {
  return `\$${amount.toFixed(2)}`;
}

