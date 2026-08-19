export class KvJsonRepository {
  constructor(private readonly namespace: KVNamespace) {}

  async delete(key: string): Promise<void> {
    await this.namespace.delete(key);
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.namespace.delete(key)));
  }

  async get<T>(key: string): Promise<T | null> {
    return this.namespace.get<T>(key, "json");
  }

  async put<T>(key: string, value: T, expirationTtl: number): Promise<void> {
    await this.namespace.put(key, JSON.stringify(value), {
      expirationTtl,
    });
  }
}
