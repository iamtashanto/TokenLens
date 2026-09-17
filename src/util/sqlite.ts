import * as child_process from 'child_process';
import * as fs from 'fs';
import type Database from 'better-sqlite3';

let BetterSqlite3: typeof import('better-sqlite3') | undefined;

/**
 * Lazily loads better-sqlite3. Returns null if unavailable.
 */
async function getDatabase(): Promise<typeof import('better-sqlite3') | null> {
  if (BetterSqlite3) return BetterSqlite3;
  try {
    BetterSqlite3 = (await import('better-sqlite3')).default;
    return BetterSqlite3;
  } catch {
    return null;
  }
}

/**
 * Fallback CLI execution using system sqlite3 binary.
 */
function execSqliteCli(dbPath: string, sql: string, jsonMode = false): string | null {
  if (!fs.existsSync(dbPath)) return null;
  const sqliteBins = ['/usr/bin/sqlite3', '/usr/local/bin/sqlite3', '/opt/homebrew/bin/sqlite3', 'sqlite3'];
  const args = jsonMode ? ['-json', dbPath, sql] : [dbPath, sql];

  for (const bin of sqliteBins) {
    try {
      const out = child_process.execFileSync(bin, args, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return out;
    } catch {
      // try next candidate binary
    }
  }
  return null;
}

/**
 * Read a single value from a VS Code-style key/value SQLite DB.
 * Schema: ItemTable (key TEXT, value TEXT)
 */
export async function readDbValue(dbPath: string, key: string): Promise<string | null> {
  // Strategy 1: Try better-sqlite3 native addon
  try {
    const Db = await getDatabase();
    if (Db) {
      let db: InstanceType<typeof Database> | null = null;
      try {
        db = new Db(dbPath, { readonly: true, fileMustExist: true });
        const row = db
          .prepare('SELECT value FROM ItemTable WHERE key = ? LIMIT 1')
          .get(key) as { value: string } | undefined;
        if (row && typeof row.value === 'string') {
          return row.value;
        }
      } finally {
        db?.close();
      }
    }
  } catch {
    // fallback to CLI
  }

  // Strategy 2: CLI fallback
  try {
    const escapedKey = key.replace(/'/g, "''");
    const out = execSqliteCli(dbPath, `SELECT value FROM ItemTable WHERE key = '${escapedKey}' LIMIT 1;`);
    if (out !== null && out !== undefined) {
      return out.replace(/\r?\n$/, '');
    }
  } catch (err) {
    console.error(`[TokenLens] sqlite: readDbValue failed key="${key}" in ${dbPath}:`, err);
  }

  return null;
}

/**
 * Execute a custom SELECT query and return all rows.
 */
export async function queryDb<T = Record<string, unknown>>(
  dbPath: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  // Strategy 1: better-sqlite3
  try {
    const Db = await getDatabase();
    if (Db) {
      let db: InstanceType<typeof Database> | null = null;
      try {
        db = new Db(dbPath, { readonly: true, fileMustExist: true });
        return db.prepare(sql).all(...params) as T[];
      } finally {
        db?.close();
      }
    }
  } catch {
    // fallback
  }

  // Strategy 2: CLI fallback
  try {
    let formattedSql = sql;
    // Replace ? placeholders with params if any
    for (const param of params) {
      const formatted = typeof param === 'string' ? `'${param.replace(/'/g, "''")}'` : String(param);
      formattedSql = formattedSql.replace('?', formatted);
    }
    const out = execSqliteCli(dbPath, formattedSql, true);
    if (out) {
      return JSON.parse(out) as T[];
    }
  } catch (err) {
    console.error(`[TokenLens] sqlite: queryDb failed in ${dbPath}:`, err);
  }

  return [];
}

/** Check if SQLite support is available */
export async function isSqliteAvailable(): Promise<boolean> {
  if ((await getDatabase()) !== null) return true;
  const sqliteBins = ['/usr/bin/sqlite3', '/usr/local/bin/sqlite3', '/opt/homebrew/bin/sqlite3', 'sqlite3'];
  for (const bin of sqliteBins) {
    try {
      child_process.execFileSync(bin, ['-version'], { stdio: 'ignore', timeout: 2000 });
      return true;
    } catch {
      // ignore
    }
  }
  return false;
}
