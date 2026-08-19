import { cacheKeys } from "../../lib/cache-keys";
import { TTL_SECONDS } from "../../lib/ttl";
import { KvJsonRepository } from "../../infrastructure/kv/kv-json-repository";

interface InvalidationOptions {
  ledgerQueryKeys?: readonly string[];
  userIds?: readonly string[];
}

export class SnapshotCacheService {
  constructor(private readonly repository: KvJsonRepository) {}

  async deleteMany(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    await this.repository.deleteMany(keys);
  }

  async get<T>(key: string): Promise<T | null> {
    return this.repository.get<T>(key);
  }

  async invalidateOrganizationSnapshots(
    organizationId: string,
    options: InvalidationOptions = {},
  ): Promise<void> {
    const keys = [
      cacheKeys.organizationProfile(organizationId),
      cacheKeys.organizationMembers(organizationId),
      cacheKeys.organizationDashboard(organizationId),
      ...(options.userIds ?? []).map((userId) =>
        cacheKeys.userDashboard(organizationId, userId),
      ),
      ...(options.ledgerQueryKeys ?? []),
    ];

    await this.deleteMany(keys);
  }

  async put<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.repository.put(key, value, ttlSeconds);
  }

  ttl = TTL_SECONDS;
}
