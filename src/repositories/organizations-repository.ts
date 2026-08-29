import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CreateOrganizationInput,
  OrganizationRecord,
  UpdateOrganizationInput,
} from "./types";
import { nowIso } from "./utils";

export class OrganizationsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateOrganizationInput): Promise<OrganizationRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<OrganizationRecord>(
      `INSERT INTO organizations (
        name,
        vanity,
        description,
        icon_url,
        created_by_user_id,
        deleted_at,
        deleted_by_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.name,
      input.vanity ?? null,
      input.description ?? null,
      input.iconUrl ?? null,
      input.createdByUserId,
      null,
      null,
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create organization");
    }

    return created;
  }

  async delete(
    id: number,
    options: {
      deletedByUserId?: number | null;
    } = {},
  ): Promise<OrganizationRecord> {
    const existing = await this.findByIdOrThrow(id, {
      includeDeleted: true,
    });

    if (existing.deleted_at) {
      return existing;
    }

    const deleted = await this.db.first<OrganizationRecord>(
      `UPDATE organizations
       SET deleted_at = ?,
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
      throw new Error(`Failed to soft delete organization ${id}`);
    }

    return deleted;
  }

  async findById(
    id: number,
    options: {
      includeDeleted?: boolean;
    } = {},
  ): Promise<OrganizationRecord | null> {
    if (options.includeDeleted) {
      return this.db.first<OrganizationRecord>(
        `SELECT * FROM organizations WHERE id = ?`,
        id,
      );
    }

    return this.db.first<OrganizationRecord>(
      `SELECT * FROM organizations
       WHERE id = ?
         AND deleted_at IS NULL`,
      id,
    );
  }

  async findByVanity(
    vanity: string,
    options: {
      includeDeleted?: boolean;
    } = {},
  ): Promise<OrganizationRecord | null> {
    if (options.includeDeleted) {
      return this.db.first<OrganizationRecord>(
        `SELECT * FROM organizations WHERE vanity = ?`,
        vanity,
      );
    }

    return this.db.first<OrganizationRecord>(
      `SELECT * FROM organizations
       WHERE vanity = ?
         AND deleted_at IS NULL`,
      vanity,
    );
  }

  async list(
    options: {
      includeDeleted?: boolean;
    } = {},
  ): Promise<OrganizationRecord[]> {
    if (options.includeDeleted) {
      return this.db.all<OrganizationRecord>(
        `SELECT * FROM organizations ORDER BY id ASC`,
      );
    }

    return this.db.all<OrganizationRecord>(
      `SELECT * FROM organizations
       WHERE deleted_at IS NULL
       ORDER BY id ASC`,
    );
  }

  async update(
    id: number,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationRecord> {
    const existing = await this.findByIdOrThrow(id);

    const updated = await this.db.first<OrganizationRecord>(
      `UPDATE organizations
       SET name = ?, vanity = ?, description = ?, icon_url = ?, updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.name ?? existing.name,
      input.vanity === undefined ? existing.vanity : input.vanity,
      input.description === undefined
        ? existing.description
        : input.description,
      input.iconUrl === undefined ? existing.icon_url : input.iconUrl,
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update organization ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(
    id: number,
    options: {
      includeDeleted?: boolean;
    } = {},
  ): Promise<OrganizationRecord> {
    const record = await this.findById(id, options);

    if (!record) {
      throw new Error(`Organization ${id} not found`);
    }

    return record;
  }
}
