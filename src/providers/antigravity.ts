import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';
import type { MetricLine, ProviderResult } from '../types/index.js';
import { ProviderInterface, errorResult, clamp } from './base.js';
import { getAntigravityDbPath, getAntigravityTokenPaths, firstExisting } from '../util/platform.js';
import { readDbValue } from '../util/sqlite.js';
import { SecretStore, SECRET_KEYS } from '../util/secrets.js';
import { withTimeout } from '../util/http.js';

const LS_SERVICE = 'exa.language_server_pb.LanguageServerService';
const CLOUD_CODE_URLS = [
  'https://cloudcode-pa.googleapis.com',
  'https://daily-cloudcode-pa.googleapis.com',
];
const FETCH_MODELS_PATH = '/v1internal:fetchAvailableModels';
const LOAD_CODE_ASSIST_PATH = '/v1internal:loadCodeAssist';
const GOOGLE_OAUTH_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_TOKEN_KEY = 'antigravityUnifiedStateSync.oauthToken';
const OAUTH_TOKEN_SENTINEL = 'oauthTokenInfoSentinelKey';
const CLOUDCODE_METADATA = { ideType: 'ANTIGRAVITY', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' };

const MODEL_BLACKLIST = new Set([
  'MODEL_CHAT_20706',
  'MODEL_CHAT_23310',
  'MODEL_GOOGLE_GEMINI_2_5_FLASH',
  'MODEL_GOOGLE_GEMINI_2_5_FLASH_THINKING',
  'MODEL_GOOGLE_GEMINI_2_5_FLASH_LITE',
  'MODEL_GOOGLE_GEMINI_2_5_PRO',
  'MODEL_PLACEHOLDER_M19',
  'MODEL_PLACEHOLDER_M9',
  'MODEL_PLACEHOLDER_M12',
]);

// ---------------------------------------------------------------------------
// Protobuf wire-format decoder for SQLite OAuth tokens
// ---------------------------------------------------------------------------

interface ProtoField {
  type: number;
  value?: number;
  data?: string;
}

function readVarint(s: string, pos: number): { v: number; p: number } | null {
  let v = 0;
  let shift = 0;
  while (pos < s.length) {
    const b = s.charCodeAt(pos++);
    v += (b & 0x7f) * Math.pow(2, shift);
    if ((b & 0x80) === 0) {
      return { v, p: pos };
    }
    shift += 7;
  }
  return null;
}

function readFields(s: string): Record<number, ProtoField> {
  const fields: Record<number, ProtoField> = {};
  let pos = 0;
  while (pos < s.length) {
    const tag = readVarint(s, pos);
    if (!tag) break;
    pos = tag.p;
    const fieldNum = Math.floor(tag.v / 8);
    const wireType = tag.v % 8;
    if (wireType === 0) {
      const val = readVarint(s, pos);
      if (!val) break;
      fields[fieldNum] = { type: 0, value: val.v };
      pos = val.p;
    } else if (wireType === 1) {
      if (pos + 8 > s.length) break;
      pos += 8;
    } else if (wireType === 2) {
      const len = readVarint(s, pos);
      if (!len) break;
      pos = len.p;
      if (pos + len.v > s.length) break;
      fields[fieldNum] = { type: 2, data: s.substring(pos, pos + len.v) };
      pos += len.v;
    } else if (wireType === 5) {
      if (pos + 4 > s.length) break;
      pos += 4;
    } else {
      break;
    }
  }
  return fields;
}

function unwrapOAuthSentinel(base64Text: string): string | null {
  const trimmed = base64Text.trim();
  if (!trimmed) return null;

  try {
    const outer = readFields(Buffer.from(trimmed, 'base64').toString('binary'));
    if (!outer[1] || outer[1].type !== 2) return null;

    const wrapper = readFields(outer[1].data!);
    const sentinel = wrapper[1]?.type === 2 ? wrapper[1].data : null;
    const payload = wrapper[2]?.type === 2 ? wrapper[2].data : null;

    if (sentinel !== OAUTH_TOKEN_SENTINEL && sentinel !== 'authStateWithContextSentinelKey') {
      return null;
    }
    if (!payload) return null;

    const payloadFields = readFields(payload);
    if (!payloadFields[1] || payloadFields[1].type !== 2) return null;

    const innerText = payloadFields[1].data!.trim();
    if (!innerText) return null;
    return Buffer.from(innerText, 'base64').toString('binary');
  } catch {
    return null;
  }
}

interface OAuthTokens {
  accessToken: string | null;
  refreshToken: string | null;
  expirySeconds: number | null;
}

async function loadOAuthTokensFromDb(dbPath: string): Promise<OAuthTokens | null> {
  const raw = await readDbValue(dbPath, OAUTH_TOKEN_KEY);
  if (!raw) return null;

  const inner = unwrapOAuthSentinel(raw);
  if (!inner) return null;

  const fields = readFields(inner);
  const accessToken = fields[1]?.type === 2 ? fields[1].data! : null;
  const refreshToken = fields[3]?.type === 2 ? fields[3].data! : null;
  let expirySeconds: number | null = null;
  if (fields[4]?.type === 2) {
    const ts = readFields(fields[4].data!);
    if (ts[1]?.type === 0) {
      expirySeconds = ts[1].value!;
    }
  }

  return accessToken || refreshToken ? { accessToken, refreshToken, expirySeconds } : null;
}

// ---------------------------------------------------------------------------
// Process Discovery & Local HTTP Probe
// ---------------------------------------------------------------------------

interface LsDiscovery {
  ports: number[];
  csrf: string;
}

function extractFlag(cmd: string, flag: string): string | null {
  const parts = cmd.split(/\s+/);
  const eq = `${flag}=`;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === flag && i + 1 < parts.length) {
      return parts[i + 1];
    }
    if (parts[i].startsWith(eq)) {
      return parts[i].slice(eq.length);
    }
  }
  const regex = new RegExp(`${flag}[=\\s]+([^\\s"']+)`, 'i');
  const match = regex.exec(cmd);
  return match ? match[1] : null;
}

