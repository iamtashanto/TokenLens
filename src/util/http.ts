import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * HTTP client using Node.js built-in https/http — no axios or node-fetch.
 * Pattern from smart-usage-bar's http.ts.
 */
export function httpRequest(url: string, options: HttpOptions = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
    };

    const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const req = lib.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        const statusCode = res.statusCode ?? 0;

        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`HTTP ${statusCode}: ${body.slice(0, 200)}`));
          return;
        }

        resolve({
          statusCode,
          body,
          headers: res.headers as Record<string, string | string[] | undefined>,
        });
      });
    });

    req.setTimeout(timeout, () => {
      req.destroy(new Error(`Request timed out after ${timeout}ms: ${url}`));
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * GET a URL and parse the response body as JSON.
 */
export async function httpGetJson<T>(url: string, options: HttpOptions = {}): Promise<T> {
  const res = await httpRequest(url, { method: 'GET', ...options });
  return JSON.parse(res.body) as T;
}

/**
 * POST JSON to a URL and parse the response as JSON.
 */
export async function httpPostJson<TReq, TRes>(
  url: string,
  body: TReq,
  options: HttpOptions = {},
): Promise<TRes> {
  const bodyStr = JSON.stringify(body);
  const res = await httpRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr).toString(),
      ...options.headers,
    },
    body: bodyStr,
    ...options,
  });
  return JSON.parse(res.body) as TRes;
}

/**
 * Wrap a promise with a timeout. Rejects with a timeout error if it takes too long.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms),
    ),
  ]);
}

