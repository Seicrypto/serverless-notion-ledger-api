import type { DatabaseClient, RunResult } from "../database/database-client";

export class D1Client implements DatabaseClient {
  constructor(private readonly database: D1Database) {}

  prepare(sql: string): D1PreparedStatement {
    return this.database.prepare(sql);
  }

  async all<T>(sql: string, ...bindings: unknown[]): Promise<T[]> {
    const result = await this.database.prepare(sql).bind(...bindings).all<T>();
    return result.results ?? [];
  }

  async first<T>(sql: string, ...bindings: unknown[]): Promise<T | null> {
    const result = await this.database.prepare(sql).bind(...bindings).first<T>();
    return result ?? null;
  }

  async run(sql: string, ...bindings: unknown[]): Promise<RunResult> {
    const result = await this.database.prepare(sql).bind(...bindings).run();
    return {
      changes: result.meta.changes,
      lastRowId: Number(result.meta.last_row_id ?? 0),
      success: result.success,
    };
  }
}
