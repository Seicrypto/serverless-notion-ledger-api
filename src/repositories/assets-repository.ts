import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  AssetRecord,
  CreateAssetInput,
  UpdateAssetInput,
} from "./types";
import { nowIso } from "./utils";

export class AssetsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateAssetInput): Promise<AssetRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<AssetRecord>(
      `INSERT INTO assets (
        organization_id,
        game_id,
        asset_key,
        name,
        normalized_name,
        asset_type,
        rarity_label,
        icon_url,
        status,
        canonical_asset_id,
        created_by_user_id,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.organizationId ?? null,
      input.gameId,
      input.assetKey,
      input.name,
      input.normalizedName,
      input.assetType ?? "item",
      input.rarityLabel ?? null,
      input.iconUrl ?? null,
      input.status ?? "active",
      input.canonicalAssetId ?? null,
      input.createdByUserId ?? null,
      input.metadataJson ?? null,
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create asset");
    }

    return created;
  }

  async findById(id: number): Promise<AssetRecord | null> {
    return this.db.first<AssetRecord>(`SELECT * FROM assets WHERE id = ?`, id);
  }

  async listByGame(gameId: number): Promise<AssetRecord[]> {
    return this.db.all<AssetRecord>(
      `SELECT * FROM assets WHERE game_id = ? ORDER BY id ASC`,
      gameId,
    );
  }

  async update(id: number, input: UpdateAssetInput): Promise<AssetRecord> {
    const existing = await this.findByIdOrThrow(id);
    const updated = await this.db.first<AssetRecord>(
      `UPDATE assets
       SET organization_id = ?,
           game_id = ?,
           asset_key = ?,
           name = ?,
           normalized_name = ?,
           asset_type = ?,
           rarity_label = ?,
           icon_url = ?,
           status = ?,
           canonical_asset_id = ?,
           metadata_json = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.organizationId === undefined
        ? existing.organization_id
        : input.organizationId,
      input.gameId ?? existing.game_id,
      input.assetKey ?? existing.asset_key,
      input.name ?? existing.name,
      input.normalizedName ?? existing.normalized_name,
      input.assetType ?? existing.asset_type,
      input.rarityLabel === undefined ? existing.rarity_label : input.rarityLabel,
      input.iconUrl === undefined ? existing.icon_url : input.iconUrl,
      input.status ?? existing.status,
      input.canonicalAssetId === undefined
        ? existing.canonical_asset_id
        : input.canonicalAssetId,
      input.metadataJson === undefined ? existing.metadata_json : input.metadataJson,
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update asset ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(id: number): Promise<AssetRecord> {
    const record = await this.findById(id);
    if (!record) {
      throw new Error(`Asset ${id} not found`);
    }

    return record;
  }
}
