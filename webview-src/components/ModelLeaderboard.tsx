import React, { useState } from 'react';
import type { UsageSummary, ModelSplit } from '../../src/types/index';

interface ModelLeaderboardProps {
  summary: UsageSummary;
}

type SortField = 'cost' | 'records' | 'tokens' | 'costPerRecord';

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return `${count}`;
}

export default function ModelLeaderboard({ summary }: ModelLeaderboardProps) {
  const [sortField, setSortField] = useState<SortField>('cost');
  const [sortAsc, setSortAsc] = useState(false);

  const models = summary.modelSplit ?? [];

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedModels = [...models].sort((a, b) => {
    let valA = 0;
    let valB = 0;

    switch (sortField) {
      case 'cost':
        valA = a.cost?.amount ?? 0;
        valB = b.cost?.amount ?? 0;
        break;
      case 'records':
        valA = a.records;
        valB = b.records;
        break;
      case 'tokens':
        valA = (a.tokens.input ?? 0) + (a.tokens.output ?? 0);
        valB = (b.tokens.input ?? 0) + (b.tokens.output ?? 0);
        break;
      case 'costPerRecord':
        valA = a.records > 0 ? (a.cost?.amount ?? 0) / a.records : 0;
        valB = b.records > 0 ? (b.cost?.amount ?? 0) / b.records : 0;
        break;
    }

    return sortAsc ? valA - valB : valB - valA;
  });

  if (models.length === 0) {
    return (
      <div className="tl-empty-state">
        <span className="tl-empty-icon">🏆</span>
        <p>No model usage recorded yet.</p>
        <span className="tl-empty-sub">
          Enable local logs in settings to see per-model cost and token ranking.
        </span>
      </div>
    );
  }

  return (
    <div className="tl-leaderboard-container">
      <div className="tl-leaderboard-header">
        <h3 className="tl-section-title">🏆 Model Leaderboard</h3>
        <span className="tl-section-subtitle">Ranked by overall efficiency and spend</span>
      </div>

      <div className="tl-table-wrapper">
        <table className="tl-leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Model</th>
              <th>Provider</th>
              <th onClick={() => handleSort('records')} className="sortable">
                Interactions {sortField === 'records' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('tokens')} className="sortable">
                Tokens {sortField === 'tokens' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('cost')} className="sortable">
                Cost {sortField === 'cost' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('costPerRecord')} className="sortable">
                Cost / Req {sortField === 'costPerRecord' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedModels.map((m, idx) => {
              const totalTokens = (m.tokens.input ?? 0) + (m.tokens.output ?? 0);
              const costPerReq = m.records > 0 ? (m.cost?.amount ?? 0) / m.records : 0;
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`;

              return (
                <tr key={`${m.provider}-${m.model}`} className={idx < 3 ? 'tl-top-rank' : ''}>
                  <td className="tl-rank-cell">{medal}</td>
                  <td className="tl-model-name-cell">
                    <strong>{m.model}</strong>
                  </td>
                  <td className="tl-provider-pill-cell">
                    <span className={`tl-prov-tag prov-${m.provider}`}>{m.provider}</span>
                  </td>
                  <td>{m.records.toLocaleString()}</td>
                  <td>{formatTokens(totalTokens)}</td>
                  <td className="tl-cost-cell">
                    ${(m.cost?.amount ?? 0).toFixed(4)}
                  </td>
                  <td className="tl-cost-per-req-cell">
                    ${costPerReq.toFixed(4)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
