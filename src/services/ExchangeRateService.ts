import * as vscode from 'vscode';
import type { PublicExchangeRates, DisplayCurrencyState } from '../types/index.js';
import { httpGetJson } from '../util/http.js';

const EXCHANGE_API_URL = 'https://open.er-api.com/v6/latest/USD';

interface ErApiResponse {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
}

export class ExchangeRateService {
  private cachedRates: PublicExchangeRates | null = null;

  async fetchPublicRates(): Promise<PublicExchangeRates> {
    const data = await httpGetJson<ErApiResponse>(EXCHANGE_API_URL, { timeoutMs: 8000 });
    if (data.result !== 'success' || data.base_code !== 'USD' || !data.rates) {
      throw new Error('Invalid exchange rate API response');
    }
    this.cachedRates = {
      updatedAt: new Date().toISOString(),
      rates: data.rates,
    };
    return this.cachedRates;
  }

  getDisplayCurrency(): DisplayCurrencyState {
    const code = vscode.workspace
      .getConfiguration('tokenlens')
      .get<string>('display.currency', 'USD')
      .toUpperCase();

    if (code === 'USD') {
      return { code: 'USD', rate: 1, source: 'fallback' };
    }

    // Check manual override
    const manualOverrides = vscode.workspace
      .getConfiguration('tokenlens')
      .get<Record<string, number>>('display.exchangeRates', {});

    if (manualOverrides[code] && manualOverrides[code] > 0) {
      return { code, rate: manualOverrides[code], source: 'manual' };
    }

    // Check cached public rates
    if (this.cachedRates?.rates[code]) {
      return { code, rate: this.cachedRates.rates[code], source: 'public' };
    }

    return { code: 'USD', rate: 1, source: 'fallback' };
  }

  convertAmount(amountUsd: number, targetCode?: string): { amount: number; currency: string } {
    const display = this.getDisplayCurrency();
    const code = targetCode ?? display.code;
    const rate = code === display.code ? display.rate : 1;
    return {
      amount: Math.round(amountUsd * rate * 100) / 100,
      currency: code,
    };
  }
}
