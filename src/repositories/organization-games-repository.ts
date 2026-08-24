import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CreateOrganizationGameInput,
  OrganizationGameRecord,
  UpdateOrganizationGameInput,
} from "./types";
import { nowIso, toSqliteBoolean } from "./utils";

export class OrganizationGamesRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(
    input: CreateOrganizationGameInput,
  ): Promise<OrganizationGameRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<OrganizationGameRecord>(
      `INSERT INTO organization_games (
        organization_id,
        game_id,
        display_name,
        is_primary,
        sort_order,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.organizationId,
      input.gameId,
      input.displayName ?? null,
      toSqliteBoolean(input.isPrimary ?? false),
      input.sortOrder ?? 0,
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create organization game");
    }

    return created;
  }

  async delete(id: number): Promise<void> {
    await this.db.run(`DELETE FROM organization_games WHERE id = ?`, id);
  }

  async findById(id: number): Promise<OrganizationGameRecord | null> {
    return this.db.first<OrganizationGameRecord>(
      `SELECT * FROM organization_games WHERE id = ?`,
      id,
    );
  }

  async findByOrganizationAndGame(
    organizationId: number,
    gameId: number,
  ): Promise<OrganizationGameRecord | null> {
    return this.db.first<OrganizationGameRecord>(
      `SELECT * FROM organization_games
       WHERE organization_id = ? AND game_id = ?`,
      organizationId,
      gameId,
    );
  }

  async listByOrganization(
    organizationId: number,
  ): Promise<OrganizationGameRecord[]> {
    return this.db.all<OrganizationGameRecord>(
      `SELECT * FROM organization_games
       WHERE organization_id = ?
       ORDER BY sort_order ASC, id ASC`,
      organizationId,
    );
  }

  async listByGame(gameId: number): Promise<OrganizationGameRecord[]> {
    return this.db.all<OrganizationGameRecord>(
      `SELECT * FROM organization_games
       WHERE game_id = ?
       ORDER BY sort_order ASC, id ASC`,
      gameId,
    );
  }

  async update(
    id: number,
    input: UpdateOrganizationGameInput,
  ): Promise<OrganizationGameRecord> {
    const existing = await this.findByIdOrThrow(id);

    const updated = await this.db.first<OrganizationGameRecord>(
      `UPDATE organization_games
       SET display_name = ?, is_primary = ?, sort_order = ?, updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.displayName === undefined
        ? existing.display_name
        : input.displayName,
      input.isPrimary === undefined
        ? existing.is_primary
        : toSqliteBoolean(input.isPrimary),
      input.sortOrder ?? existing.sort_order,
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update organization game ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(id: number): Promise<OrganizationGameRecord> {
    const record = await this.findById(id);

    if (!record) {
      throw new Error(`Organization game ${id} not found`);
    }

    return record;
  }
}
