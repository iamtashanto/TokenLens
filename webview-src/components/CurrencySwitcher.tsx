import React from 'react';
import type { SupportedCurrency, DisplayCurrencyState } from '../../src/types/index';

interface CurrencySwitcherProps {
  currency: DisplayCurrencyState;
  onCurrencyChange: (code: SupportedCurrency) => void;
}

const CURRENCIES: Array<{ code: SupportedCurrency; label: string; symbol: string }> = [
  { code: 'USD', label: 'USD ($)', symbol: '$' },
  { code: 'BDT', label: 'BDT (৳)', symbol: '৳' },
  { code: 'EUR', label: 'EUR (€)', symbol: '€' },
  { code: 'GBP', label: 'GBP (£)', symbol: '£' },
  { code: 'INR', label: 'INR (₹)', symbol: '₹' },
  { code: 'JPY', label: 'JPY (¥)', symbol: '¥' },
  { code: 'CAD', label: 'CAD ($)', symbol: 'CA$' },
  { code: 'AUD', label: 'AUD ($)', symbol: 'AU$' },
];

export default function CurrencySwitcher({ currency, onCurrencyChange }: CurrencySwitcherProps) {
  return (
    <div className="tl-currency-bar">
      <span className="tl-currency-label">Currency:</span>
      <div className="tl-currency-pills">
        {CURRENCIES.map((c) => (
          <button
            key={c.code}
            className={`tl-currency-pill${currency.code === c.code ? ' active' : ''}`}
            onClick={() => onCurrencyChange(c.code)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

