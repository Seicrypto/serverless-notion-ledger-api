import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CreateOfficialStaffInput,
  OfficialStaffRecord,
  OfficialStaffRole,
} from "./types";
import { nowIso } from "./utils";

export class OfficialStaffsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateOfficialStaffInput): Promise<OfficialStaffRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<OfficialStaffRecord>(
      `INSERT INTO official_staffs (
        user_id,
        role,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?)
      RETURNING *`,
      input.userId,
      input.role ?? "staff",
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create official staff");
    }

    return created;
  }

  async findByUserId(userId: number): Promise<OfficialStaffRecord | null> {
    return this.db.first<OfficialStaffRecord>(
      `SELECT * FROM official_staffs WHERE user_id = ?`,
      userId,
    );
  }

  async listByRole(role: OfficialStaffRole): Promise<OfficialStaffRecord[]> {
    return this.db.all<OfficialStaffRecord>(
      `SELECT * FROM official_staffs WHERE role = ? ORDER BY id ASC`,
      role,
    );
  }
}
