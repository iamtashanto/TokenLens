import * as vscode from 'vscode';
import type { ProviderResult, BudgetState } from '../types/index.js';
import type { ProviderRegistry } from '../providers/registry.js';
import {
  renderProviderStatusBarText,
  renderProviderTooltip,
  renderOverviewTooltip,
  getProviderStatusBarColor,
  getPrimaryPercent,
  PROVIDER_SHORT_NAMES,
  PROVIDER_PRIORITIES,
  StatusBarStyle,
} from './StatusBarRenderer.js';

export class StatusBarController implements vscode.Disposable {
  private readonly fallbackItem: vscode.StatusBarItem;
  private readonly providerItems: Map<string, vscode.StatusBarItem> = new Map();
  private results: ProviderResult[] = [];
  private budget: BudgetState = {
    monthly: 20,
    alertEnabled: true,
    currentSpend: 0,
    percent: 0,
    alertLevel: 'safe',
  };
  private readonly disposables: vscode.Disposable[] = [];
  private isLoading = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly registry: ProviderRegistry,
  ) {
    // Fallback item shown when loading or no active providers
    this.fallbackItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.fallbackItem.command = 'tokenlens.openDashboard';
    this.fallbackItem.name = 'TokenLens';
    this.fallbackItem.text = '$(telescope) TokenLens';
    this.fallbackItem.tooltip = 'Click to open TokenLens AI Dashboard';
    this.fallbackItem.show();

    // React to configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('tokenlens.display')) {
          this.render();
        }
      }),
    );
  }

  /** Update with fresh provider data and re-render */
  update(results: ProviderResult[], budget: BudgetState): void {
    this.results = results;
    this.budget = budget;
    this.render();
  }

  /** Get active providers (with progress lines or connected state) */
  private getActiveResults(): ProviderResult[] {
    const config = vscode.workspace.getConfiguration('tokenlens');
    const pinned = config.get<string>('display.statusBarProvider', '');

    if (pinned) {
      const found = this.results.find((r) => r.id === pinned);
      if (found) return [found];
    }

    const active = this.results.filter((r) => {
      if (r.error) return false;
      const hasProgress = r.lines.some((l) => l.type === 'progress');
      const hasActiveBadge = r.lines.some(
        (l) =>
          l.type === 'badge' &&
          !l.text.toLowerCase().includes('idle') &&
          !l.text.toLowerCase().includes('not installed'),
      );
      return hasProgress || hasActiveBadge;
    });

    return active.length > 0 ? active : this.results.slice(0, 1);
  }

  /** Re-render all status bar items */
  render(): void {
    if (this.isLoading) {
      this.fallbackItem.text = '$(loading~spin) TokenLens';
      this.fallbackItem.show();
      for (const item of this.providerItems.values()) {
        item.hide();
      }
      return;
    }

    const activeResults = this.getActiveResults();
    const style = vscode.workspace
      .getConfiguration('tokenlens')
      .get<StatusBarStyle>('display.statusBarStyle', 'compact');

    if (activeResults.length === 0) {
      this.fallbackItem.text = '$(telescope) TokenLens';
      this.fallbackItem.backgroundColor = undefined;
      this.fallbackItem.tooltip = renderOverviewTooltip(this.results, this.budget);
      this.fallbackItem.show();

      for (const item of this.providerItems.values()) {
        item.hide();
      }
      return;
    }

    // Hide fallback item when individual provider items are active
    this.fallbackItem.hide();

    const activeIds = new Set<string>();

    for (const res of activeResults) {
      activeIds.add(res.id);
      let item = this.providerItems.get(res.id);

      if (!item) {
        const priority = PROVIDER_PRIORITIES[res.id] ?? 100;
        item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority);
        item.command = 'tokenlens.openDashboard';
        this.providerItems.set(res.id, item);
      }

      item.name = `TokenLens: ${res.name}`;
      item.text = renderProviderStatusBarText(res, style);
      item.tooltip = renderProviderTooltip(res, this.budget);
      item.backgroundColor = getProviderStatusBarColor(res, this.budget.alertLevel);
      item.show();
    }

    // Hide any items for inactive providers
    for (const [id, item] of this.providerItems.entries()) {
      if (!activeIds.has(id)) {
        item.hide();
      }
    }
  }

  /** QuickPick to allow user to select a pinned provider or auto */
  async selectProvider(): Promise<void> {
    if (this.results.length === 0) {
      vscode.window.showInformationMessage('TokenLens: No provider data yet. Please refresh first.');
      return;
    }

    const items: vscode.QuickPickItem[] = [
      {
        label: '$(telescope) Auto (Show all active providers)',
        description: 'Displays individual circular indicators for each active provider',
        detail: '',
      },
      ...this.results.map((r) => {
        const pct = getPrimaryPercent(r);
        const pctStr = pct !== undefined ? ` — ${Math.round(pct)}%` : '';
        const short = PROVIDER_SHORT_NAMES[r.id] ?? r.name;
        return {
          label: `$(tokenlens-${r.id}) ${r.name} [${short}]${pctStr}`,
          description: r.error ? `Error: ${r.error}` : r.plan ?? '',
          detail: r.id,
        };
      }),
    ];

    const picked = await vscode.window.showQuickPick(items, {
      title: 'TokenLens: Select Status Bar Provider',
      placeHolder: 'Choose which provider(s) to display in the status bar',
    });

    if (!picked) return;

    const config = vscode.workspace.getConfiguration('tokenlens');
    const newId = picked.detail === '' ? '' : (picked.detail ?? '');
    await config.update('display.statusBarProvider', newId, vscode.ConfigurationTarget.Global);
    this.render();
  }

  setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.render();
  }

  dispose(): void {
    this.fallbackItem.dispose();
    for (const item of this.providerItems.values()) {
      item.dispose();
    }
    this.providerItems.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
