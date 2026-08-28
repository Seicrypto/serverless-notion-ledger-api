import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  AssetAliasRecord,
  CreateAssetAliasInput,
  UpdateAssetAliasInput,
} from "./types";
import { nowIso, toSqliteBoolean } from "./utils";

export class AssetAliasesRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateAssetAliasInput): Promise<AssetAliasRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<AssetAliasRecord>(
      `INSERT INTO asset_aliases (
        asset_id,
        alias,
        normalized_alias,
        locale,
        region_code,
        alias_type,
        is_primary,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.assetId,
      input.alias,
      input.normalizedAlias,
      input.locale ?? null,
      input.regionCode ?? null,
      input.aliasType ?? "community",
      toSqliteBoolean(input.isPrimary ?? false) ?? 0,
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create asset alias");
    }

    return created;
  }

  async findById(id: number): Promise<AssetAliasRecord | null> {
    return this.db.first<AssetAliasRecord>(
      `SELECT * FROM asset_aliases WHERE id = ?`,
      id,
    );
  }

  async listByAsset(assetId: number): Promise<AssetAliasRecord[]> {
    return this.db.all<AssetAliasRecord>(
      `SELECT * FROM asset_aliases
       WHERE asset_id = ?
       ORDER BY is_primary DESC, id ASC`,
      assetId,
    );
  }

  async listByNormalizedAlias(
    normalizedAlias: string,
    options: {
      limit?: number;
    } = {},
  ): Promise<AssetAliasRecord[]> {
    return this.db.all<AssetAliasRecord>(
      `SELECT * FROM asset_aliases
       WHERE normalized_alias = ?
       ORDER BY is_primary DESC, id ASC
       LIMIT ?`,
      normalizedAlias,
      options.limit ?? 20,
    );
  }

  async searchByNormalizedAliasPrefix(
    normalizedAlias: string,
    options: {
      limit?: number;
    } = {},
  ): Promise<AssetAliasRecord[]> {
    return this.db.all<AssetAliasRecord>(
      `SELECT * FROM asset_aliases
       WHERE normalized_alias LIKE ?
       ORDER BY is_primary DESC, id ASC
       LIMIT ?`,
      `${normalizedAlias}%`,
      options.limit ?? 20,
    );
  }

  async update(id: number, input: UpdateAssetAliasInput): Promise<AssetAliasRecord> {
    const existing = await this.findByIdOrThrow(id);
    const updated = await this.db.first<AssetAliasRecord>(
      `UPDATE asset_aliases
       SET alias = ?,
           normalized_alias = ?,
           locale = ?,
           region_code = ?,
           alias_type = ?,
           is_primary = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.alias ?? existing.alias,
      input.normalizedAlias ?? existing.normalized_alias,
      input.locale === undefined ? existing.locale : input.locale,
      input.regionCode === undefined ? existing.region_code : input.regionCode,
      input.aliasType ?? existing.alias_type,
      input.isPrimary === undefined
        ? existing.is_primary
        : toSqliteBoolean(input.isPrimary),
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update asset alias ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(id: number): Promise<AssetAliasRecord> {
    const record = await this.findById(id);
    if (!record) {
      throw new Error(`Asset alias ${id} not found`);
    }

    return record;
  }
}
