import * as path from 'path';
import type { UsageRecord, ProjectSplit, TokenBreakdown, TokenCategory } from '../types/index.js';

export class ProjectSplitService {
  private addTokens(a: TokenBreakdown, b: TokenBreakdown): TokenBreakdown {
    const res: TokenBreakdown = { ...a };
    for (const [k, v] of Object.entries(b)) {
      const cat = k as TokenCategory;
      if (typeof v === 'number') {
        res[cat] = (res[cat] ?? 0) + v;
      }
    }
    return res;
  }

  calculate(records: UsageRecord[]): ProjectSplit[] {
    const projectMap = new Map<string, {
      projectName: string;
      records: number;
      sessions: Set<string>;
      tokens: TokenBreakdown;
      costUsd: number;
      modelCounts: Map<string, number>;
    }>();

    for (const r of records) {
      // Determine project name from projectName or path
      let pName = r.projectName;
      if (!pName && r.source.sourcePath) {
        const parts = r.source.sourcePath.split(path.sep);
        // Look for project folder in path (e.g., ~/.claude/projects/my-app/...)
        const projIdx = parts.indexOf('projects');
        if (projIdx >= 0 && projIdx + 1 < parts.length) {
          pName = parts[projIdx + 1];
        } else {
          pName = parts[parts.length - 2] || 'Default Workspace';
        }
      }
      pName = pName || 'Global Workspace';

      if (!projectMap.has(pName)) {
        projectMap.set(pName, {
          projectName: pName,
          records: 0,
          sessions: new Set<string>(),
          tokens: {},
          costUsd: 0,
          modelCounts: new Map<string, number>(),
        });
      }

      const entry = projectMap.get(pName)!;
      entry.records += 1;
      if (r.sessionId) entry.sessions.add(r.sessionId);
      entry.tokens = this.addTokens(entry.tokens, r.tokens);
      if (r.cost?.amount) entry.costUsd += r.cost.amount;
      if (r.model) {
        entry.modelCounts.set(r.model, (entry.modelCounts.get(r.model) ?? 0) + 1);
      }
    }

    return Array.from(projectMap.values())
      .map((e) => {
        let topModel = 'Various';
        let maxCount = 0;
        for (const [m, c] of e.modelCounts.entries()) {
          if (c > maxCount) {
            maxCount = c;
            topModel = m;
          }
        }
        return {
          projectName: e.projectName,
          records: e.records,
          sessions: e.sessions.size || e.records,
          tokens: e.tokens,
          costUsd: Math.round(e.costUsd * 100) / 100,
          topModel,
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd);
  }
}

