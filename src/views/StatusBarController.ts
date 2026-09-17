import * as vscode from 'vscode';
import type { ProviderResult, BudgetState } from '../types/index.js';
import type { ProviderRegistry } from '../providers/registry.js';
import {
  renderStatusBarText,
  getProviderPercent,
  getStatusBarColor,
  renderTooltip,
} from './StatusBarRenderer.js';

/**
 * Manages the single status bar item for TokenLens.
 * Uses usagedock's approach: one item, user picks which provider to show.
 * Color reflects budget alert level (takes priority over provider usage).
 */
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
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.item.command = 'tokenlens.cycleStatusBar';
    this.item.name = 'TokenLens';
    this.item.text = '$(eye) TokenLens';
    this.item.tooltip = 'Click to select provider or open dashboard';
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

  /** Get the selected provider ID from config, or auto-select */
  private getSelectedProviderId(): string | undefined {
    const config = vscode.workspace.getConfiguration('tokenlens');
    const pinned = config.get<string>('display.statusBarProvider', '');

    if (pinned && this.results.some((r) => r.id === pinned)) {
      return pinned;
    }

    // Auto-select: first provider with progress lines and no error
    const connected = this.results.find((r) => !r.error && r.lines.some((l) => l.type === 'progress'));
    if (connected) return connected.id;

    // Fallback: first provider overall
    return this.results[0]?.id;
  }

  /** Re-render the status bar item */
  render(): void {
    if (this.results.length === 0) {
      this.item.text = '$(eye) TokenLens';
      this.item.backgroundColor = undefined;
      return;
    }

    const selectedId = this.getSelectedProviderId();
    const selected = this.results.find((r) => r.id === selectedId) ?? this.results[0];

    if (!selected) return;

    const style = vscode.workspace
      .getConfiguration('tokenlens')
      .get<'blocks' | 'percent' | 'minimal'>('display.statusBarStyle', 'blocks');

    // Status bar text: $(tokenlens-claude) Claude ████████░░ 82%
    const iconId = `tokenlens-${selected.id}`;
    const barText = selected.error ? 'Error' : renderStatusBarText(selected, style);
    this.item.text = `$(${iconId}) ${selected.name} ${barText}`;

    // Color: budget alert takes priority
    const pct = getProviderPercent(selected);
    this.item.backgroundColor = getStatusBarColor(pct, this.budget.alertLevel);

    // Tooltip
    this.item.tooltip = renderTooltip(selected, this.results, this.budget);
  }

  /** Show QuickPick to let user select which provider to pin */
  async selectProvider(): Promise<void> {
    if (this.results.length === 0) {
      vscode.window.showInformationMessage('TokenLens: No provider data yet. Please refresh first.');
      return;
    }

    const items: vscode.QuickPickItem[] = [
      {
        label: '$(refresh) Auto (select best)',
        description: 'Automatically select the first connected provider',
        detail: '',
      },
      ...this.results.map((r) => {
        const pct = getProviderPercent(r);
        const pctStr = pct !== undefined ? ` — ${Math.round(pct)}%` : '';
        return {
          label: `$(tokenlens-${r.id}) ${r.name}${pctStr}`,
          description: r.error ? `Error: ${r.error}` : r.plan ?? '',
          detail: r.id,
        };
      }),
    ];

    const picked = await vscode.window.showQuickPick(items, {
      title: 'TokenLens: Select Status Bar Provider',
      placeHolder: 'Choose which provider to display in the status bar',
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

