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
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.name,
      input.slug,
      input.type ?? "game",
      input.description ?? null,
      input.iconUrl ?? null,
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

  async update(id: number, input: UpdateGameInput): Promise<GameRecord> {
    const existing = await this.findByIdOrThrow(id);

    const updated = await this.db.first<GameRecord>(
      `UPDATE games
       SET name = ?, slug = ?, type = ?, description = ?, icon_url = ?, is_active = ?, updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.name ?? existing.name,
      input.slug ?? existing.slug,
      input.type ?? existing.type,
      input.description === undefined ? existing.description : input.description,
      input.iconUrl === undefined ? existing.icon_url : input.iconUrl,
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
