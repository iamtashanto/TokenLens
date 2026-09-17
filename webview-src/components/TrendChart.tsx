import React, { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { UsageSummary } from '../../src/types/index';

type ChartMetric = 'cost' | 'input' | 'output' | 'cacheRead' | 'records';

interface TrendChartProps {
  summary: UsageSummary;
  metric?: ChartMetric;
}

const METRIC_LABELS: Record<ChartMetric, string> = {
  cost: 'Cost ($ USD)',
  input: 'Input Tokens',
  output: 'Output Tokens',
  cacheRead: 'Cache Read Tokens',
  records: 'Interaction Count',
};

export default function TrendChart({ summary, metric: initialMetric = 'cost' }: TrendChartProps) {
  const [metric, setMetric] = useState<ChartMetric>(initialMetric);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  const buckets = summary.trend;

  useEffect(() => {
    if (!containerRef.current || buckets.length === 0) return;

    // Convert buckets into uPlot timestamps and values
    const timestamps: number[] = [];
    const values: number[] = [];

    for (const b of buckets) {
      const ts = Math.floor(new Date(b.bucket.includes('T') ? `${b.bucket}:00Z` : `${b.bucket}T00:00:00Z`).getTime() / 1000);
      timestamps.push(isNaN(ts) ? Date.now() / 1000 : ts);

      let val = 0;
      switch (metric) {
        case 'cost':
          val = b.cost?.amount ?? 0;
          break;
        case 'input':
          val = b.tokens.input ?? 0;
          break;
        case 'output':
          val = b.tokens.output ?? 0;
          break;
        case 'cacheRead':
          val = b.tokens.cacheRead ?? 0;
          break;
        case 'records':
          val = b.records;
          break;
      }
      values.push(val);
    }

    const data: uPlot.AlignedData = [timestamps, values];

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth || 300,
      height: 200,
      legend: { show: false },
      cursor: { drag: { setScale: false } },
      scales: {
        x: { time: true },
        y: { auto: true },
      },
      series: [
        {},
        {
          label: METRIC_LABELS[metric],
          stroke: '#6D5DF6',
          fill: 'rgba(109, 93, 246, 0.15)',
          width: 2,
          points: { show: buckets.length <= 48, size: 5 },
        },
      ],
      axes: [
        {
          stroke: '#888888',
          grid: { stroke: 'rgba(255, 255, 255, 0.05)' },
          values: (self, ticks) =>
            ticks.map((t) => {
              const d = new Date(t * 1000);
              return summary.trendGranularity === 'hour'
                ? `${d.getHours()}:00`
                : `${d.getMonth() + 1}/${d.getDate()}`;
            }),
        },
        {
          stroke: '#888888',
          grid: { stroke: 'rgba(255, 255, 255, 0.05)' },
          values: (self, ticks) =>
            ticks.map((v) => (metric === 'cost' ? `$${v.toFixed(2)}` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)),
        },
      ],
    };

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new uPlot(opts, data, containerRef.current);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (chartRef.current && entry.contentRect.width > 0) {
          chartRef.current.setSize({
            width: entry.contentRect.width,
            height: 200,
          });
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [buckets, metric, summary.trendGranularity]);

  return (
    <div className="tl-trend-container">
      {/* Metric Selector Buttons */}
      <div className="tl-metric-switch-row">
        {(['cost', 'input', 'output', 'cacheRead', 'records'] as ChartMetric[]).map((m) => (
          <button
            key={m}
            className={`tl-metric-btn${metric === m ? ' active' : ''}`}
            onClick={() => setMetric(m)}
          >
            {m === 'cacheRead' ? 'Cache' : m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {buckets.length === 0 ? (
        <div className="tl-empty-chart">
          <p>No usage trend data for selected time range.</p>
        </div>
      ) : (
        <div ref={containerRef} className="tl-uplot-wrapper" />
      )}
    </div>
  );
}

