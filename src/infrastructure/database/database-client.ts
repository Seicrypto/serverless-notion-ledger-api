export interface RunResult {
  changes?: number;
  lastRowId?: number;
  success?: boolean;
}

export interface DatabaseClient {
  all<T>(sql: string, ...bindings: unknown[]): Promise<T[]>;
  first<T>(sql: string, ...bindings: unknown[]): Promise<T | null>;
  run(sql: string, ...bindings: unknown[]): Promise<RunResult>;
}
