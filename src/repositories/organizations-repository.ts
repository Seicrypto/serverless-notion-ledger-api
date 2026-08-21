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
        slug,
        description,
        icon_url,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.name,
      input.slug,
      input.description ?? null,
      input.iconUrl ?? null,
      input.createdByUserId,
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create organization");
    }

    return created;
  }

  async delete(id: number): Promise<void> {
    await this.db.run(`DELETE FROM organizations WHERE id = ?`, id);
  }

  async findById(id: number): Promise<OrganizationRecord | null> {
    return this.db.first<OrganizationRecord>(
      `SELECT * FROM organizations WHERE id = ?`,
      id,
    );
  }

  async findBySlug(slug: string): Promise<OrganizationRecord | null> {
    return this.db.first<OrganizationRecord>(
      `SELECT * FROM organizations WHERE slug = ?`,
      slug,
    );
  }

  async list(): Promise<OrganizationRecord[]> {
    return this.db.all<OrganizationRecord>(
      `SELECT * FROM organizations ORDER BY id ASC`,
    );
  }

  async update(
    id: number,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationRecord> {
    const existing = await this.findByIdOrThrow(id);

    const updated = await this.db.first<OrganizationRecord>(
      `UPDATE organizations
       SET name = ?, slug = ?, description = ?, icon_url = ?, updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.name ?? existing.name,
      input.slug ?? existing.slug,
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

  private async findByIdOrThrow(id: number): Promise<OrganizationRecord> {
    const record = await this.findById(id);

    if (!record) {
      throw new Error(`Organization ${id} not found`);
    }

    return record;
  }
}
