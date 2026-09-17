import type { ProviderResult } from '../types/index.js';

/**
 * Contract every provider must implement.
 * Pattern from smart-usage-bar, adapted for usagedock's ProviderResult shape.
 */
export interface ProviderInterface {
  readonly id: string;
  readonly displayName: string;
  readonly brandColor: string;

  /** Check if this provider is potentially available (credentials/binaries exist). */
  isAvailable(): Promise<boolean>;

  /** Fetch current usage data. Always returns a ProviderResult (error is in result.error). */
  fetch(): Promise<ProviderResult>;
}

/** Helper: create an error result for a provider */
export function errorResult(
  id: string,
  displayName: string,
  brandColor: string,
  error: unknown,
): ProviderResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id,
    name: displayName,
    icon: id,
    brandColor,
    lines: [],
    error: message,
  };
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Convert cents to dollars */
export function centsToD(cents: number): number {
  return cents / 100;
}

/** Convert millisecond Unix timestamp to ISO string */
export function msToIso(ms: number | string | undefined): string | null {
  if (ms === undefined || ms === null) return null;
  const n = typeof ms === 'string' ? parseInt(ms, 10) : ms;
  if (!isFinite(n) || n <= 0) return null;
  // Handle both seconds and milliseconds
  const ts = n < 1e12 ? n * 1000 : n;
  return new Date(ts).toISOString();
}

/** Parse a value to a finite number or undefined */
export function toFiniteNumber(value: unknown): number | undefined {
  const n = Number(value);
  return isFinite(n) ? n : undefined;
}
