import React, { useState } from 'react';
import type { BudgetState, AlertLevel } from '../../src/types/index';

interface BudgetMeterProps {
  budget: BudgetState;
  onBudgetChange: (monthly: number) => void;
}

const ALERT_CONFIG: Record<AlertLevel, { label: string; icon: string; color: string }> = {
  safe: { label: 'Within Budget', icon: '✅', color: '#22c55e' },
  warning: { label: 'Warning (≥75%)', icon: '⚠️', color: '#f59e0b' },
  critical: { label: 'Critical (≥90%)', icon: '🔴', color: '#f97316' },
  panic: { label: 'Panic Mode (≥95%)', icon: '🚨', color: '#ef4444' },
};

export default function BudgetMeter({ budget, onBudgetChange }: BudgetMeterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [budgetInput, setBudgetInput] = useState(`${budget.monthly}`);

  const handleBudgetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(budgetInput);
    if (!isNaN(val) && val >= 0) {
      onBudgetChange(val);
      setIsEditing(false);
    }
  };

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(100, Math.max(0, budget.percent));
  const strokeDashoffset = circumference * (1 - clampedPct / 100);

  const alert = ALERT_CONFIG[budget.alertLevel];

  return (
    <div className="tl-budget-card">
      <div className="tl-budget-header">
        <h3 className="tl-section-title">💰 Smart Budget Alert</h3>
        <span className="tl-section-subtitle">Monthly AI spend limits & tracking</span>
      </div>

      {/* Circular Progress Ring */}
      <div className="tl-budget-ring-wrapper">
        <svg className="tl-budget-svg" width="180" height="180" viewBox="0 0 180 180">
          {/* Background circle */}
          <circle
            className="tl-ring-bg"
            cx="90"
            cy="90"
            r={radius}
            strokeWidth="14"
            fill="none"
          />
          {/* Progress circle */}
          <circle
            className="tl-ring-progress"
            cx="90"
            cy="90"
            r={radius}
            strokeWidth="14"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            stroke={alert.color}
            transform="rotate(-90 90 90)"
          />
        </svg>

        {/* Center Label */}
        <div className="tl-ring-center-content">
          <span className="tl-ring-spend">${budget.currentSpend.toFixed(2)}</span>
          <span className="tl-ring-limit">/ ${budget.monthly.toFixed(2)}</span>
          <span className="tl-ring-pct" style={{ color: alert.color }}>
            {budget.percent}%
          </span>
        </div>
      </div>

      {/* Alert Status Pill */}
      <div className="tl-alert-pill" style={{ borderColor: alert.color }}>
        <span className="tl-alert-icon">{alert.icon}</span>
        <span className="tl-alert-text" style={{ color: alert.color }}>
          {alert.label}
        </span>
      </div>

      {/* Threshold Markers */}
      <div className="tl-threshold-bar">
        <div className="tl-threshold-marker" style={{ left: '75%' }}>
          <span className="tl-marker-line" />
          <span className="tl-marker-label">75%</span>
        </div>
        <div className="tl-threshold-marker" style={{ left: '90%' }}>
          <span className="tl-marker-line" />
          <span className="tl-marker-label">90%</span>
        </div>
        <div className="tl-threshold-marker" style={{ left: '100%' }}>
          <span className="tl-marker-line" />
          <span className="tl-marker-label">100%</span>
        </div>
      </div>

      {/* Edit Budget Limit */}
      <div className="tl-budget-edit-row">
        <span className="tl-edit-label">Monthly Limit:</span>
        {isEditing ? (
          <form onSubmit={handleBudgetSubmit} className="tl-budget-form">
            <span className="tl-currency-prefix">$</span>
            <input
              type="number"
              className="tl-budget-input"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              autoFocus
              min="1"
              max="5000"
            />
            <button type="submit" className="tl-btn-save">Set</button>
            <button type="button" className="tl-btn-cancel" onClick={() => setIsEditing(false)}>Cancel</button>
          </form>
        ) : (
          <div className="tl-budget-display" onClick={() => setIsEditing(true)}>
            <span className="tl-budget-current">${budget.monthly.toFixed(2)}/mo</span>
            <span className="tl-budget-edit-hint">(click to edit)</span>
          </div>
        )}
      </div>

      <div className="tl-budget-note">
        TokenLens triggers status bar warnings and notifications at 75%, 90%, 95% (Panic Mode), and 100%.
      </div>
    </div>
  );
}
