import type Database from 'better-sqlite3';

let BetterSqlite3: typeof import('better-sqlite3') | undefined;

/**
 * Lazily loads better-sqlite3. Returns null if unavailable.
 * Opens DB read-only and always closes in finally — usagedock pattern.
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
 * Read a single value from a VS Code-style key/value SQLite DB.
 * Schema: ItemTable (key TEXT, value TEXT)
 */
export async function readDbValue(dbPath: string, key: string): Promise<string | null> {
  const Db = await getDatabase();
  if (!Db) return null;

  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Db(dbPath, { readonly: true, fileMustExist: true });
    const row = db
      .prepare('SELECT value FROM ItemTable WHERE key = ? LIMIT 1')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch (err) {
    console.error(`[TokenLens] sqlite: readDbValue failed key="${key}" in ${dbPath}:`, err);
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Execute a custom SELECT query and return all rows.
 */
export async function queryDb<T = Record<string, unknown>>(
  dbPath: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const Db = await getDatabase();
  if (!Db) return [];

  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Db(dbPath, { readonly: true, fileMustExist: true });
    return db.prepare(sql).all(...params) as T[];
  } catch (err) {
    console.error(`[TokenLens] sqlite: queryDb failed in ${dbPath}:`, err);
    return [];
  } finally {
    db?.close();
  }
}

/** Check if SQLite support is available */
export async function isSqliteAvailable(): Promise<boolean> {
  return (await getDatabase()) !== null;
}
