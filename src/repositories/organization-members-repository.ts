import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CreateOrganizationMemberInput,
  OrganizationMemberRecord,
  OrganizationMemberRole,
} from "./types";
import { nowIso } from "./utils";

export class OrganizationMembersRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(
    input: CreateOrganizationMemberInput,
  ): Promise<OrganizationMemberRecord> {
    const createdAt = nowIso();
    const joinedAt = input.joinedAt ?? createdAt;
    const created = await this.db.first<OrganizationMemberRecord>(
      `INSERT INTO organization_members (
        organization_id,
        user_id,
        role,
        joined_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?)
      RETURNING *`,
      input.organizationId,
      input.userId,
      input.role ?? "member",
      joinedAt,
      createdAt,
    );

    if (!created) {
      throw new Error("Failed to create organization member");
    }

    return created;
  }

  async delete(id: number): Promise<void> {
    await this.db.run(`DELETE FROM organization_members WHERE id = ?`, id);
  }

  async findById(id: number): Promise<OrganizationMemberRecord | null> {
    return this.db.first<OrganizationMemberRecord>(
      `SELECT * FROM organization_members WHERE id = ?`,
      id,
    );
  }

  async findByOrganizationAndUser(
    organizationId: number,
    userId: number,
  ): Promise<OrganizationMemberRecord | null> {
    return this.db.first<OrganizationMemberRecord>(
      `SELECT * FROM organization_members
       WHERE organization_id = ? AND user_id = ?`,
      organizationId,
      userId,
    );
  }

  async listByOrganization(
    organizationId: number,
  ): Promise<OrganizationMemberRecord[]> {
    return this.db.all<OrganizationMemberRecord>(
      `SELECT * FROM organization_members
       WHERE organization_id = ?
       ORDER BY id ASC`,
      organizationId,
    );
  }

  async updateRole(
    id: number,
    role: OrganizationMemberRole,
  ): Promise<OrganizationMemberRecord> {
    const updated = await this.db.first<OrganizationMemberRecord>(
      `UPDATE organization_members
       SET role = ?
       WHERE id = ?
       RETURNING *`,
      role,
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update organization member ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(id: number): Promise<OrganizationMemberRecord> {
    const record = await this.findById(id);

    if (!record) {
      throw new Error(`Organization member ${id} not found`);
    }

    return record;
  }
}
