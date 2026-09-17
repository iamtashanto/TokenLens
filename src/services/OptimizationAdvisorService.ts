import type { ModelSplit, CacheAnalytics, OptimizationTip } from '../types/index.js';

export class OptimizationAdvisorService {
  generateTips(models: ModelSplit[], cache: CacheAnalytics): OptimizationTip[] {
    const tips: OptimizationTip[] = [];

    // Tip 1: Heavy Opus / Expensive model usage
    const opusModel = models.find((m) => /opus/i.test(m.model));
    if (opusModel && (opusModel.cost?.amount ?? 0) > 5) {
      const spend = opusModel.cost?.amount ?? 0;
      const savings = Math.round(spend * 0.55 * 100) / 100;
      tips.push({
        id: 'opus-to-sonnet',
        title: 'Switch routine tasks from Opus to Claude 3.7 Sonnet',
        description: `You spent \$${spend.toFixed(2)} on Opus. Switching coding sub-tasks to Claude 3.7 Sonnet delivers near-identical coding benchmark scores with 60% lower cost.`,
        projectedMonthlySavingsUsd: savings,
        impactLevel: 'high',
        category: 'model_downgrade',
      });
    }

    // Tip 2: GPT-5/GPT-4o to Flash / Mini
    const gptHeavy = models.find((m) => /gpt-4o|gpt-5|gpt-6/i.test(m.model) && !/mini|flash|luna/i.test(m.model));
    if (gptHeavy && (gptHeavy.cost?.amount ?? 0) > 4) {
      const spend = gptHeavy.cost?.amount ?? 0;
      const savings = Math.round(spend * 0.65 * 100) / 100;
      tips.push({
        id: 'gpt-to-mini',
        title: 'Use GPT-4o mini or Gemini 2.0 Flash for repetitive lookups',
        description: `Heavy flagship model calls totaled \$${spend.toFixed(2)}. Routing simple queries, linting, and doc searches to mini models saves over 65%.`,
        projectedMonthlySavingsUsd: savings,
        impactLevel: 'medium',
        category: 'model_downgrade',
      });
    }

    // Tip 3: Low Cache Hit Rate
    if (cache.totalInputTokens > 500_000 && cache.hitRatePercent < 35) {
      const potentialExtraSavings = Math.round(((cache.uncachedInputTokens * 0.4 * 2.5) / 1_000_000) * 100) / 100;
      tips.push({
        id: 'enable-prompt-caching',
        title: 'Increase Prompt Caching Utilization',
        description: `Your cache hit rate is currently ${cache.hitRatePercent}%. Keeping persistent context files and using system prompt anchors can boost cache reuse above 60%.`,
        projectedMonthlySavingsUsd: potentialExtraSavings,
        impactLevel: 'high',
        category: 'cache_utilization',
      });
    }

    // Fallback general tip if no specific issues
    if (tips.length === 0) {
      tips.push({
        id: 'keep-up-efficiency',
        title: 'AI Usage is Highly Cost-Effective',
        description: 'Your model choices and cache hit rates are well-balanced. Continue using lightweight models for search and reasoning models for complex refactoring.',
        projectedMonthlySavingsUsd: 0,
        impactLevel: 'low',
        category: 'session_length',
      });
    }

    return tips;
  }
}

