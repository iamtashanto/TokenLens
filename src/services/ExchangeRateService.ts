import * as vscode from 'vscode';
import type { PublicExchangeRates, DisplayCurrencyState, SupportedCurrency } from '../types/index.js';
import { httpGetJson } from '../util/http.js';

const EXCHANGE_API_URL = 'https://open.er-api.com/v6/latest/USD';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  BDT: '৳',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'AU$',
};

const DEFAULT_RATES: Record<string, number> = {
  USD: 1.0,
  BDT: 122.5,
  EUR: 0.92,
  GBP: 0.78,
  INR: 86.8,
  JPY: 154.0,
  CAD: 1.39,
  AUD: 1.55,
};

export class ExchangeRateService {
  private cachedRates: PublicExchangeRates | null = null;

  async fetchPublicRates(): Promise<PublicExchangeRates> {
    try {
      const data = await httpGetJson<{
        result?: string;
        base_code?: string;
        rates?: Record<string, number>;
      }>(EXCHANGE_API_URL, { timeoutMs: 6000 });

      if (data.result === 'success' && data.rates) {
        this.cachedRates = {
          updatedAt: new Date().toISOString(),
          rates: { ...DEFAULT_RATES, ...data.rates },
        };
        return this.cachedRates;
      }
    } catch {
      // ignore network errors and use defaults
    }

    this.cachedRates = {
      updatedAt: new Date().toISOString(),
      rates: DEFAULT_RATES,
    };
    return this.cachedRates;
  }

  getDisplayCurrency(): DisplayCurrencyState {
    const code = (vscode.workspace
      .getConfiguration('tokenlens')
      .get<string>('display.currency', 'USD')
      .toUpperCase()) as SupportedCurrency;

    const symbol = CURRENCY_SYMBOLS[code] ?? '$';

    if (code === 'USD') {
      return { code: 'USD', symbol: '$', rate: 1, source: 'fallback' };
    }

    // Check manual override in config
    const manualOverrides = vscode.workspace
      .getConfiguration('tokenlens')
      .get<Record<string, number>>('display.exchangeRates', {});

    if (manualOverrides[code] && manualOverrides[code] > 0) {
      return { code, symbol, rate: manualOverrides[code], source: 'manual' };
    }

    // Check cached public rates or default rates
    const rate = this.cachedRates?.rates[code] ?? DEFAULT_RATES[code] ?? 1.0;
    return {
      code,
      symbol,
      rate,
      source: this.cachedRates ? 'public' : 'fallback',
    };
  }

  getRate(code: string): number {
    return this.cachedRates?.rates[code] ?? DEFAULT_RATES[code] ?? 1.0;
  }

  formatCurrency(amountUsd: number, targetCode?: string): string {
    const disp = this.getDisplayCurrency();
    const code = targetCode ?? disp.code;
    const rate = code === disp.code ? disp.rate : (DEFAULT_RATES[code] ?? 1);
    const symbol = CURRENCY_SYMBOLS[code] ?? '$';
    const converted = amountUsd * rate;

    if (code === 'JPY') {
      return `${symbol}${Math.round(converted).toLocaleString()}`;
    }
    return `${symbol}${converted.toFixed(2)}`;
  }
}
