import React, { useRef, useState } from 'react';
import type { UsageSummary, BudgetState, ROIResult } from '../../src/types/index';

interface ShareCardProps {
  summary: UsageSummary;
  budget: BudgetState;
  roi: ROIResult;
}

export default function ShareCard({ summary, budget, roi }: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPNG = async () => {
    if (!cardRef.current) return;
    setIsExporting(true);

    try {
      // Dynamic import of html2canvas
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#1E1E2E',
        scale: 2,
        logging: false,
      });

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `tokenlens-ai-impact-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (err) {
      console.error('Failed to export share card:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const topModel = summary.modelSplit?.[0]?.model ?? 'Claude 3.7 Sonnet';
  const totalCost = summary.totals.cost?.amount ?? budget.currentSpend;

  return (
    <div className="tl-share-section">
      <div className="tl-share-header">
        <h4 className="tl-sub-title">📤 Share Your AI Impact</h4>
        <button
          className="tl-btn-share-export"
          onClick={handleExportPNG}
          disabled={isExporting}
        >
          {isExporting ? 'Generating PNG...' : 'Export Share Card (PNG)'}
        </button>
      </div>

      {/* Share Card Canvas Preview */}
      <div ref={cardRef} className="tl-share-card-canvas">
        <div className="tl-sc-header">
          <div className="tl-sc-brand">
            <span className="tl-sc-icon">🔭</span>
            <span className="tl-sc-title">TokenLens</span>
          </div>
          <span className="tl-sc-badge">100% Local AI Tracker</span>
        </div>

        <div className="tl-sc-body">
          <div className="tl-sc-stat-main">
            <span className="tl-sc-stat-label">AI Spending This Month</span>
            <span className="tl-sc-stat-val">${totalCost.toFixed(2)}</span>
          </div>

          <div className="tl-sc-grid">
            <div className="tl-sc-grid-item">
              <span className="tl-sc-grid-label">Hours Saved</span>
              <span className="tl-sc-grid-val text-blue">~{roi.savedHours}h</span>
            </div>
            <div className="tl-sc-grid-item">
              <span className="tl-sc-grid-label">Equivalent Value</span>
              <span className="tl-sc-grid-val text-green">${roi.savedMoney.toFixed(2)}</span>
            </div>
            <div className="tl-sc-grid-item">
              <span className="tl-sc-grid-label">Net AI ROI</span>
              <span className="tl-sc-grid-val text-purple">+{roi.roi.toLocaleString()}%</span>
            </div>
            <div className="tl-sc-grid-item">
              <span className="tl-sc-grid-label">Top Model</span>
              <span className="tl-sc-grid-val text-orange">{topModel}</span>
            </div>
          </div>
        </div>

        <div className="tl-sc-footer">
          <span>🔒 Privacy-first · No code or prompts leave your machine</span>
          <span className="tl-sc-date">{new Date().toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

