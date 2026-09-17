import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  getClaudeProjectsDir,
  getCodexSessionsDir,
  getGrokSessionsDir,
} from '../util/platform.js';

export interface DetectedSources {
  claude: string | null;
  codex: string | null;
  grok: string | null;
}

export class LocalSourceDetector {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private countFiles(dir: string, maxDepth = 4, currentDepth = 0): number {
    if (!fs.existsSync(dir) || currentDepth > maxDepth) return 0;
    let count = 0;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          count += this.countFiles(path.join(dir, entry.name), maxDepth, currentDepth + 1);
        } else if (/\.(json|jsonl)$/i.test(entry.name) && !entry.name.endsWith('.meta.json')) {
          count++;
        }
      }
    } catch {
      // ignore
    }
    return count;
  }

  async detect(): Promise<DetectedSources> {
    const result: DetectedSources = { claude: null, codex: null, grok: null };

    // Claude
    const claudeDir = getClaudeProjectsDir();
    if (this.countFiles(claudeDir) > 0) {
      result.claude = claudeDir;
    }

    // Codex
    const codexDir = getCodexSessionsDir();
    if (this.countFiles(codexDir) > 0) {
      result.codex = codexDir;
    }

    // Grok
    const grokDir = getGrokSessionsDir();
    if (grokDir && this.countFiles(grokDir) > 0) {
      result.grok = grokDir;
    }

    return result;
  }

  async promptIfNew(detected: DetectedSources): Promise<void> {
    const config = vscode.workspace.getConfiguration('tokenlens');
    const updates: Array<{ key: string; val: string; name: string }> = [];

    if (detected.claude && !config.get<string>('localSources.claude')) {
      updates.push({ key: 'localSources.claude', val: detected.claude, name: 'Claude Code CLI' });
    }
    if (detected.codex && !config.get<string>('localSources.codex')) {
      updates.push({ key: 'localSources.codex', val: detected.codex, name: 'OpenAI Codex CLI' });
    }
    if (detected.grok && !config.get<string>('localSources.grok')) {
      updates.push({ key: 'localSources.grok', val: detected.grok, name: 'Grok CLI' });
    }

    if (updates.length > 0) {
      const names = updates.map((u) => u.name).join(', ');
      const choice = await vscode.window.showInformationMessage(
        `TokenLens detected local AI logs for ${names}. Enable tracking?`,
        'Enable All',
        'Not Now',
      );
      if (choice === 'Enable All') {
        for (const u of updates) {
          await config.update(u.key, u.val, vscode.ConfigurationTarget.Global);
        }
        vscode.window.showInformationMessage('TokenLens: Local AI log sources configured.');
      }
    }
  }
}
