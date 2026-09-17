import React from 'react';
import type { OptimizationTip, DisplayCurrencyState } from '../../src/types/index';

interface OptimizationTipsProps {
  tips: OptimizationTip[];
  currency: DisplayCurrencyState;
}

export default function OptimizationTips({ tips, currency }: OptimizationTipsProps) {
  return (
    <div className="tl-tips-container">
      <div className="tl-tips-header">
        <h3 className="tl-section-title">💡 AI Cost Optimization Advisor</h3>
        <span className="tl-section-subtitle">
          Smart heuristics analyzing your token usage patterns to reduce monthly spend
        </span>
      </div>

      <div className="tl-tips-list">
        {tips.map((tip) => {
          const savings = tip.projectedMonthlySavingsUsd * currency.rate;
          const formattedSavings =
            currency.code === 'JPY'
              ? `${currency.symbol}${Math.round(savings).toLocaleString()}`
              : `${currency.symbol}${savings.toFixed(2)}`;

          return (
            <div key={tip.id} className={`tl-tip-card impact-${tip.impactLevel}`}>
              <div className="tl-tip-top">
                <div className="tl-tip-badge-group">
                  <span className={`tl-impact-tag tag-${tip.impactLevel}`}>
                    {tip.impactLevel.toUpperCase()} IMPACT
                  </span>
                  <span className="tl-category-tag">{tip.category.replace(/_/g, ' ')}</span>
                </div>
                {tip.projectedMonthlySavingsUsd > 0 && (
                  <span className="tl-tip-savings">Save ~{formattedSavings}/mo</span>
                )}
              </div>
              <h4 className="tl-tip-title">{tip.title}</h4>
              <p className="tl-tip-desc">{tip.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