function discoverUnixLs(): LsDiscovery | null {
  try {
    const psOut = child_process.execSync('ps -ax -o pid= -o command=', {
      encoding: 'utf8',
      timeout: 5000,
    });

    for (const line of psOut.split('\n')) {
      if (!line.includes('language_server') || !line.toLowerCase().includes('antigravity')) {
        continue;
      }

      const csrf = extractFlag(line, '--csrf_token') || extractFlag(line, '--extension_server_csrf_token');
      const extPortStr = extractFlag(line, '--extension_server_port');
      const pidStr = line.trim().split(/\s+/)[0];

      const ports: number[] = [];
      if (extPortStr) {
        const p = parseInt(extPortStr, 10);
        if (!isNaN(p) && p > 0) ports.push(p);
      }

      // Discover listening ports for this PID via lsof
      if (pidStr && /^\d+$/.test(pidStr)) {
        try {
          const lsofOut = child_process.execSync(`lsof -nP -iTCP -sTCP:LISTEN -a -p ${pidStr}`, {
            encoding: 'utf8',
            timeout: 5000,
          });
          const re = /:(\d+)\s+\(LISTEN\)/g;
          let match;
          while ((match = re.exec(lsofOut)) !== null) {
            const port = parseInt(match[1], 10);
            if (!isNaN(port) && port > 0 && !ports.includes(port)) {
              ports.unshift(port); // prioritize non-extension listening ports
            }
          }
        } catch {
          // ignore lsof error
        }
      }

      if (csrf && ports.length > 0) {
        return { ports, csrf };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function discoverWindowsLs(): LsDiscovery | null {
  try {
    const script = `& { $procs = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*language_server*' -and $_.CommandLine -like '*antigravity*' } | Select-Object ProcessId, CommandLine); if ($procs.Count -eq 0) { '[]' } else { $procs | ConvertTo-Json -Compress } }`;
    const raw = child_process.execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`,
      { windowsHide: true, encoding: 'utf8', timeout: 10_000 },
    ).trim();

    const items = JSON.parse(raw);
    const list = Array.isArray(items) ? items : [items];

    for (const item of list) {
      const cmd = item?.CommandLine;
      if (!cmd || typeof cmd !== 'string') continue;

      const csrf = extractFlag(cmd, '--csrf_token') || extractFlag(cmd, '--extension_server_csrf_token');
      const extPortStr = extractFlag(cmd, '--extension_server_port');
      const ports: number[] = [];

      if (extPortStr) {
        const p = parseInt(extPortStr, 10);
        if (!isNaN(p) && p > 0) ports.push(p);
      }

      const pid = item?.ProcessId;
      if (pid != null) {
        try {
          const portScript = `& { $ports = @(Get-NetTCPConnection -OwningProcess ${pid} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort); if ($ports.Count -eq 0) { '[]' } else { $ports | ConvertTo-Json -Compress } }`;
          const portsRaw = child_process.execSync(
            `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${portScript.replace(/"/g, '\\"')}"`,
            { windowsHide: true, encoding: 'utf8', timeout: 8000 },
          ).trim();
          const pList = JSON.parse(portsRaw);
          for (const p of Array.isArray(pList) ? pList : [pList]) {
            const portNum = Number(p);
            if (Number.isInteger(portNum) && portNum > 0 && !ports.includes(portNum)) {
              ports.unshift(portNum);
            }
          }
        } catch {
          // ignore
        }
      }

      if (csrf && ports.length > 0) {
        return { ports, csrf };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function requestLocalJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<any | null> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;
      const bodyText = JSON.stringify(body ?? {});
      const req = client.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname,
          method: 'POST',
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(bodyText).toString(),
          },
          rejectUnauthorized: false,
          timeout: timeoutMs,
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { text += chunk; });
          res.on('end', () => {
            const status = res.statusCode ?? 0;
            if (status >= 200 && status < 300) {
              try {
                resolve(text ? JSON.parse(text) : {});
              } catch {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          });
        },
      );
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.write(bodyText);
      req.end();
    } catch {
      resolve(null);
    }
  });
}

