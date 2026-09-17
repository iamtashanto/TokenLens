import * as vscode from 'vscode';
import type { ROIConfig, ROIResult } from '../types/index.js';

export class ROICalculator {
  getConfig(): ROIConfig {
    const config = vscode.workspace.getConfiguration('tokenlens.roi');
    return {
      hourlyRate: config.get<number>('hourlyRate', 35),
      minutesPerInteraction: config.get<number>('minutesPerInteraction', 5),
    };
  }

  calculate(totalCost: number, recordCount: number, config: ROIConfig): ROIResult {
    const estimatedSessions = recordCount;
    const savedHours = (estimatedSessions * config.minutesPerInteraction) / 60;
    const savedMoney = savedHours * config.hourlyRate;
    const roi = totalCost > 0 ? ((savedMoney - totalCost) / totalCost) * 100 : 0;

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      estimatedSessions,
      savedHours: Math.round(savedHours * 10) / 10,
      savedMoney: Math.round(savedMoney * 100) / 100,
      roi: Math.round(roi),
    };
  }
}
