import * as vscode from 'vscode';
import type { AlertLevel, BudgetState } from '../types/index.js';

export class BudgetService {
  private currentSpend = 0;
  private currentMonthKey = '';

  constructor(private readonly globalState: vscode.Memento) {
    this.currentMonthKey = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    this.currentSpend = this.globalState.get<number>(`tokenlens.spend.${this.currentMonthKey}`, 0);
  }

  getMonthlyBudget(): number {
    return vscode.workspace.getConfiguration('tokenlens').get<number>('budget.monthly', 20);
  }

  isAlertEnabled(): boolean {
    return vscode.workspace.getConfiguration('tokenlens').get<boolean>('budget.alertEnabled', true);
  }

  getCurrentSpend(): number {
    return this.currentSpend;
  }

  updateSpend(amount: number, monthKey: string): void {
    this.currentSpend = amount;
    this.currentMonthKey = monthKey;
    this.globalState.update(`tokenlens.spend.${monthKey}`, amount);
  }

  getBudgetPercent(): number {
    const budget = this.getMonthlyBudget();
    if (budget <= 0) return 0;
    return Math.round((this.currentSpend / budget) * 100);
  }

  getAlertLevel(): AlertLevel {
    const pct = this.getBudgetPercent();
    if (pct >= 95) return 'panic';
    if (pct >= 90) return 'critical';
    if (pct >= 75) return 'warning';
    return 'safe';
  }

  getBudgetState(): BudgetState {
    const monthly = this.getMonthlyBudget();
    const percent = this.getBudgetPercent();
    const alertLevel = this.getAlertLevel();
    return {
      monthly,
      alertEnabled: this.isAlertEnabled(),
      currentSpend: this.currentSpend,
      percent,
      alertLevel,
    };
  }

  checkAndNotify(): void {
    if (!this.isAlertEnabled()) return;

    const budget = this.getMonthlyBudget();
    if (budget <= 0) return;

    const pct = this.getBudgetPercent();
    const notifiedKey = `tokenlens.notified.${this.currentMonthKey}`;
    const notified = this.globalState.get<number[]>(notifiedKey, []);

    // 100% threshold
    if (pct >= 100 && !notified.includes(100)) {
      notified.push(100);
      this.globalState.update(notifiedKey, notified);
      vscode.window.showErrorMessage(
        `🚨 TokenLens: You have reached 100% of your monthly AI budget (\$${this.currentSpend.toFixed(2)} / \$${budget.toFixed(2)}).`,
        'Open Dashboard',
      ).then((choice) => {
        if (choice === 'Open Dashboard') {
          vscode.commands.executeCommand('workbench.view.extension.tokenlens');
        }
      });
      return;
    }

    // 95% Panic threshold
    if (pct >= 95 && !notified.includes(95)) {
      notified.push(95);
      this.globalState.update(notifiedKey, notified);
      vscode.window.showErrorMessage(
        `⚠️ TokenLens Panic Alert: You have used ${pct}% of your monthly AI budget (\$${this.currentSpend.toFixed(2)} / \$${budget.toFixed(2)}).`,
      );
      return;
    }

    // 90% Critical threshold
    if (pct >= 90 && !notified.includes(90)) {
      notified.push(90);
      this.globalState.update(notifiedKey, notified);
      vscode.window.showWarningMessage(
        `⚠️ TokenLens Alert: You have reached 90% of your monthly AI budget (\$${this.currentSpend.toFixed(2)} / \$${budget.toFixed(2)}).`,
      );
      return;
    }

    // 75% Warning threshold
    if (pct >= 75 && !notified.includes(75)) {
      notified.push(75);
      this.globalState.update(notifiedKey, notified);
      vscode.window.showWarningMessage(
        `TokenLens Alert: You have reached 75% of your monthly AI budget (\$${this.currentSpend.toFixed(2)} / \$${budget.toFixed(2)}).`,
      );
    }
  }
}
