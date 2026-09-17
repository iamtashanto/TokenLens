import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const home = os.homedir();
const platform = process.platform;

function expandHome(...segments: string[]): string {
  return path.join(home, ...segments);
}

// ------------------------------------------------------------------
// Cursor
// ------------------------------------------------------------------

export function getCursorDbPath(): string | null {
  if (platform === 'darwin') {
    return expandHome('Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  if (platform === 'win32') {
    const appdata = process.env['APPDATA'] ?? expandHome('AppData', 'Roaming');
    return path.join(appdata, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  // Linux
  const xdg = process.env['XDG_CONFIG_HOME'] ?? expandHome('.config');
  return path.join(xdg, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

// ------------------------------------------------------------------
// Windsurf
// ------------------------------------------------------------------

export function getWindsurfDbPaths(): string[] {
  const candidates: string[] = [];
  if (platform === 'darwin') {
    candidates.push(
      expandHome('Library', 'Application Support', 'Windsurf', 'User', 'globalStorage', 'state.vscdb'),
      expandHome('Library', 'Application Support', 'Windsurf - Next', 'User', 'globalStorage', 'state.vscdb'),
    );
  } else if (platform === 'win32') {
    const appdata = process.env['APPDATA'] ?? expandHome('AppData', 'Roaming');
    candidates.push(
      path.join(appdata, 'Windsurf', 'User', 'globalStorage', 'state.vscdb'),
      path.join(appdata, 'Windsurf - Next', 'User', 'globalStorage', 'state.vscdb'),
    );
  } else {
    const xdg = process.env['XDG_CONFIG_HOME'] ?? expandHome('.config');
    candidates.push(
      path.join(xdg, 'Windsurf', 'User', 'globalStorage', 'state.vscdb'),
      path.join(xdg, 'Windsurf - Next', 'User', 'globalStorage', 'state.vscdb'),
    );
  }
  return candidates;
}

// ------------------------------------------------------------------
// Antigravity
// ------------------------------------------------------------------

export function getAntigravityDbPath(): string | null {
  if (platform === 'darwin') {
    return expandHome('Library', 'Application Support', 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
  }
  if (platform === 'win32') {
    const appdata = process.env['APPDATA'] ?? expandHome('AppData', 'Roaming');
    return path.join(appdata, 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
  }
  const xdg = process.env['XDG_CONFIG_HOME'] ?? expandHome('.config');
  return path.join(xdg, 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
}

/** Paths where antigravity-usage CLI stores OAuth tokens */
export function getAntigravityTokenPaths(): string[] {
  const candidates: string[] = [];
  if (platform === 'darwin') {
    const base = expandHome('Library', 'Application Support', 'antigravity-usage');
    candidates.push(path.join(base, 'tokens.json'));
    // Enumerate accounts sub-directory
    const accountsDir = path.join(base, 'accounts');
    try {
      for (const entry of fs.readdirSync(accountsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          candidates.push(path.join(accountsDir, entry.name, 'tokens.json'));
        }
      }
    } catch { /* ignore */ }
  } else if (platform === 'win32') {
    const appdata = process.env['APPDATA'] ?? expandHome('AppData', 'Roaming');
    const base = path.join(appdata, 'antigravity-usage');
    candidates.push(path.join(base, 'tokens.json'));
    const accountsDir = path.join(base, 'accounts');
    try {
      for (const entry of fs.readdirSync(accountsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          candidates.push(path.join(accountsDir, entry.name, 'tokens.json'));
        }
      }
    } catch { /* ignore */ }
  } else {
    const xdg = process.env['XDG_CONFIG_HOME'] ?? expandHome('.config');
    const base = path.join(xdg, 'antigravity-usage');
    candidates.push(path.join(base, 'tokens.json'));
    const accountsDir = path.join(base, 'accounts');
    try {
      for (const entry of fs.readdirSync(accountsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          candidates.push(path.join(accountsDir, entry.name, 'tokens.json'));
        }
      }
    } catch { /* ignore */ }
  }
  return candidates;
}

// ------------------------------------------------------------------
// Claude
// ------------------------------------------------------------------

export function getClaudeCredentialsPath(): string {
  return expandHome('.claude', '.credentials.json');
}

export function getClaudeProjectsDir(): string {
  return expandHome('.claude', 'projects');
}

// ------------------------------------------------------------------
// Codex
// ------------------------------------------------------------------

export function getCodexAuthPaths(): string[] {
  return [
    expandHome('.config', 'codex', 'auth.json'),
    expandHome('.codex', 'auth.json'),
  ];
}

export function getCodexSessionsDir(): string {
  return expandHome('.codex', 'sessions');
}

// ------------------------------------------------------------------
// GitHub Copilot / gh CLI
// ------------------------------------------------------------------

export function getGhHostsPath(): string | null {
  const candidates = [
    expandHome('.config', 'gh', 'hosts.yml'),
  ];
  if (platform === 'win32') {
    const appdata = process.env['APPDATA'];
    if (appdata) candidates.push(path.join(appdata, 'GitHub CLI', 'hosts.yml'));
  }
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function getGhExecutablePaths(): string[] {
  if (platform === 'win32') {
    return ['gh.exe'];
  }
  return ['/usr/bin/gh', '/usr/local/bin/gh', '/opt/homebrew/bin/gh', 'gh'];
}

// ------------------------------------------------------------------
// Ollama
// ------------------------------------------------------------------

export function getOllamaDbPath(): string | null {
  if (platform === 'darwin') {
    return expandHome('Library', 'Application Support', 'Ollama', 'db.sqlite');
  }
  if (platform === 'win32') {
    const appdata = process.env['APPDATA'] ?? expandHome('AppData', 'Roaming');
    return path.join(appdata, 'Ollama', 'db.sqlite');
  }
  return expandHome('.ollama', 'db.sqlite');
}

export function getOllamaLogPaths(): string[] {
  if (platform === 'darwin') {
    return [expandHome('.ollama', 'logs', 'server.log')];
  }
  if (platform === 'win32') {
    const appdata = process.env['APPDATA'] ?? expandHome('AppData', 'Roaming');
    return [path.join(appdata, 'Ollama', 'logs', 'server.log')];
  }
  return [expandHome('.ollama', 'logs', 'server.log')];
}

// ------------------------------------------------------------------
// Grok
// ------------------------------------------------------------------

export function getGrokSessionsDir(): string | null {
  const grokHome = process.env['GROK_HOME'];
  if (grokHome) return path.join(grokHome, 'sessions');
  const candidates = [
    expandHome('.grok', 'sessions'),
    expandHome('.grok-cli', 'sessions'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

export function getGrokCliDbPath(): string | null {
  const candidates = [
    expandHome('.grok', 'session.db'),
    expandHome('.grok-cli', 'session.db'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

// ------------------------------------------------------------------
// Generic helpers
// ------------------------------------------------------------------

/** Return the first path that exists */
export function firstExisting(paths: string[]): string | null {
  return paths.find((p) => fs.existsSync(p)) ?? null;
}
