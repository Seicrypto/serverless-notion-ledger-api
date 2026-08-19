export class D1Client {
  constructor(private readonly database: D1Database) {}

  prepare(sql: string): D1PreparedStatement {
    return this.database.prepare(sql);
  }

  async first<T>(sql: string, ...bindings: unknown[]): Promise<T | null> {
    const result = await this.database.prepare(sql).bind(...bindings).first<T>();
    return result ?? null;
  }

  async run(sql: string, ...bindings: unknown[]): Promise<D1Result> {
    return this.database.prepare(sql).bind(...bindings).run();
  }
}
