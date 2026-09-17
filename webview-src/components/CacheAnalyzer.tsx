import React from 'react';
import type { CacheAnalytics, DisplayCurrencyState } from '../../src/types/index';

interface CacheAnalyzerProps {
  cache: CacheAnalytics;
  currency: DisplayCurrencyState;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return `${count}`;
}

export default function CacheAnalyzer({ cache, currency }: CacheAnalyzerProps) {
  const convertedSavings = cache.estimatedSavingsUsd * currency.rate;
  const formattedSavings =
    currency.code === 'JPY'
      ? `${currency.symbol}${Math.round(convertedSavings).toLocaleString()}`
      : `${currency.symbol}${convertedSavings.toFixed(2)}`;

  return (
    <div className="tl-cache-card">
      <div className="tl-cache-header">
        <div>
          <h3 className="tl-section-title">⚡ Prompt Cache Efficiency</h3>
          <span className="tl-section-subtitle">
            Token reuse across Claude, Codex, Grok, and Cline sessions
          </span>
        </div>
        <div className="tl-cache-savings-badge">
          <span className="tl-savings-label">Saved by Caching:</span>
          <strong className="tl-savings-val">{formattedSavings} {currency.code}</strong>
        </div>
      </div>

      {/* Big Hit Rate Meter */}
      <div className="tl-cache-meter-box">
        <div className="tl-meter-label-row">
          <span className="tl-meter-title">Cache Hit Rate</span>
          <strong className="tl-meter-pct">{cache.hitRatePercent}%</strong>
        </div>
        <div className="tl-cache-bar-bg">
          <div
            className="tl-cache-bar-fill"
            style={{ width: `${Math.min(100, Math.max(0, cache.hitRatePercent))}%` }}
          />
        </div>
        <div className="tl-cache-legend">
          <span>0% (Cold context)</span>
          <span>50% (Good reuse)</span>
          <span>80%+ (Ultra-optimized)</span>
        </div>
      </div>

      {/* Breakdown Grid */}
      <div className="tl-cache-grid">
        <div className="tl-cache-stat">
          <span className="tl-stat-label">Cache Read Tokens</span>
          <strong className="tl-stat-val text-green">{formatTokens(cache.cachedReadTokens)}</strong>
          <span className="tl-stat-sub">~90% cheaper rate</span>
        </div>
        <div className="tl-cache-stat">
          <span className="tl-stat-label">Cache Write Tokens</span>
          <strong className="tl-stat-val text-purple">{formatTokens(cache.cacheWriteTokens)}</strong>
          <span className="tl-stat-sub">Ephemeral memory</span>
        </div>
        <div className="tl-cache-stat">
          <span className="tl-stat-label">Uncached Input</span>
          <strong className="tl-stat-val text-orange">{formatTokens(cache.uncachedInputTokens)}</strong>
          <span className="tl-stat-sub">Full input cost</span>
        </div>
      </div>

      <div className="tl-cache-note">
        💡 <strong>Pro Tip:</strong> Keeping system instructions and frequently referenced codebase files in stable prefixes maximizes prompt cache hits on Anthropic and OpenAI.
      </div>
    </div>
  );
}

