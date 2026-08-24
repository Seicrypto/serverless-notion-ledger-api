import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CreateOrganizationMemberInput,
  OrganizationMemberRecord,
  OrganizationMemberRole,
  OrganizationMemberStatus,
} from "./types";
import { nowIso } from "./utils";

export class OrganizationMembersRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(
    input: CreateOrganizationMemberInput,
  ): Promise<OrganizationMemberRecord> {
    const createdAt = nowIso();
    const joinedAt = input.joinedAt ?? createdAt;
    const status = input.status ?? "active";
    const approvedAt =
      input.approvedAt === undefined
        ? status === "active"
          ? createdAt
          : null
        : input.approvedAt;
    const created = await this.db.first<OrganizationMemberRecord>(
      `INSERT INTO organization_members (
        organization_id,
        user_id,
        role,
        status,
        approved_at,
        joined_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.organizationId,
      input.userId,
      input.role ?? "member",
      status,
      approvedAt,
      joinedAt,
      createdAt,
    );

    if (!created) {
      throw new Error("Failed to create organization member");
    }

    return created;
  }

  async createOrReactivate(
    input: Omit<CreateOrganizationMemberInput, "status"> & {
      status?: "pending" | "active";
    },
  ): Promise<OrganizationMemberRecord> {
    const existing = await this.findByOrganizationAndUser(
      input.organizationId,
      input.userId,
    );

    if (!existing) {
      return this.create(input);
    }

    if (existing.status === "active" || existing.status === "pending") {
      throw new Error(
        `Organization member ${existing.id} already exists in active workflow`,
      );
    }

    return this.reactivate(existing.id, {
      role: input.role,
      status: input.status ?? "active",
    });
  }

  async delete(id: number): Promise<OrganizationMemberRecord> {
    return this.softRemove(id);
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
    status?: OrganizationMemberStatus,
  ): Promise<OrganizationMemberRecord[]> {
    if (status) {
      return this.db.all<OrganizationMemberRecord>(
        `SELECT * FROM organization_members
         WHERE organization_id = ? AND status = ?
         ORDER BY id ASC`,
        organizationId,
        status,
      );
    }

    return this.db.all<OrganizationMemberRecord>(
      `SELECT * FROM organization_members
       WHERE organization_id = ? AND status = 'active'
       ORDER BY id ASC`,
      organizationId,
    );
  }

  async listAllByOrganization(
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

  async updateStatus(
    id: number,
    status: OrganizationMemberStatus,
  ): Promise<OrganizationMemberRecord> {
    const timestamp = nowIso();
    const existing = await this.findByIdOrThrow(id);
    const approvedAt =
      status === "active"
        ? existing.approved_at ?? timestamp
        : status === "pending"
          ? null
          : existing.approved_at;
    const leftAt = status === "left" ? timestamp : status === "active" ? null : existing.left_at;
    const removedAt =
      status === "removed" ? timestamp : status === "active" ? null : existing.removed_at;
    const updated = await this.db.first<OrganizationMemberRecord>(
      `UPDATE organization_members
       SET status = ?, approved_at = ?, left_at = ?, removed_at = ?
       WHERE id = ?
       RETURNING *`,
      status,
      approvedAt,
      leftAt,
      removedAt,
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update organization member status ${id}`);
    }

    return updated;
  }

  async reactivate(
    id: number,
    input: {
      role?: OrganizationMemberRole;
      status?: Extract<OrganizationMemberStatus, "pending" | "active">;
    } = {},
  ): Promise<OrganizationMemberRecord> {
    const existing = await this.findByIdOrThrow(id);
    const timestamp = nowIso();
    const status = input.status ?? "active";
    const updated = await this.db.first<OrganizationMemberRecord>(
      `UPDATE organization_members
       SET role = ?,
           status = ?,
           approved_at = ?,
           joined_at = ?,
           left_at = NULL,
           removed_at = NULL
       WHERE id = ?
       RETURNING *`,
      input.role ?? existing.role,
      status,
      status === "active" ? timestamp : null,
      timestamp,
      id,
    );

    if (!updated) {
      throw new Error(`Failed to reactivate organization member ${id}`);
    }

    return updated;
  }

  async softLeave(id: number): Promise<OrganizationMemberRecord> {
    return this.updateStatus(id, "left");
  }

  async softRemove(id: number): Promise<OrganizationMemberRecord> {
    return this.updateStatus(id, "removed");
  }

  private async findByIdOrThrow(id: number): Promise<OrganizationMemberRecord> {
    const record = await this.findById(id);

    if (!record) {
      throw new Error(`Organization member ${id} not found`);
    }

    return record;
  }
}
