import * as fs from 'fs';
import * as path from 'path';
import type {
  PricingRule,
  CostEstimate,
  UsageRecord,
  TokenCategory,
} from '../types/index.js';

interface PricingCatalog {
  checkedAt: string;
  rules: PricingRule[];
}

export class PricingService {
  private readonly rules = new Map<string, PricingRule>();
  private readonly allRulesList: PricingRule[] = [];

  constructor() {
    this.loadCatalog();
  }

  private loadCatalog(): void {
    try {
      // Load catalog.json bundled with the extension or in source tree
      const candidates = [
        path.join(__dirname, '..', 'pricing', 'catalog.json'),
        path.join(__dirname, '..', 'src', 'pricing', 'catalog.json'),
        path.join(__dirname, 'pricing', 'catalog.json'),
        path.join(__dirname, 'src', 'pricing', 'catalog.json'),
        path.join(process.cwd(), 'src', 'pricing', 'catalog.json'),
        path.join(process.cwd(), 'dist', 'pricing', 'catalog.json'),
      ];

      let raw: string | null = null;
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          raw = fs.readFileSync(p, 'utf8');
          break;
        }
      }

      if (!raw) {
        throw new Error('catalog.json not found in any candidate path');
      }

      const catalog = JSON.parse(raw) as PricingCatalog;
      for (const rule of catalog.rules) {
        this.allRulesList.push(rule);
        const key = `${rule.provider}:${rule.model.toLowerCase()}`;
        this.rules.set(key, rule);

        // Map aliases
        for (const alias of rule.modelAliases) {
          const aliasKey = `${rule.provider}:${alias.toLowerCase()}`;
          this.rules.set(aliasKey, rule);
        }
      }
    } catch (err) {
      console.warn('[TokenLens] Could not load pricing catalog:', err);
    }
  }

  lookupRule(provider: string, model: string): PricingRule | undefined {
    const key = `${provider}:${model.toLowerCase()}`;
    if (this.rules.has(key)) return this.rules.get(key);

    // Try partial match
    for (const [k, r] of this.rules.entries()) {
      if (k.startsWith(`${provider}:`) && (model.toLowerCase().includes(r.model.toLowerCase()) || r.model.toLowerCase().includes(model.toLowerCase()))) {
        return r;
      }
    }
    return undefined;
  }

  getAllRules(): PricingRule[] {
    return [...this.allRulesList];
  }

  estimateCost(record: UsageRecord): CostEstimate {
    // If cost is already imported
    if (record.cost) {
      return { available: true, cost: record.cost };
    }

    if (!record.model) {
      return { available: false, reason: 'unknown_model' };
    }

    const rule = this.lookupRule(record.provider, record.model);
    if (!rule) {
      return { available: false, reason: 'unknown_model' };
    }

    const tokens = { ...record.tokens };
    const inputTokens = (tokens.input ?? 0) + (tokens.cachedInput ?? 0) + (tokens.cacheRead ?? 0);
    const outputTokens = tokens.output ?? 0;

    if (inputTokens === 0 && outputTokens === 0) {
      return { available: false, reason: 'missing_tokens' };
    }

    // Long-context pricing rates if applicable
    const rates =
      rule.longContext && inputTokens > rule.longContext.appliesAboveInputTokens
        ? rule.longContext.rates
        : rule.rates;

    // Cache normalization: normalize cacheRead to cachedInput if rule only has cachedInput
    if (typeof rates.cachedInput === 'number' && typeof tokens.cacheRead === 'number' && typeof rates.cacheRead !== 'number') {
      tokens.cachedInput = (tokens.cachedInput ?? 0) + tokens.cacheRead;
      delete tokens.cacheRead;
    }

    let amount = 0;
    for (const [category, count] of Object.entries(tokens)) {
      if (typeof count === 'number' && count > 0) {
        const ratePer1M = rates[category as TokenCategory] ?? 0;
        amount += (count / 1_000_000) * ratePer1M;
      }
    }

    const rounded = Math.round(amount * 1_000_000) / 1_000_000;

    return {
      available: true,
      cost: {
        amount: rounded,
        currency: 'USD',
        source: 'calculated',
      },
    };
  }
}

