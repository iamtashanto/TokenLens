import * as vscode from 'vscode';

export class AutoRefreshService {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly onRefresh: () => Promise<void>) {}

  private parseIntervalMs(intervalStr: string): number {
    switch (intervalStr) {
      case '1m':
        return 60_000;
      case '2m':
        return 120_000;
      case '5m':
        return 300_000;
      case '15m':
        return 900_000;
      case '30m':
        return 1_800_000;
      case 'manual':
      default:
        return 0;
    }
  }

  start(): void {
    this.stop();
    const setting = vscode.workspace
      .getConfiguration('tokenlens')
      .get<string>('refreshInterval', '5m');

    const ms = this.parseIntervalMs(setting);
    if (ms > 0) {
      this.timer = setInterval(() => {
        this.onRefresh().catch((err) => {
          console.warn('[TokenLens] Auto-refresh failed:', err);
        });
      }, ms);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  restart(): void {
    this.stop();
    this.start();
  }
}
