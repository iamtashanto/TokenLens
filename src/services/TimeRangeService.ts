import type { TimeRange, TimeRangeKind } from '../types/index.js';

export class TimeRangeService {
  private toIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  getCurrentMonthKey(): string {
    return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  }

  resolve(kind: TimeRangeKind, customStart?: string, customEnd?: string): TimeRange {
    const now = new Date();
    let startDate = this.toIsoDate(now);
    let endDate = this.toIsoDate(now);

    switch (kind) {
      case 'today':
        startDate = this.toIsoDate(now);
        endDate = this.toIsoDate(now);
        break;

      case 'yesterday': {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        startDate = this.toIsoDate(y);
        endDate = this.toIsoDate(y);
        break;
      }

      case 'thisWeek': {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
        const monday = new Date(now);
        monday.setDate(diff);
        startDate = this.toIsoDate(monday);
        endDate = this.toIsoDate(now);
        break;
      }

      case 'lastWeek': {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7;
        const lastMon = new Date(now);
        lastMon.setDate(diff);
        const lastSun = new Date(lastMon);
        lastSun.setDate(lastMon.getDate() + 6);
        startDate = this.toIsoDate(lastMon);
        endDate = this.toIsoDate(lastSun);
        break;
      }

      case 'thisMonth': {
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate = this.toIsoDate(first);
        endDate = this.toIsoDate(now);
        break;
      }

      case 'lastMonth': {
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const last = new Date(now.getFullYear(), now.getMonth(), 0);
        startDate = this.toIsoDate(first);
        endDate = this.toIsoDate(last);
        break;
      }

      case 'custom':
        if (customStart) startDate = customStart;
        if (customEnd) endDate = customEnd;
        break;
    }

    return {
      kind,
      startDate,
      endDate,
      start: `${startDate}T00:00:00.000Z`,
      end: `${endDate}T23:59:59.999Z`,
    };
  }
}