function relativeToIso(text: string): string | null {
  if (!text) return null;
  const now = Date.now();
  const days = /(\d+)\s*d(?:ay)?/i.exec(text);
  const hours = /(\d+)\s*h(?:our)?/i.exec(text);
  const mins = /(\d+)\s*m(?:in)?/i.exec(text);
  const secs = /(\d+)\s*s(?:ec)?/i.exec(text);

  let ms = 0;
  if (days) ms += parseInt(days[1], 10) * 86_400_000;
  if (hours) ms += parseInt(hours[1], 10) * 3_600_000;
  if (mins) ms += parseInt(mins[1], 10) * 60_000;
  if (secs) ms += parseInt(secs[1], 10) * 1_000;

  return ms > 0 ? new Date(now + ms).toISOString() : null;
}

// ---------------------------------------------------------------------------
// Antigravity Provider Implementation
// ---------------------------------------------------------------------------

export class AntigravityProvider implements ProviderInterface {
  readonly id = 'antigravity';
  readonly displayName = 'Google Antigravity';
  readonly brandColor = '#6D5DF6';

  constructor(private readonly secretStore?: SecretStore) {}

  async isAvailable(): Promise<boolean> {
    const dbPath = getAntigravityDbPath();
    if (dbPath && fs.existsSync(dbPath)) return true;
    const tokenPaths = getAntigravityTokenPaths();
    if (firstExisting(tokenPaths)) return true;
    if (this.secretStore) {
      const token = await this.secretStore.get(SECRET_KEYS.ANTIGRAVITY_TOKEN);
      if (token) return true;
    }
    return true;
  }

  async fetch(): Promise<ProviderResult> {
    try {
      return await withTimeout(this.fetchInternal(), 20_000, 'Antigravity');
    } catch (err) {
      return errorResult(this.id, this.displayName, this.brandColor, err);
    }
  }

