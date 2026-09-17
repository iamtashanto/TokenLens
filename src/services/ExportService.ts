import type { UsageSummary, DashboardState } from '../types/index.js';

export class ExportService {
  generateCSV(summary: UsageSummary): string {
    const headers = [
      'Timestamp',
      'Provider',
      'Model',
      'Session ID',
      'Input Tokens',
      'Output Tokens',
      'Cache Read Tokens',
      'Cache Write Tokens',
      'Estimated Cost (USD)',
    ];

    const rows: string[] = [headers.join(',')];

    for (const s of summary.sessions) {
      const row = [
        `"${s.startedAt || ''}"`,
        `"${s.provider}"`,
        `"${s.model || 'Unknown'}"`,
        `"${s.sessionId}"`,
        s.tokens.input ?? 0,
        s.tokens.output ?? 0,
        s.tokens.cacheRead ?? (s.tokens.cachedInput ?? 0),
        (s.tokens.cacheWrite5m ?? 0) + (s.tokens.cacheWrite1h ?? 0),
        s.cost?.amount ? s.cost.amount.toFixed(4) : '0.0000',
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  generateJSON(state: DashboardState): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        generator: 'TokenLens VS Code Extension',
        version: '0.1.0',
        summary: state.summary,
        providers: state.providers,
        budget: state.budget,
        roi: state.roi,
      },
      null,
      2,
    );
  }
}

