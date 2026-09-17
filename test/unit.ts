import assert from 'assert';
import { PricingService } from '../src/services/PricingService.js';
import { ExchangeRateService } from '../src/services/ExchangeRateService.js';
import { ROICalculator } from '../src/services/ROICalculator.js';
import { BudgetService } from '../src/services/BudgetService.js';
import { CacheAnalyticsService } from '../src/services/CacheAnalyticsService.js';
import { OptimizationAdvisorService } from '../src/services/OptimizationAdvisorService.js';
import { TimeRangeService } from '../src/services/TimeRangeService.js';
import type { UsageRecord, ModelSplit } from '../src/types/index.js';

async function runTests() {
  console.log('--- Starting TokenLens Unit Test Suite ---');

  // 1. PricingService
  const pricing = new PricingService();
  const claudeEst = pricing.estimateCost({
    provider: 'claude',
    model: 'claude-3-7-sonnet-20250219',
    tokens: {
      input: 1000,
      output: 500,
      cacheRead: 2000,
    },
    timestamp: new Date().toISOString(),
  });
  assert(claudeEst.available && claudeEst.cost, 'Claude 3.7 cost estimate should be available');
  assert(claudeEst.cost.amount > 0, 'Claude 3.7 cost should be greater than 0');
  assert.strictEqual(claudeEst.cost.currency, 'USD');
  console.log('✓ PricingService: Claude 3.7 cost calculation passed ($' + claudeEst.cost.amount.toFixed(6) + ')');

  // 2. ExchangeRateService
  const exchange = new ExchangeRateService();
  const bdtRate = exchange.getRate('BDT');
  const eurRate = exchange.getRate('EUR');
  assert(bdtRate > 100, 'BDT rate should be > 100');
  assert(eurRate > 0.5 && eurRate < 2.0, 'EUR rate should be around ~0.9');
  console.log('✓ ExchangeRateService: Multi-currency conversion passed (1 USD = ' + bdtRate + ' BDT)');

  // 3. ROICalculator
  const roiCalc = new ROICalculator();
  const records: UsageRecord[] = [
    {
      provider: 'claude',
      model: 'claude-3-7-sonnet-20250219',
      sessionId: 's1',
      cost: { amount: 1.5, currency: 'USD', source: 'calculated' },
      timestamp: new Date().toISOString(),
    },
    {
      provider: 'codex',
      model: 'gpt-4o',
      sessionId: 's2',
      cost: { amount: 2.0, currency: 'USD', source: 'calculated' },
      timestamp: new Date().toISOString(),
    },
  ];
  const roi = roiCalc.calculate(3.5, records.length, { hourlyRate: 50, minutesPerInteraction: 5 });
  assert.strictEqual(roi.estimatedSessions, 2);
  assert(roi.savedHours > 0, 'Saved hours should be > 0');
  assert(roi.roi > 0, 'ROI % should be > 0');
  console.log('✓ ROICalculator: ROI math passed (' + roi.savedHours.toFixed(1) + ' hrs saved, ROI ' + roi.roi + '%)');

  // 4. BudgetService
  const mockStorage = new Map<string, any>();
  const mockMemento = {
    get: (key: string, defaultVal: any) => mockStorage.get(key) ?? defaultVal,
    update: async (key: string, val: any) => { mockStorage.set(key, val); },
    keys: () => Array.from(mockStorage.keys()),
  };
  const budget = new BudgetService(mockMemento as any);
  budget.updateSpend(5, '2026-09');
  const stateSafe = budget.getBudgetState();
  assert.strictEqual(stateSafe.alertLevel, 'safe');
  assert.strictEqual(stateSafe.percent, 25);

  budget.updateSpend(16, '2026-09');
  assert.strictEqual(budget.getAlertLevel(), 'warning');

  budget.updateSpend(22, '2026-09');
  assert.strictEqual(budget.getAlertLevel(), 'panic');
  console.log('✓ BudgetService: Alert threshold evaluation passed (safe, warning, panic)');

  // 5. CacheAnalyticsService
  const cacheService = new CacheAnalyticsService();
  const cacheRecords: UsageRecord[] = [
    {
      provider: 'claude',
      model: 'claude-3-7-sonnet-20250219',
      tokens: {
        input: 1000,
        cacheRead: 9000,
      },
      cost: { amount: 0.1, currency: 'USD', source: 'calculated' },
      timestamp: new Date().toISOString(),
    },
  ];
  const cacheStats = cacheService.calculate(cacheRecords);
  assert.strictEqual(cacheStats.totalInputTokens, 10000);
  assert.strictEqual(cacheStats.hitRatePercent, 90);
  assert(cacheStats.estimatedSavingsUsd > 0, 'Estimated cache savings should be > 0');
  console.log('✓ CacheAnalyticsService: Hit rate (90%) and savings ($' + cacheStats.estimatedSavingsUsd.toFixed(4) + ') passed');

  // 6. OptimizationAdvisorService
  const advisor = new OptimizationAdvisorService();
  const modelSplits: ModelSplit[] = [
    {
      model: 'claude-3-opus-20240229',
      provider: 'claude',
      recordCount: 15,
      tokens: { input: 50000, output: 20000 },
      cost: { amount: 12.5, currency: 'USD', source: 'calculated' },
    },
  ];
  const tips = advisor.generateTips(modelSplits, cacheStats);
  assert(tips.length > 0, 'Advisor should generate tips');
  console.log('✓ OptimizationAdvisorService: Generated ' + tips.length + ' actionable optimization tips: "' + tips[0].title + '"');

  // 7. TimeRangeService
  const timeService = new TimeRangeService();
  const thisWeek = timeService.resolve('thisWeek');
  assert(thisWeek.startDate.length > 0, 'Start date should not be empty');
  assert(thisWeek.endDate.length > 0, 'End date should not be empty');
  // 8. StatusBarRenderer
  const { renderProviderStatusBarText, renderProviderTooltip, formatResetCountdown } = await import('../src/views/StatusBarRenderer.js');
  const dummyAgResult = {
    id: 'antigravity',
    name: 'Antigravity',
    icon: 'antigravity',
    plan: 'Pro Plan',
    lines: [
      {
        type: 'progress' as const,
        label: 'Gemini Models — 5-Hour Limit',
        used: 45,
        limit: 100,
        format: { kind: 'percent' as const },
        resetsAt: new Date(Date.now() + 2 * 3600000 + 15 * 60000).toISOString(),
        resetPeriodLabel: '5-Hour Window',
      },
      {
        type: 'progress' as const,
        label: 'Gemini Models — Weekly Limit',
        used: 20,
        limit: 100,
        format: { kind: 'percent' as const },
        resetsAt: new Date(Date.now() + 4 * 86400000).toISOString(),
        resetPeriodLabel: 'Weekly Reset',
      },
    ],
  };
  const agText = renderProviderStatusBarText(dummyAgResult, 'circle');
  assert(agText.includes('AG 45%'), 'StatusBar text should include AG 45%');
  assert(agText.includes('◑') || agText.includes('●') || agText.includes('◕'), 'StatusBar text should have circle gauge glyph');

  const agTooltip = renderProviderTooltip(dummyAgResult, stateSafe);
  assert(agTooltip.value.includes('TokenLens'), 'Tooltip should contain TokenLens');
  assert(agTooltip.value.includes('Gemini Models — 5-Hour Limit'), 'Tooltip should list 5-Hour Limit');
  assert(agTooltip.value.includes('Weekly Reset'), 'Tooltip should list Weekly Reset');
  assert(agTooltip.value.includes('command:tokenlens.openDashboard'), 'Tooltip should include openDashboard link');

  const countdown = formatResetCountdown(new Date(Date.now() + 2 * 3600000).toISOString());
  assert(countdown && countdown.includes('2h'), 'Countdown should format 2h');
  console.log('✓ StatusBarRenderer: Multi-provider circle indicator & tooltip formatted properly: "' + agText + '"');

  console.log('\n==================================================');
  console.log('  ALL TOKENLENS UNIT TESTS PASSED SUCCESSFULLY!  ');
  console.log('==================================================\n');
}

runTests();

