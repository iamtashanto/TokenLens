import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { ProviderRegistry } from './providers/registry.js';
import { SecretStore, SECRET_KEYS } from './util/secrets.js';
import { ClaudeProvider } from './providers/claude.js';
import { CursorProvider } from './providers/cursor.js';
import { CopilotProvider } from './providers/copilot.js';
import { CodexProvider } from './providers/codex.js';
import { WindsurfProvider } from './providers/windsurf.js';
import { AntigravityProvider } from './providers/antigravity.js';
import { OllamaProvider } from './providers/ollama.js';
import { DeepSeekProvider } from './providers/deepseek.js';
import { MistralProvider } from './providers/mistral.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { GroqProvider } from './providers/groq.js';
import { PricingService } from './services/PricingService.js';
import { UsageAggregator } from './services/UsageAggregator.js';
import { BudgetService } from './services/BudgetService.js';
import { ROICalculator } from './services/ROICalculator.js';
import { ExchangeRateService } from './services/ExchangeRateService.js';
import { TimeRangeService } from './services/TimeRangeService.js';
import { AutoRefreshService } from './services/AutoRefreshService.js';
import { LocalSourceDetector } from './services/LocalSourceDetector.js';
import { ExportService } from './services/ExportService.js';
import { ClaudeAdapter } from './adapters/ClaudeAdapter.js';
import { CodexAdapter } from './adapters/CodexAdapter.js';
import { GrokAdapter } from './adapters/GrokAdapter.js';
import { ClineAdapter } from './adapters/ClineAdapter.js';
import { StatusBarController } from './views/StatusBarController.js';
import { DashboardWebviewProvider } from './views/DashboardWebviewProvider.js';
import type {
  ProviderResult,
  UsageSummary,
  DashboardState,
  UsageRecord,
  TimeRangeKind,
  SupportedCurrency,
} from './types/index.js';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[TokenLens] Activating ultra extension...');

  // 1. Core utilities and services
  const secretStore = new SecretStore(context.secrets);
  const pricingService = new PricingService();
  const usageAggregator = new UsageAggregator(pricingService);
  const budgetService = new BudgetService(context.globalState);
  const roiCalculator = new ROICalculator();
  const exchangeRateService = new ExchangeRateService();
  const timeRangeService = new TimeRangeService();
  const sourceDetector = new LocalSourceDetector(context);
  const exportService = new ExportService();

  // Pre-fetch live exchange rates in background
  exchangeRateService.fetchPublicRates().catch(() => {});

  // 2. Adapters for local log parsing
  const claudeAdapter = new ClaudeAdapter();
  const codexAdapter = new CodexAdapter();
  const grokAdapter = new GrokAdapter();
  const clineAdapter = new ClineAdapter();

  // 3. Provider Registry & All 11 Providers
  const registry = new ProviderRegistry();
  registry.register(new ClaudeProvider(secretStore));
  registry.register(new CursorProvider());
  registry.register(new CopilotProvider());
  registry.register(new CodexProvider());
  registry.register(new WindsurfProvider());
  registry.register(new AntigravityProvider(secretStore));
  registry.register(new OllamaProvider());
  registry.register(new DeepSeekProvider(secretStore));
  registry.register(new MistralProvider(secretStore));
  registry.register(new OpenRouterProvider(secretStore));
  registry.register(new GroqProvider(secretStore));

  // 4. Status Bar Controller
  const statusBar = new StatusBarController(context, registry);
  context.subscriptions.push(statusBar);

  // 5. Webview Dashboard Provider
  const webviewProvider = new DashboardWebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('tokenlens.dashboard', webviewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // State caches
  let cachedResults: ProviderResult[] = [];
  let cachedSummary: UsageSummary | null = null;
  let activeRangeKind: TimeRangeKind = vscode.workspace
    .getConfiguration('tokenlens')
    .get<TimeRangeKind>('display.defaultRange', 'thisWeek');
  let refreshInFlight: Promise<void> | null = null;

  /** Collect records from local log adapters */
  async function loadLocalRecords(): Promise<UsageRecord[]> {
    const config = vscode.workspace.getConfiguration('tokenlens');
    const records: UsageRecord[] = [];

    // Claude Code CLI
    const claudePath = config.get<string>('localSources.claude');
    if (claudePath) {
      try {
        const res = await claudeAdapter.importUsage([claudePath]);
        records.push(...res.records);
      } catch (err) {
        console.warn('[TokenLens] Claude local import error:', err);
      }
    }

    // Codex CLI
    const codexPath = config.get<string>('localSources.codex');
    if (codexPath) {
      try {
        const res = await codexAdapter.importUsage([codexPath]);
        records.push(...res.records);
      } catch (err) {
        console.warn('[TokenLens] Codex local import error:', err);
      }
    }

    // Grok CLI
    const grokPath = config.get<string>('localSources.grok');
    if (grokPath) {
      try {
        const res = await grokAdapter.importUsage([grokPath]);
        records.push(...res.records);
      } catch (err) {
        console.warn('[TokenLens] Grok local import error:', err);
      }
    }

    // Cline & Roo Code
    const clineHome = path.join(os.homedir(), '.cline', 'tasks');
    const rooHome = path.join(os.homedir(), '.roo-code', 'tasks');
    const clinePaths: string[] = [];
    if (vscode.workspace.fs) {
      clinePaths.push(clineHome, rooHome);
    }
    try {
      const res = await clineAdapter.importUsage(clinePaths);
      records.push(...res.records);
    } catch {
      // ignore
    }

    return records;
  }

  /** Calculate total dollar spend this month across providers and local records */
  function calculateTotalMonthlySpend(
    results: ProviderResult[],
    summary: UsageSummary | null,
  ): number {
    let spend = 0;

    for (const r of results) {
      for (const line of r.lines) {
        if (line.type === 'progress' && line.format.kind === 'dollars') {
          spend += line.used;
        }
      }
    }

    if (summary?.totals.cost?.amount) {
      spend += summary.totals.cost.amount;
    }

    return Math.round(spend * 100) / 100;
  }

  function assembleDashboardState(): DashboardState | null {
    if (!cachedSummary) return null;
    const currentSpend = calculateTotalMonthlySpend(cachedResults, cachedSummary);
    const budgetState = budgetService.getBudgetState();
    const roiConfig = roiCalculator.getConfig();
    const roiResult = roiCalculator.calculate(
      currentSpend,
      cachedSummary.totals.records,
      roiConfig,
    );
    const currency = exchangeRateService.getDisplayCurrency();

    return {
      providers: cachedResults,
      summary: cachedSummary,
      budget: budgetState,
      roi: roiResult,
      currency,
      updatedAt: new Date().toISOString(),
    };
  }

  /** Refresh all data */
  async function refreshAll(): Promise<void> {
    if (refreshInFlight) return refreshInFlight;

    statusBar.setLoading(true);
    webviewProvider.postLoading(true);

    refreshInFlight = (async () => {
      try {
        const enabledConfig = vscode.workspace.getConfiguration('tokenlens.providers');

        const providers = registry.getAll().filter((p) => {
          return enabledConfig.get<boolean>(`${p.id}.enabled`, true);
        });

        const results = await Promise.all(
          providers.map(async (p) => {
            webviewProvider.postRefreshing(p.id, true);
            try {
              return await p.fetch();
            } finally {
              webviewProvider.postRefreshing(p.id, false);
            }
          }),
        );
        cachedResults = results;

        const range = timeRangeService.resolve(activeRangeKind);
        const localRecords = await loadLocalRecords();
        cachedSummary = usageAggregator.aggregate(localRecords, range);

        const currentSpend = calculateTotalMonthlySpend(cachedResults, cachedSummary);
        const currentMonth = timeRangeService.getCurrentMonthKey();
        budgetService.updateSpend(currentSpend, currentMonth);
        budgetService.checkAndNotify();

        const state = assembleDashboardState();
        if (state) {
          statusBar.update(cachedResults, state.budget);
          webviewProvider.postState(state);
        }
      } catch (err) {
        console.error('[TokenLens] Refresh error:', err);
        webviewProvider.postError(err instanceof Error ? err.message : String(err));
      } finally {
        statusBar.setLoading(false);
        webviewProvider.postLoading(false);
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  }

  // 6. Handle messages from webview
  webviewProvider.onMessage(async (msg) => {
    switch (msg.type) {
      case 'ready': {
        const state = assembleDashboardState();
        if (state) {
          webviewProvider.postState(state);
        }
        await refreshAll();
        break;
      }

      case 'refreshAll':
        await refreshAll();
        break;

      case 'refreshProvider': {
        const p = registry.getById(msg.id);
        if (p) {
          webviewProvider.postRefreshing(msg.id, true);
          try {
            const res = await p.fetch();
            const idx = cachedResults.findIndex((r) => r.id === msg.id);
            if (idx >= 0) cachedResults[idx] = res;
            else cachedResults.push(res);
            const state = assembleDashboardState();
            if (state) {
              webviewProvider.postState(state);
              statusBar.update(cachedResults, state.budget);
            }
          } finally {
            webviewProvider.postRefreshing(msg.id, false);
          }
        }
        break;
      }

      case 'setRange':
        activeRangeKind = msg.range;
        await refreshAll();
        break;

      case 'setBudget':
        await vscode.workspace
          .getConfiguration('tokenlens')
          .update('budget.monthly', msg.monthly, vscode.ConfigurationTarget.Global);
        await refreshAll();
        break;

      case 'setROIRate':
        await vscode.workspace
          .getConfiguration('tokenlens')
          .update('roi.hourlyRate', msg.hourlyRate, vscode.ConfigurationTarget.Global);
        await refreshAll();
        break;

      case 'setCurrency':
        await vscode.workspace
          .getConfiguration('tokenlens')
          .update('display.currency', msg.currency, vscode.ConfigurationTarget.Global);
        const state = assembleDashboardState();
        if (state) webviewProvider.postState(state);
        break;

      case 'exportCSV':
        if (cachedSummary) {
          const csv = exportService.generateCSV(cachedSummary);
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`tokenlens-export-${new Date().toISOString().slice(0, 10)}.csv`),
            filters: { 'CSV Files': ['csv'] },
          });
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(csv, 'utf8'));
            vscode.window.showInformationMessage('TokenLens: Usage CSV exported successfully!');
          }
        }
        break;

      case 'exportJSON': {
        const fullState = assembleDashboardState();
        if (fullState) {
          const json = exportService.generateJSON(fullState);
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`tokenlens-export-${new Date().toISOString().slice(0, 10)}.json`),
            filters: { 'JSON Files': ['json'] },
          });
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
            vscode.window.showInformationMessage('TokenLens: Usage JSON exported successfully!');
          }
        }
        break;
      }

      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'tokenlens');
        break;

      case 'detectSources':
        vscode.commands.executeCommand('tokenlens.detectSources');
        break;
    }
  });

  // 7. Auto-refresh service
  const autoRefreshService = new AutoRefreshService(refreshAll);
  autoRefreshService.start();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('tokenlens.refreshInterval')) {
        autoRefreshService.restart();
      }
      if (e.affectsConfiguration('tokenlens.providers') || e.affectsConfiguration('tokenlens.display.currency')) {
        refreshAll();
      }
    }),
    { dispose: () => autoRefreshService.stop() },
  );

  // 8. Register Commands
  async function promptSecret(key: string, prompt: string, placeholder: string): Promise<void> {
    const value = await vscode.window.showInputBox({
      prompt,
      placeHolder: placeholder,
      password: true,
      ignoreFocusOut: true,
    });
    if (value !== undefined && value.trim()) {
      await secretStore.set(key, value.trim());
      vscode.window.showInformationMessage(`TokenLens: ${prompt} saved.`);
      await refreshAll();
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenlens.openDashboard', async () => {
      try {
        await vscode.commands.executeCommand('workbench.view.extension.tokenlens');
      } catch {
        // fallback
      }
      try {
        await vscode.commands.executeCommand('tokenlens.dashboard.focus');
      } catch {
        // fallback
      }
    }),
    vscode.commands.registerCommand('tokenlens.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'tokenlens');
    }),
    vscode.commands.registerCommand('tokenlens.cycleStatusBar', () => {
      statusBar.selectProvider();
    }),
    vscode.commands.registerCommand('tokenlens.configureStatusBar', () => {
      statusBar.configureVisibility();
    }),
    vscode.commands.registerCommand('tokenlens.setBudget', async () => {
      const input = await vscode.window.showInputBox({
        prompt: 'Enter monthly AI spending budget in USD',
        placeHolder: '20',
        validateInput: (v) => (!isNaN(Number(v)) && Number(v) >= 0 ? null : 'Please enter a valid positive number'),
      });
      if (input !== undefined) {
        await vscode.workspace
          .getConfiguration('tokenlens')
          .update('budget.monthly', Number(input), vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`TokenLens: Monthly budget set to \$${input}`);
        await refreshAll();
      }
    }),
    vscode.commands.registerCommand('tokenlens.setROIRate', async () => {
      const input = await vscode.window.showInputBox({
        prompt: 'Enter your hourly rate in USD for ROI calculation',
        placeHolder: '35',
        validateInput: (v) => (!isNaN(Number(v)) && Number(v) > 0 ? null : 'Please enter a valid positive number'),
      });
      if (input !== undefined) {
        await vscode.workspace
          .getConfiguration('tokenlens')
          .update('roi.hourlyRate', Number(input), vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`TokenLens: Hourly rate set to \$${input}/hr`);
        await refreshAll();
      }
    }),
    vscode.commands.registerCommand('tokenlens.detectSources', async () => {
      const detected = await sourceDetector.detect();
      await sourceDetector.promptIfNew(detected);
      await refreshAll();
    }),
    vscode.commands.registerCommand('tokenlens.exportCSV', () => {
      if (cachedSummary) {
        const csv = exportService.generateCSV(cachedSummary);
        vscode.window.showSaveDialog({ filters: { 'CSV Files': ['csv'] } }).then((uri) => {
          if (uri) vscode.workspace.fs.writeFile(uri, Buffer.from(csv, 'utf8'));
        });
      }
    }),
    vscode.commands.registerCommand('tokenlens.exportJSON', () => {
      const state = assembleDashboardState();
      if (state) {
        const json = exportService.generateJSON(state);
        vscode.window.showSaveDialog({ filters: { 'JSON Files': ['json'] } }).then((uri) => {
          if (uri) vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
        });
      }
    }),
    vscode.commands.registerCommand('tokenlens.setClaudeToken', () =>
      promptSecret(SECRET_KEYS.CLAUDE_COOKIE, 'Claude Session Cookie', 'sessionKey=...'),
    ),
    vscode.commands.registerCommand('tokenlens.setDeepSeekKey', () =>
      promptSecret(SECRET_KEYS.DEEPSEEK_API_KEY, 'DeepSeek API Key', 'sk-...'),
    ),
    vscode.commands.registerCommand('tokenlens.setOpenRouterKey', () =>
      promptSecret('openrouter.apiKey', 'OpenRouter API Key', 'sk-or-v1-...'),
    ),
    vscode.commands.registerCommand('tokenlens.setGroqKey', () =>
      promptSecret('groq.apiKey', 'Groq API Key', 'gsk_...'),
    ),
    vscode.commands.registerCommand('tokenlens.setMistralCookie', () =>
      promptSecret(SECRET_KEYS.MISTRAL_COOKIE, 'Mistral Admin Cookie', 'csrftoken=...; sessionid=...'),
    ),
    vscode.commands.registerCommand('tokenlens.setAntigravityToken', () =>
      promptSecret(SECRET_KEYS.ANTIGRAVITY_TOKEN, 'Antigravity OAuth Token', 'ya29....'),
    ),
    vscode.commands.registerCommand('tokenlens.clearSecrets', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Are you sure you want to clear all stored TokenLens secrets?',
        { modal: true },
        'Clear All',
      );
      if (confirm === 'Clear All') {
        await secretStore.deleteAll([...Object.values(SECRET_KEYS), 'openrouter.apiKey', 'groq.apiKey']);
        vscode.window.showInformationMessage('TokenLens: All stored credentials cleared.');
        await refreshAll();
      }
    }),
  );

  // 9. Auto-detect sources on startup
  const autoDetect = vscode.workspace
    .getConfiguration('tokenlens')
    .get<boolean>('autoDetectLocalSources', true);
  if (autoDetect) {
    sourceDetector.detect().then((detected) => {
      sourceDetector.promptIfNew(detected);
    });
  }

  // 10. Initial refresh
  refreshAll();
}

export function deactivate(): void {
  console.log('[TokenLens] Extension deactivated.');
}
