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
        vanity,
        claimed_by_user_id,
        is_active,
        notes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.organizationId,
      input.gameId ?? null,
      input.name,
      input.slug ?? null,
      input.vanity ?? null,
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

  async delete(
    id: number,
    options: {
      deletedByUserId?: number | null;
    } = {},
  ): Promise<CharacterRecord> {
    const existing = await this.findByIdOrThrow(id);

    if (existing.deleted_at) {
      return existing;
    }

    const deleted = await this.db.first<CharacterRecord>(
      `UPDATE characters
       SET claimed_by_user_id = NULL,
           is_active = 0,
           deleted_at = ?,
           deleted_by_user_id = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING *`,
      nowIso(),
      options.deletedByUserId ?? null,
      nowIso(),
      id,
    );

    if (!deleted) {
      throw new Error(`Failed to soft delete character ${id}`);
    }

    return deleted;
  }

  async findById(
    id: number,
    options: {
      includeDeleted?: boolean;
    } = {},
  ): Promise<CharacterRecord | null> {
    if (options.includeDeleted) {
      return this.db.first<CharacterRecord>(
        `SELECT * FROM characters WHERE id = ?`,
        id,
      );
    }

    return this.db.first<CharacterRecord>(
      `SELECT * FROM characters
       WHERE id = ? AND deleted_at IS NULL`,
      id,
    );
  }

  async findByVanity(vanity: string): Promise<CharacterRecord | null> {
    return this.db.first<CharacterRecord>(
      `SELECT * FROM characters
       WHERE vanity = ? AND deleted_at IS NULL`,
      vanity,
    );
  }

  async listByOrganization(
    organizationId: number,
    options: {
      includeDeleted?: boolean;
    } = {},
  ): Promise<CharacterRecord[]> {
    if (options.includeDeleted) {
      return this.db.all<CharacterRecord>(
        `SELECT * FROM characters
         WHERE organization_id = ?
         ORDER BY id ASC`,
        organizationId,
      );
    }

    return this.db.all<CharacterRecord>(
      `SELECT * FROM characters
       WHERE organization_id = ? AND deleted_at IS NULL
       ORDER BY id ASC`,
      organizationId,
    );
  }

  async listByGame(
    gameId: number,
    options: {
      includeDeleted?: boolean;
    } = {},
  ): Promise<CharacterRecord[]> {
    if (options.includeDeleted) {
      return this.db.all<CharacterRecord>(
        `SELECT * FROM characters
         WHERE game_id = ?
         ORDER BY id ASC`,
        gameId,
      );
    }

    return this.db.all<CharacterRecord>(
      `SELECT * FROM characters
       WHERE game_id = ? AND deleted_at IS NULL
       ORDER BY id ASC`,
      gameId,
    );
  }

  async listByOrganizationAndUser(
    organizationId: number,
    userId: number,
  ): Promise<CharacterRecord[]> {
    return this.db.all<CharacterRecord>(
      `SELECT * FROM characters
       WHERE organization_id = ?
         AND claimed_by_user_id = ?
         AND deleted_at IS NULL
       ORDER BY id ASC`,
      organizationId,
      userId,
    );
  }

  async restore(id: number): Promise<CharacterRecord> {
    const existing = await this.findByIdOrThrow(id, {
      includeDeleted: true,
    });

    const restored = await this.db.first<CharacterRecord>(
      `UPDATE characters
       SET is_active = 1,
           deleted_at = NULL,
           deleted_by_user_id = NULL,
           updated_at = ?
       WHERE id = ?
       RETURNING *`,
      nowIso(),
      id,
    );

    if (!restored) {
      throw new Error(`Failed to restore character ${id}`);
    }

    return restored;
  }

  async update(id: number, input: UpdateCharacterInput): Promise<CharacterRecord> {
    const existing = await this.findByIdOrThrow(id);

    const updated = await this.db.first<CharacterRecord>(
      `UPDATE characters
       SET game_id = ?, name = ?, slug = ?, vanity = ?, claimed_by_user_id = ?, is_active = ?, notes = ?, updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.gameId === undefined ? existing.game_id : input.gameId,
      input.name ?? existing.name,
      input.slug === undefined ? existing.slug : input.slug,
      input.vanity === undefined ? existing.vanity : input.vanity,
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

  private async findByIdOrThrow(
    id: number,
    options: {
      includeDeleted?: boolean;
    } = {},
  ): Promise<CharacterRecord> {
    const record = await this.findById(id, options);

    if (!record) {
      throw new Error(`Character ${id} not found`);
    }

    return record;
  }
}