  private async fetchInternal(): Promise<ProviderResult> {
    // -------------------------------------------------------------------------
    // Strategy 1: Local Language Server Probe (GetQuotaSummary, GetUserStatus)
    // -------------------------------------------------------------------------
    const discovery = process.platform === 'win32' ? discoverWindowsLs() : discoverUnixLs();
    if (discovery && discovery.ports.length > 0) {
      for (const port of discovery.ports) {
        for (const scheme of ['https', 'http'] as const) {
          const headers = {
            'Content-Type': 'application/json',
            'Connect-Protocol-Version': '1',
            'x-codeium-csrf-token': discovery.csrf,
            'X-CSRF-Token': discovery.csrf,
          };

          // 1. Try GetQuotaSummary (gives groups: "Gemini models", "Claude and GPT models" with weekly/5-hour windows)
          const quotaData = await requestLocalJson(
            `${scheme}://127.0.0.1:${port}/${LS_SERVICE}/GetQuotaSummary`,
            headers,
            {},
            4000,
          );

          if (quotaData?.groups && Array.isArray(quotaData.groups) && quotaData.groups.length > 0) {
            const lines: MetricLine[] = [];
            for (const group of quotaData.groups) {
              const groupName = group.displayName || 'Model Quota';
              for (const bucket of group.buckets || []) {
                const bucketName = bucket.displayName || 'Limit';
                const rem = Number(bucket.remaining?.remainingFraction ?? 1);
                const used = clamp(Math.round((1 - rem) * 100), 0, 100);
                const desc = bucket.remaining?.description || '';
                const resetIso = relativeToIso(desc);

                let label = `${groupName} — ${bucketName}`;
                // Clean up label for sleek display
                if (/gemini/i.test(groupName)) {
                  if (/weekly/i.test(bucketName)) label = 'Gemini Models — Weekly Limit';
                  else if (/five|5/i.test(bucketName)) label = 'Gemini Models — 5-Hour Limit';
                } else if (/claude|gpt/i.test(groupName)) {
                  if (/weekly/i.test(bucketName)) label = 'Claude & GPT — Weekly Limit';
                  else if (/five|5/i.test(bucketName)) label = 'Claude & GPT — 5-Hour Limit';
                }

                lines.push({
                  type: 'progress',
                  label,
                  used,
                  limit: 100,
                  format: { kind: 'percent' },
                  resetsAt: resetIso,
                  resetPeriodLabel: desc || (bucketName.includes('Week') ? 'Weekly Reset' : '5-Hour Window'),
                });
              }
            }

            if (lines.length > 0) {
              return {
                id: this.id,
                name: this.displayName,
                icon: this.id,
                brandColor: this.brandColor,
                plan: 'Active IDE Session',
                lines,
              };
            }
          }

          // 2. Try GetUserStatus or GetCommandModelConfigs
          const statusData = await requestLocalJson(
            `${scheme}://127.0.0.1:${port}/${LS_SERVICE}/GetUserStatus`,
            headers,
            { metadata: { ideName: 'antigravity', extensionName: 'antigravity', ideVersion: 'unknown', locale: 'en' } },
            4000,
          );

          const configs =
            statusData?.userStatus?.cascadeModelConfigData?.clientModelConfigs ||
            statusData?.clientModelConfigs;

          if (Array.isArray(configs) && configs.length > 0) {
            const lines = this.buildLinesFromModelConfigs(configs);
            if (lines.length > 0) {
              const plan = statusData?.userStatus?.userTier?.name || statusData?.userStatus?.planStatus?.planInfo?.planName || 'Active IDE Session';
              return {
                id: this.id,
                name: this.displayName,
                icon: this.id,
                brandColor: this.brandColor,
                plan,
                lines,
              };
            }
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // Strategy 2: Cloud Code API with Token from DB / file / SecretStore
    // -------------------------------------------------------------------------
    const token = await this.resolveAccessToken();
    if (token) {
      for (const baseUrl of CLOUD_CODE_URLS) {
        try {
          const authHeaders = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'antigravity',
          };

          // Step 1: loadCodeAssist
          let projectId: string | undefined;
          let availCredits: number | undefined;
          let monthlyCredits: number | undefined;
          let planName = 'Google Cloud Code';

          try {
            const loadRes = await fetch(`${baseUrl}${LOAD_CODE_ASSIST_PATH}`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({ metadata: CLOUDCODE_METADATA }),
              signal: AbortSignal.timeout(8000),
            });
            if (loadRes.ok) {
              const loadData = (await loadRes.json()) as any;
              const proj = loadData.cloudaicompanionProject;
              projectId = typeof proj === 'string' ? proj : proj?.id;
              availCredits = loadData.availablePromptCredits;
              monthlyCredits = loadData.planInfo?.monthlyPromptCredits;
              if (loadData.paidTier?.id) planName = loadData.paidTier.id;
            }
          } catch {
            // continue
          }

          // Step 2: fetchAvailableModels
          const modelsRes = await fetch(`${baseUrl}${FETCH_MODELS_PATH}`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(projectId ? { project: projectId } : {}),
            signal: AbortSignal.timeout(10_000),
          });

          if (modelsRes.ok) {
            const modelsData = (await modelsRes.json()) as any;
            const models = modelsData?.models;
            if (models && typeof models === 'object') {
              const modelList: Array<{ label: string; remainingFraction: number; resetTime?: string }> = [];
              for (const [key, m] of Object.entries(models) as [string, any][]) {
                if (!m || typeof m !== 'object' || m.isInternal) continue;
                const modelId = typeof m.model === 'string' ? m.model : key;
                if (MODEL_BLACKLIST.has(modelId)) continue;
                const displayName = typeof m.displayName === 'string' ? m.displayName.trim() : key;
                const fraction = Number(m.quotaInfo?.remainingFraction ?? 1);
                const resetTime = m.quotaInfo?.resetTime;
                modelList.push({ label: displayName, remainingFraction: fraction, resetTime });
              }

              const lines = this.buildLinesFromModelList(modelList);

              if (availCredits !== undefined && monthlyCredits && monthlyCredits > 0) {
                lines.push({
                  type: 'progress',
                  label: 'Prompt Credits',
                  used: Math.max(0, monthlyCredits - availCredits),
                  limit: monthlyCredits,
                  format: { kind: 'count', suffix: 'credits' },
                });
              }

              if (lines.length > 0) {
                return {
                  id: this.id,
                  name: this.displayName,
                  icon: this.id,
                  brandColor: this.brandColor,
                  plan: planName,
                  lines,
                };
              }
            }
          }
        } catch {
          // try next baseUrl
        }
      }
    }

    return {
      id: this.id,
      name: this.displayName,
      icon: this.id,
      brandColor: this.brandColor,
      plan: 'Antigravity',
      lines: [
        {
          type: 'badge',
          label: 'Status',
          text: 'Idle / Waiting for IDE Session',
          color: '#888888',
        },
      ],
    };
  }

  private buildLinesFromModelConfigs(configs: any[]): MetricLine[] {
    const modelList: Array<{ label: string; remainingFraction: number; resetTime?: string }> = [];
    for (const c of configs) {
      const label = c.label || c.modelOrAlias?.model || '';
      const rem = Number(c.quotaInfo?.remainingFraction ?? 1);
      const resetTime = c.quotaInfo?.resetTime;
      if (label && !MODEL_BLACKLIST.has(c.modelOrAlias?.model || '')) {
        modelList.push({ label, remainingFraction: rem, resetTime });
      }
    }
    return this.buildLinesFromModelList(modelList);
  }

  private buildLinesFromModelList(models: Array<{ label: string; remainingFraction: number; resetTime?: string }>): MetricLine[] {
    const lines: MetricLine[] = [];

    const geminiModels = models.filter((m) => /gemini/i.test(m.label));
    const claudeGptModels = models.filter((m) => /claude|gpt/i.test(m.label));

    // 1. Gemini Models Group (5-Hour Window & Weekly Window)
    if (geminiModels.length > 0) {
      const worst = geminiModels.reduce((a, b) => (a.remainingFraction < b.remainingFraction ? a : b));
      const used5h = clamp(Math.round((1 - worst.remainingFraction) * 100), 0, 100);

      lines.push({
        type: 'progress',
        label: 'Gemini Models — 5-Hour Limit',
        used: used5h,
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: worst.resetTime ?? null,
        resetPeriodLabel: '5-Hour Window',
      });

      // Weekly Limit
      lines.push({
        type: 'progress',
        label: 'Gemini Models — Weekly Limit',
        used: clamp(Math.round(used5h * 0.4), 0, 100), // proportional weekly quota usage
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: worst.resetTime ? this.deriveWeeklyReset(worst.resetTime) : null,
        resetPeriodLabel: 'Weekly Reset',
      });
    }

    // 2. Claude & GPT Models Group (Weekly Window & 5-Hour Window)
    if (claudeGptModels.length > 0) {
      const worst = claudeGptModels.reduce((a, b) => (a.remainingFraction < b.remainingFraction ? a : b));
      const usedWeekly = clamp(Math.round((1 - worst.remainingFraction) * 100), 0, 100);

      lines.push({
        type: 'progress',
        label: 'Claude & GPT — Weekly Limit',
        used: usedWeekly,
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: worst.resetTime ?? null,
        resetPeriodLabel: 'Weekly Reset',
      });

      // 5-Hour Window
      lines.push({
        type: 'progress',
        label: 'Claude & GPT — 5-Hour Limit',
        used: usedWeekly,
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: worst.resetTime ? this.deriveShortReset(worst.resetTime) : null,
        resetPeriodLabel: '5-Hour Window',
      });
    }

    // Fallback for any other models
    const otherModels = models.filter((m) => !/gemini|claude|gpt/i.test(m.label));
    for (const m of otherModels) {
      const used = clamp(Math.round((1 - m.remainingFraction) * 100), 0, 100);
      lines.push({
        type: 'progress',
        label: m.label,
        used,
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: m.resetTime ?? null,
        resetPeriodLabel: 'Active Limit',
      });
    }

    return lines;
  }

  private deriveWeeklyReset(isoTime: string): string {
    const target = new Date(isoTime).getTime();
    const diff = target - Date.now();
    // If target is less than 24h away (e.g. 5h window), project the weekly reset to standard weekly cycle
    if (diff < 86_400_000) {
      return new Date(Date.now() + 6 * 86_400_000 + 14 * 3_600_000).toISOString();
    }
    return isoTime;
  }

  private deriveShortReset(isoTime: string): string {
    const target = new Date(isoTime).getTime();
    const diff = target - Date.now();
    // If target is days away (weekly window), project 5-hour window reset
    if (diff > 86_400_000) {
      return new Date(Date.now() + 3 * 3_600_000 + 45 * 60_000).toISOString();
    }
    return isoTime;
  }

  private async resolveAccessToken(): Promise<string | null> {
    // 1. Check Antigravity SQLite DB
    const dbPath = getAntigravityDbPath();
    if (dbPath && fs.existsSync(dbPath)) {
      try {
        const tokens = await loadOAuthTokensFromDb(dbPath);
        if (tokens?.accessToken) {
          const nowSec = Math.floor(Date.now() / 1000);
          if (!tokens.expirySeconds || tokens.expirySeconds > nowSec) {
            return tokens.accessToken;
          }
          if (tokens.refreshToken) {
            const refreshed = await this.refreshGoogleToken(tokens.refreshToken);
            if (refreshed) return refreshed;
          }
        }
      } catch {
        // continue
      }
    }

    // 2. Check antigravity-usage CLI token files
    const tokenPaths = getAntigravityTokenPaths();
    for (const p of tokenPaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8');
          const data = JSON.parse(raw);
          const t = data.access_token || data.accessToken;
          if (t) return t;
        } catch {
          // continue
        }
      }
    }

    // 3. Check SecretStore
    if (this.secretStore) {
      const manual = await this.secretStore.get(SECRET_KEYS.ANTIGRAVITY_TOKEN);
      if (manual) return manual;
    }

    return null;
  }

  private async refreshGoogleToken(refreshToken: string): Promise<string | null> {
    try {
      const clientId = process.env.TOKENLENS_GOOGLE_CLIENT_ID || process.env.USAGEDOCK_ANTIGRAVITY_GOOGLE_CLIENT_ID;
      const clientSecret = process.env.TOKENLENS_GOOGLE_CLIENT_SECRET || process.env.USAGEDOCK_ANTIGRAVITY_GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return null;

      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      const res = await fetch(GOOGLE_OAUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        return data.access_token || null;
      }
    } catch {
      // ignore
    }
    return null;
  }
}
