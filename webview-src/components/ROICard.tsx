import React, { useState } from 'react';
import type { ROIResult } from '../../src/types/index';

interface ROICardProps {
  roi: ROIResult;
  onRateChange: (rate: number) => void;
}

export default function ROICard({ roi, onRateChange }: ROICardProps) {
  const [hourlyInput, setHourlyInput] = useState<string>('35');
  const [isEditing, setIsEditing] = useState(false);

  const handleRateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(hourlyInput);
    if (!isNaN(num) && num > 0) {
      onRateChange(num);
      setIsEditing(false);
    }
  };

  const netSavings = roi.savedMoney - roi.totalCost;
  const isPositive = netSavings >= 0;

  return (
    <div className="tl-roi-card">
      <div className="tl-roi-header">
        <h3 className="tl-section-title">🚀 AI ROI & Impact</h3>
        <span className="tl-section-subtitle">Estimated developer time & cost savings</span>
      </div>

      {/* Main KPI Grid */}
      <div className="tl-roi-grid">
        <div className="tl-roi-stat-box">
          <span className="tl-roi-stat-label">Spent on AI</span>
          <span className="tl-roi-stat-value text-red">${roi.totalCost.toFixed(2)}</span>
        </div>
        <div className="tl-roi-stat-box">
          <span className="tl-roi-stat-label">Hours Saved</span>
          <span className="tl-roi-stat-value text-blue">~{roi.savedHours}h</span>
        </div>
        <div className="tl-roi-stat-box">
          <span className="tl-roi-stat-label">Equivalent Value</span>
          <span className="tl-roi-stat-value text-green">${roi.savedMoney.toFixed(2)}</span>
        </div>
      </div>

      {/* ROI Banner */}
      <div className={`tl-roi-banner ${isPositive ? 'positive' : 'negative'}`}>
        <div className="tl-roi-pct">
          <span className="tl-roi-badge-text">
            {isPositive ? '▲' : '▼'} {roi.roi.toLocaleString()}% ROI
          </span>
          <span className="tl-roi-subtext">
            Net Developer Value: ${netSavings >= 0 ? '+' : ''}${netSavings.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Hourly Rate Settings Row */}
      <div className="tl-roi-rate-row">
        <span className="tl-rate-label">Hourly Rate:</span>
        {isEditing ? (
          <form onSubmit={handleRateSubmit} className="tl-rate-form">
            <span className="tl-currency-prefix">$</span>
            <input
              type="number"
              className="tl-rate-input"
              value={hourlyInput}
              onChange={(e) => setHourlyInput(e.target.value)}
              autoFocus
              min="1"
              max="1000"
            />
            <button type="submit" className="tl-btn-save">Save</button>
            <button type="button" className="tl-btn-cancel" onClick={() => setIsEditing(false)}>Cancel</button>
          </form>
        ) : (
          <div className="tl-rate-display" onClick={() => setIsEditing(true)}>
            <span className="tl-rate-current">${hourlyInput}/hr</span>
            <span className="tl-rate-edit-hint">(click to change)</span>
          </div>
        )}
      </div>

      {/* Breakdown Details */}
      <div className="tl-roi-breakdown">
        <div className="tl-breakdown-row">
          <span>Total AI Interactions:</span>
          <strong>{roi.estimatedSessions.toLocaleString()}</strong>
        </div>
        <div className="tl-breakdown-row">
          <span>Avg. Cost per Interaction:</span>
          <strong>
            ${roi.estimatedSessions > 0 ? (roi.totalCost / roi.estimatedSessions).toFixed(3) : '0.000'}
          </strong>
        </div>
        <div className="tl-breakdown-row">
          <span>Est. Time Saved / Interaction:</span>
          <strong>~5 minutes</strong>
        </div>
      </div>

      <div className="tl-roi-disclaimer">
        * Time saved is estimated at 5 minutes per AI request. Hourly rate configurable in settings.
      </div>
    </div>
  );
}
