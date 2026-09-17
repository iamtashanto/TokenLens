import * as vscode from 'vscode';

/**
 * Thin wrapper around vscode.SecretStorage with 'tokenlens.' namespace.
 * Pattern from smart-usage-bar's SecretStore.
 */
export class SecretStore {
  private readonly NS = 'tokenlens.';

  constructor(private readonly secrets: vscode.SecretStorage) {}

  async get(key: string): Promise<string | undefined> {
    return this.secrets.get(`${this.NS}${key}`);
  }

  async set(key: string, value: string): Promise<void> {
    await this.secrets.store(`${this.NS}${key}`, value);
  }

  async delete(key: string): Promise<void> {
    await this.secrets.delete(`${this.NS}${key}`);
  }

  async deleteAll(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.delete(k)));
  }
}

/** All secret keys used by TokenLens */
export const SECRET_KEYS = {
  CLAUDE_COOKIE: 'claude.sessionCookie',
  DEEPSEEK_API_KEY: 'deepseek.apiKey',
  MISTRAL_COOKIE: 'mistral.adminCookie',
  ANTIGRAVITY_TOKEN: 'antigravity.oauthToken',
} as const;
