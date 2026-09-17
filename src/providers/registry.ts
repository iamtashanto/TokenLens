import type { ProviderInterface } from './base.js';

/**
 * Registry of all registered providers.
 * Pattern from smart-usage-bar: simple array-backed, immutable after registration.
 */
export class ProviderRegistry {
  private readonly providers: ProviderInterface[] = [];

  register(provider: ProviderInterface): void {
    this.providers.push(provider);
  }

  getAll(): ProviderInterface[] {
    return [...this.providers];
  }

  getById(id: string): ProviderInterface | undefined {
    return this.providers.find((p) => p.id === id);
  }

  getIds(): string[] {
    return this.providers.map((p) => p.id);
  }
}

