import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CharacterRecord,
  CreateCharacterInput,
  UpdateCharacterInput,
} from "./types";
import { nowIso, toSqliteBoolean } from "./utils";

export class CharactersRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateCharacterInput): Promise<CharacterRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<CharacterRecord>(
      `INSERT INTO characters (
        organization_id,
        game_id,
        name,
        slug,
        claimed_by_user_id,
        is_active,
        notes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.organizationId,
      input.gameId ?? null,
      input.name,
      input.slug ?? null,
      input.claimedByUserId ?? null,
      toSqliteBoolean(input.isActive ?? true),
      input.notes ?? null,
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create character");
    }

    return created;
  }

  async delete(id: number): Promise<void> {
    await this.db.run(`DELETE FROM characters WHERE id = ?`, id);
  }

  async findById(id: number): Promise<CharacterRecord | null> {
    return this.db.first<CharacterRecord>(
      `SELECT * FROM characters WHERE id = ?`,
      id,
    );
  }

  async listByOrganization(organizationId: number): Promise<CharacterRecord[]> {
    return this.db.all<CharacterRecord>(
      `SELECT * FROM characters
       WHERE organization_id = ?
       ORDER BY id ASC`,
      organizationId,
    );
  }

  async listByGame(gameId: number): Promise<CharacterRecord[]> {
    return this.db.all<CharacterRecord>(
      `SELECT * FROM characters
       WHERE game_id = ?
       ORDER BY id ASC`,
      gameId,
    );
  }

  async update(id: number, input: UpdateCharacterInput): Promise<CharacterRecord> {
    const existing = await this.findByIdOrThrow(id);

    const updated = await this.db.first<CharacterRecord>(
      `UPDATE characters
       SET game_id = ?, name = ?, slug = ?, claimed_by_user_id = ?, is_active = ?, notes = ?, updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.gameId === undefined ? existing.game_id : input.gameId,
      input.name ?? existing.name,
      input.slug === undefined ? existing.slug : input.slug,
      input.claimedByUserId === undefined
        ? existing.claimed_by_user_id
        : input.claimedByUserId,
      input.isActive === undefined
        ? existing.is_active
        : toSqliteBoolean(input.isActive),
      input.notes === undefined ? existing.notes : input.notes,
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update character ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(id: number): Promise<CharacterRecord> {
    const record = await this.findById(id);

    if (!record) {
      throw new Error(`Character ${id} not found`);
    }

    return record;
  }
}
