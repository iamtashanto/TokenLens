import * as vscode from 'vscode';
import type { ProviderResult, BudgetState } from '../types/index.js';
import type { ProviderRegistry } from '../providers/registry.js';
import {
  renderMultiStatusBarText,
  getPrimaryPercent,
  getStatusBarColor,
  renderTooltip,
  StatusBarStyle,
  PROVIDER_SHORT_NAMES,
} from './StatusBarRenderer.js';

export class StatusBarController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private results: ProviderResult[] = [];
  private budget: BudgetState = {
    monthly: 20,
    alertEnabled: true,
    currentSpend: 0,
    percent: 0,
    alertLevel: 'safe',
  };
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly registry: ProviderRegistry,
  ) {
    // Create right-aligned status bar item
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'tokenlens.openDashboard';
    this.item.name = 'TokenLens';
    this.item.text = '$(telescope) TokenLens';
    this.item.tooltip = 'Click to open TokenLens AI Dashboard';
    this.item.show();

    // React to config changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('tokenlens.display')) {
          this.render();
        }
      }),
    );
  }

  /** Update with fresh data and re-render */
  update(results: ProviderResult[], budget: BudgetState): void {
    this.results = results;
    this.budget = budget;
    this.render();
  }

  /** Get active providers (with progress lines / valid data) */
  private getActiveResults(): ProviderResult[] {
    const config = vscode.workspace.getConfiguration('tokenlens');
    const pinned = config.get<string>('display.statusBarProvider', '');

    if (pinned) {
      const found = this.results.find((r) => r.id === pinned);
      if (found) return [found];
    }

    const active = this.results.filter(
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

    return active.length > 0 ? active : this.results.slice(0, 1);
  }

  /** Re-render the status bar item */
  render(): void {
    if (this.results.length === 0) {
      this.item.text = '$(telescope) TokenLens';
      this.item.backgroundColor = undefined;
      return;
    }

    const activeResults = this.getActiveResults();
    const style = vscode.workspace
      .getConfiguration('tokenlens')
      .get<StatusBarStyle>('display.statusBarStyle', 'compact');

    // Render compact multi-provider status bar text
    this.item.text = renderMultiStatusBarText(activeResults, style);

    // Color: gentle warning/error only when genuinely needed
    this.item.backgroundColor = getStatusBarColor(activeResults, this.budget.alertLevel);

    // Tooltip: comprehensive summary for all providers
    this.item.tooltip = renderTooltip(this.results, this.budget);
  }

  /** Show QuickPick to let user select which provider to pin */
  async selectProvider(): Promise<void> {
    if (this.results.length === 0) {
      vscode.window.showInformationMessage('TokenLens: No provider data yet. Please refresh first.');
      return;
    }

    const items: vscode.QuickPickItem[] = [
      {
        label: '$(telescope) Auto (Show all active providers)',
        description: 'Displays all active providers side-by-side in the status bar',
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
    if (loading) {
      this.item.text = '$(loading~spin) TokenLens';
    } else {
      this.render();
    }
  }

  dispose(): void {
    this.item.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
