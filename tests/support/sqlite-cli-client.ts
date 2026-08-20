import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DatabaseClient, RunResult } from "../../src/infrastructure/database/database-client";

const execFileAsync = promisify(execFile);

export class SqliteCliClient implements DatabaseClient {
  constructor(private readonly databasePath: string) {}

  async all<T>(sql: string, ...bindings: unknown[]): Promise<T[]> {
    const formattedSql = interpolateSql(sql, bindings);
    const { stdout } = await execFileAsync("sqlite3", [
      "-json",
      this.databasePath,
      `PRAGMA foreign_keys=ON; ${formattedSql};`,
    ]);

    const trimmed = stdout.trim();
    return trimmed ? (JSON.parse(trimmed) as T[]) : [];
  }

  async first<T>(sql: string, ...bindings: unknown[]): Promise<T | null> {
    const rows = await this.all<T>(sql, ...bindings);
    return rows[0] ?? null;
  }

  async run(sql: string, ...bindings: unknown[]): Promise<RunResult> {
    const formattedSql = interpolateSql(sql, bindings);
    await execFileAsync("sqlite3", [
      this.databasePath,
      `PRAGMA foreign_keys=ON; ${formattedSql};`,
    ]);

    const row = await this.first<{ changes: number; lastRowId: number }>(
      `SELECT changes() as changes, last_insert_rowid() as lastRowId`,
    );

    return {
      changes: row?.changes ?? 0,
      lastRowId: row?.lastRowId ?? 0,
      success: true,
    };
  }
}

function escapeSqliteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function formatBinding(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return escapeSqliteString(String(value));
}

function interpolateSql(sql: string, bindings: unknown[]): string {
  let index = 0;

  return sql.replace(/\?/g, () => {
    const binding = bindings[index];
    index += 1;
    return formatBinding(binding);
  });
}
