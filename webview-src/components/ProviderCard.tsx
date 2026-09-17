import React from 'react';
import type { ProviderResult, ProgressLine, TextLine, BadgeLine, DisplayCurrencyState } from '../../src/types/index';

interface ProviderCardProps {
  result: ProviderResult;
  currency?: DisplayCurrencyState;
  refreshing?: boolean;
}

function getProgressColor(pct: number): string {
  if (pct < 50) return '#22c55e'; // green
  if (pct < 75) return '#f59e0b'; // amber
  if (pct < 90) return '#f97316'; // orange
  return '#ef4444'; // red
}

function timeUntilReset(isoStr: string | null | undefined): string | null {
  if (!isoStr) return null;
  const target = new Date(isoStr).getTime();
  const diff = target - Date.now();
  if (diff <= 0) return 'Reset due';
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `⏱️ Resets in ${days}d ${hours % 24}h`;
  if (hours > 0) return `⏱️ Resets in ${hours}h ${mins}m`;
  return `⏱️ Resets in ${mins}m`;
}

function formatMetricValue(line: ProgressLine, currency?: DisplayCurrencyState): string {
  if (line.format.kind === 'percent') {
    return `${Math.round(line.used)}% used`;
  }
  if (line.format.kind === 'dollars') {
    const sym = currency?.symbol ?? '$';
    const rate = currency?.rate ?? 1;
    const used = line.used * rate;
    const limit = line.limit * rate;
    if (currency?.code === 'JPY') {
      return `${sym}${Math.round(used).toLocaleString()} / ${sym}${Math.round(limit).toLocaleString()}`;
    }
    return `${sym}${used.toFixed(2)} / ${sym}${limit.toFixed(2)}`;
  }
  return `${Math.round(line.used)} / ${Math.round(line.limit)} ${line.format.suffix ?? ''}`.trim();
}

export default function ProviderCard({ result, currency, refreshing }: ProviderCardProps) {
  const { name, brandColor, plan, lines, error, quotaSummary } = result;

  const progressLines = lines.filter((l): l is ProgressLine => l.type === 'progress');
  const textLines = lines.filter((l): l is TextLine => l.type === 'text');
  const badgeLines = lines.filter((l): l is BadgeLine => l.type === 'badge');

  const topResetCountdown = timeUntilReset(quotaSummary?.primaryResetIso);

  return (
    <div className={`tl-provider-card${refreshing ? ' refreshing' : ''}`}>
      {/* Header */}
      <div className="tl-card-header">
        <div className="tl-card-title-group">
          <span
            className="tl-provider-dot"
            style={{ backgroundColor: brandColor }}
            title={name}
          />
          <strong className="tl-provider-name">{name}</strong>
          {plan && <span className="tl-plan-badge">{plan}</span>}
        </div>
        <div className="tl-card-top-right">
          {topResetCountdown && (
            <span className="tl-reset-pill">{topResetCountdown}</span>
          )}
          {refreshing && <span className="tl-refresh-spinner">Refreshing...</span>}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="tl-card-error">
          <span className="tl-error-icon">⚠️</span>
          <span className="tl-error-text">{error}</span>
        </div>
      )}

      {/* Metric lines */}
      {!error && (
        <div className="tl-card-metrics">
          {/* Progress lines */}
          {progressLines.map((line, idx) => {
            const pct =
              line.format.kind === 'percent'
                ? line.used
                : line.limit > 0
                  ? (line.used / line.limit) * 100
                  : 0;
            const barColor = getProgressColor(pct);
            const lineResetText = timeUntilReset(line.resetsAt) || (line.resetPeriodLabel ? `⏱️ ${line.resetPeriodLabel}` : null);

            return (
              <div key={idx} className="tl-metric-progress">
                <div className="tl-metric-label-row">
                  <div className="tl-label-with-tag">
                    <span className="tl-metric-label">{line.label}</span>
                  </div>
                  <div className="tl-metric-right-col">
                    <strong className="tl-metric-value">{formatMetricValue(line, currency)}</strong>
                  </div>
                </div>
                <div className="tl-progress-bar-bg">
                  <div
                    className="tl-progress-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.max(0, pct))}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>
                {lineResetText && (
                  <div className="tl-reset-text">{lineResetText}</div>
                )}
              </div>
            );
          })}

          {/* Text lines */}
          {textLines.map((line, idx) => (
            <div key={idx} className="tl-metric-text-row">
              <span className="tl-text-label">{line.label}:</span>
              <strong className="tl-text-val">{line.value}</strong>
            </div>
          ))}

          {/* Badge lines */}
          {badgeLines.length > 0 && (
            <div className="tl-metric-badge-row">
              {badgeLines.map((b, idx) => (
                <span
                  key={idx}
                  className="tl-badge-pill"
                  style={{
                    borderColor: b.color ?? 'var(--vscode-badge-background)',
                    color: b.color ?? 'var(--vscode-badge-foreground)',
                  }}
                >
                  {b.label ? `${b.label}: ${b.text}` : b.text}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
