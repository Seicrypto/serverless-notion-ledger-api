import type { DatabaseClient } from "../infrastructure/database/database-client";
import type { CreateGameInput, GameRecord, UpdateGameInput } from "./types";
import { nowIso, toSqliteBoolean } from "./utils";

export class GamesRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateGameInput): Promise<GameRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<GameRecord>(
      `INSERT INTO games (
        name,
        slug,
        type,
        description,
        icon_url,
        official_site_url,
        metadata_source,
        source,
        source_id,
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.name,
      input.slug,
      input.type ?? "game",
      input.description ?? null,
      input.iconUrl ?? null,
      input.officialSiteUrl ?? null,
      input.metadataSource ?? "inherited",
      input.source ?? "internal",
      input.sourceId ?? null,
      toSqliteBoolean(input.isActive ?? true),
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create game");
    }

    return created;
  }

  async delete(id: number): Promise<void> {
    await this.db.run(`DELETE FROM games WHERE id = ?`, id);
  }

  async findById(id: number): Promise<GameRecord | null> {
    return this.db.first<GameRecord>(`SELECT * FROM games WHERE id = ?`, id);
  }

  async findBySlug(slug: string): Promise<GameRecord | null> {
    return this.db.first<GameRecord>(`SELECT * FROM games WHERE slug = ?`, slug);
  }

  async list(): Promise<GameRecord[]> {
    return this.db.all<GameRecord>(`SELECT * FROM games ORDER BY id ASC`);
  }

  async searchByName(
    name: string,
    options: {
      includeInactive?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<GameRecord[]> {
    const includeInactive = options.includeInactive ?? false;
    const limit = options.limit ?? 10;
    const offset = options.offset ?? 0;

    return this.db.all<GameRecord>(
      `SELECT *
       FROM games
       WHERE name LIKE ?
         ${includeInactive ? "" : "AND is_active = 1"}
       ORDER BY name ASC, id ASC
       LIMIT ?
       OFFSET ?`,
      `%${name}%`,
      limit,
      offset,
    );
  }

  async update(id: number, input: UpdateGameInput): Promise<GameRecord> {
    const existing = await this.findByIdOrThrow(id);

    const updated = await this.db.first<GameRecord>(
      `UPDATE games
       SET name = ?, slug = ?, type = ?, description = ?, icon_url = ?, official_site_url = ?, metadata_source = ?, source = ?, source_id = ?, is_active = ?, updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.name ?? existing.name,
      input.slug ?? existing.slug,
      input.type ?? existing.type,
      input.description === undefined ? existing.description : input.description,
      input.iconUrl === undefined ? existing.icon_url : input.iconUrl,
      input.officialSiteUrl === undefined
        ? existing.official_site_url
        : input.officialSiteUrl,
      input.metadataSource ?? existing.metadata_source,
      input.source ?? existing.source,
      input.sourceId === undefined ? existing.source_id : input.sourceId,
      input.isActive === undefined
        ? existing.is_active
        : toSqliteBoolean(input.isActive),
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update game ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(id: number): Promise<GameRecord> {
    const record = await this.findById(id);

    if (!record) {
      throw new Error(`Game ${id} not found`);
    }

    return record;
  }
}
