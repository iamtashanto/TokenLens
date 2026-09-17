import React from 'react';
import { postMessage } from '../vscode';

export default function ExportModal() {
  return (
    <div className="tl-export-box">
      <div className="tl-export-header">
        <h3 className="tl-section-title">📊 Full Data Export & Reports</h3>
        <span className="tl-section-subtitle">
          Export itemized token consumption and cost data for invoicing or expense reimbursement
        </span>
      </div>

      <div className="tl-export-btn-grid">
        <button
          className="tl-btn-export-csv"
          onClick={() => postMessage({ type: 'exportCSV' })}
        >
          <span className="tl-btn-icon-label">📄 Export CSV</span>
          <span className="tl-btn-sub">Itemized spreadsheet for Excel & Sheets</span>
        </button>

        <button
          className="tl-btn-export-json"
          onClick={() => postMessage({ type: 'exportJSON' })}
        >
          <span className="tl-btn-icon-label">📦 Export JSON</span>
          <span className="tl-btn-sub">Complete raw structured data dump</span>
        </button>
      </div>
    </div>
  );
}

