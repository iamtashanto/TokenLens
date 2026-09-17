import React from 'react';
import type { ProjectSplit, DisplayCurrencyState } from '../../src/types/index';

interface ProjectBreakdownProps {
  projects: ProjectSplit[];
  currency: DisplayCurrencyState;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return `${count}`;
}

export default function ProjectBreakdown({ projects, currency }: ProjectBreakdownProps) {
  if (projects.length === 0) {
    return (
      <div className="tl-empty-state">
        <span className="tl-empty-icon">📁</span>
        <p>No workspace or project breakdown available.</p>
        <span className="tl-empty-sub">
          Usage from local CLI logs will automatically be categorized by repository folder.
        </span>
      </div>
    );
  }

  const totalCostUsd = projects.reduce((acc, p) => acc + p.costUsd, 0);

  return (
    <div className="tl-projects-container">
      <div className="tl-projects-header">
        <h3 className="tl-section-title">📂 Project & Repository Breakdown</h3>
        <span className="tl-section-subtitle">
          Track token spend per client project or repository workspace
        </span>
      </div>

      <div className="tl-projects-list">
        {projects.map((p) => {
          const convertedCost = p.costUsd * currency.rate;
          const formattedCost =
            currency.code === 'JPY'
              ? `${currency.symbol}${Math.round(convertedCost).toLocaleString()}`
              : `${currency.symbol}${convertedCost.toFixed(2)}`;

          const totalTokens = (p.tokens.input ?? 0) + (p.tokens.output ?? 0);
          const pctOfTotal = totalCostUsd > 0 ? Math.round((p.costUsd / totalCostUsd) * 100) : 0;

          return (
            <div key={p.projectName} className="tl-project-card">
              <div className="tl-project-top">
                <div className="tl-project-name-group">
                  <span className="tl-folder-icon">📁</span>
                  <strong className="tl-project-title">{p.projectName}</strong>
                  {p.topModel && <span className="tl-top-model-tag">{p.topModel}</span>}
                </div>
                <div className="tl-project-cost-group">
                  <span className="tl-project-cost">{formattedCost}</span>
                  <span className="tl-project-pct">({pctOfTotal}%)</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="tl-project-bar-bg">
                <div
                  className="tl-project-bar-fill"
                  style={{ width: `${Math.min(100, Math.max(0, pctOfTotal))}%` }}
                />
              </div>

              {/* Meta stats */}
              <div className="tl-project-meta-row">
                <span>{p.records.toLocaleString()} requests</span>
                <span>{p.sessions.toLocaleString()} sessions</span>
                <span>{formatTokens(totalTokens)} tokens</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

