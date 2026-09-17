import * as fs from 'fs';
import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult, centsToD, msToIso, clamp } from './base.js';
import { getCursorDbPath } from '../util/platform.js';
import { readDbValue } from '../util/sqlite.js';
import { httpPostJson, withTimeout } from '../util/http.js';

const BASE_URL = 'https://api2.cursor.sh';
const CLIENT_ID = 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB';

interface PlanUsage {
  limit?: number;
  totalSpend?: number;
  remaining?: number;
  totalPercentUsed?: number;
  autoPercentUsed?: number;
  apiPercentUsed?: number;
}

interface SpendLimitUsage {
  individualLimit?: number;
  individualRemaining?: number;
  pooledLimit?: number;
  pooledRemaining?: number;
}

interface CurrentPeriodUsageResponse {
  planUsage?: PlanUsage;
  spendLimitUsage?: SpendLimitUsage;
  billingCycleEnd?: number | string;
}

interface PlanInfoResponse {
  planType?: string;
  isPro?: boolean;
  isBusiness?: boolean;
}

export class CursorProvider implements ProviderInterface {
  readonly id = 'cursor';
  readonly displayName = 'Cursor';
  readonly brandColor = '#000000';

  async isAvailable(): Promise<boolean> {
    const dbPath = getCursorDbPath();
    return dbPath !== null && fs.existsSync(dbPath);
  }

  private async refreshToken(refreshToken: string): Promise<string> {
    const res = await httpPostJson<{
      grant_type: string;
      client_id: string;
      refresh_token: string;
    }, { access_token?: string }>(`${BASE_URL}/oauth/token`, {
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    });
    if (!res.access_token) {
      throw new Error('No access token in Cursor refresh response');
    }
    return res.access_token;
  }

  async fetch(): Promise<ProviderResult> {
    try {
      return await withTimeout(this.fetchInternal(), 20_000, 'Cursor');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    const dbPath = getCursorDbPath();
    if (!dbPath || !fs.existsSync(dbPath)) {
      throw new Error('Cursor SQLite database not found.');
    }

    let accessToken = await readDbValue(dbPath, 'cursorAuth/accessToken');
    if (!accessToken) {
      const refreshToken = await readDbValue(dbPath, 'cursorAuth/refreshToken');
      if (refreshToken) {
        accessToken = await this.refreshToken(refreshToken);
      }
    }

    if (!accessToken) {
      throw new Error('No Cursor credentials found. Sign into Cursor first.');
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Connect-Protocol-Version': '1',
      'Content-Type': 'application/json',
    };

    const [usage, planInfo] = await Promise.all([
      httpPostJson<{}, CurrentPeriodUsageResponse>(
        `${BASE_URL}/aiserver.v1.DashboardService/GetCurrentPeriodUsage`,
        {},
        { headers },
      ),
      httpPostJson<{}, PlanInfoResponse>(
        `${BASE_URL}/aiserver.v1.DashboardService/GetPlanInfo`,
        {},
        { headers },
      ).catch(() => ({})),
    ]);

    const lines: MetricLine[] = [];
    const pu = usage.planUsage;
    const resetsAt = msToIso(usage.billingCycleEnd);

    if (pu) {
      const limit = Number(pu.limit ?? 0);
      if (limit > 0) {
        // Dollar-based plan
        const totalSpend = pu.totalSpend ?? (limit - (pu.remaining ?? 0));
        lines.push({
          type: 'progress',
          label: 'Plan Usage',
          used: centsToD(totalSpend),
          limit: centsToD(limit),
          format: { kind: 'dollars' },
          resetsAt,
        });
      } else {
        // Percentage-based plan
        if (pu.totalPercentUsed != null) {
          lines.push({
            type: 'progress',
            label: 'Included Usage',
            used: clamp(Number(pu.totalPercentUsed), 0, 100),
            limit: 100,
            format: { kind: 'percent' },
            resetsAt,
          });
        }
        if (pu.autoPercentUsed != null && Number(pu.autoPercentUsed) > 0) {
          lines.push({
            type: 'progress',
            label: 'Auto',
            used: clamp(Number(pu.autoPercentUsed), 0, 100),
            limit: 100,
            format: { kind: 'percent' },
            resetsAt,
          });
        }
      }
    }

    // On-demand spending
    const su = usage.spendLimitUsage;
    if (su) {
      const limit = Number(su.individualLimit ?? su.pooledLimit ?? 0);
      const remaining = Number(su.individualRemaining ?? su.pooledRemaining ?? 0);
      if (limit > 0) {
        lines.push({
          type: 'progress',
          label: 'On-Demand',
          used: centsToD(limit - remaining),
          limit: centsToD(limit),
          format: { kind: 'dollars' },
          resetsAt: null,
        });
      }
    }

    if (lines.length === 0) {
      lines.push({
        type: 'badge',
        label: 'Status',
        text: 'Connected',
        color: '#22c55e',
      });
    }

    const planLabel = planInfo.planType ?? (planInfo.isPro ? 'Pro' : planInfo.isBusiness ? 'Business' : 'Cursor');

    return {
      id: this.id,
      name: this.displayName,
      icon: this.id,
      brandColor: this.brandColor,
      plan: planLabel,
      lines,
    };
  }
}
