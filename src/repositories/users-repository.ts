import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CreateUserInput,
  UpdateUserInput,
  UserRecord,
  UserStatus,
} from "./types";
import { nowIso } from "./utils";

export interface ListUsersByStatusInput {
  displayName?: string;
  email?: string;
  limit: number;
  offset: number;
  status: UserStatus;
}

export class UsersRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateUserInput): Promise<UserRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<UserRecord>(
      `INSERT INTO users (
        email,
        password_hash,
        display_name,
        email_verified_at,
        vanity,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.email,
      input.passwordHash,
      input.displayName ?? null,
      input.emailVerifiedAt ?? null,
      input.vanity ?? null,
      input.status ?? "pending_verification",
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create user");
    }

    return created;
  }

  async delete(id: number): Promise<void> {
    await this.db.run(`DELETE FROM users WHERE id = ?`, id);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.db.first<UserRecord>(`SELECT * FROM users WHERE email = ?`, email);
  }

  async findByVanity(vanity: string): Promise<UserRecord | null> {
    return this.db.first<UserRecord>(
      `SELECT * FROM users WHERE vanity = ?`,
      vanity,
    );
  }

  async findById(id: number): Promise<UserRecord | null> {
    return this.db.first<UserRecord>(`SELECT * FROM users WHERE id = ?`, id);
  }

  async list(): Promise<UserRecord[]> {
    return this.db.all<UserRecord>(`SELECT * FROM users ORDER BY id ASC`);
  }

  async listByStatus(input: ListUsersByStatusInput): Promise<UserRecord[]> {
    const bindings: Array<number | string> = [input.status];
    const whereClauses = [`status = ?`];

    if (input.email) {
      whereClauses.push(`email = ?`);
      bindings.push(input.email);
    }

    if (input.displayName) {
      whereClauses.push(`display_name LIKE ?`);
      bindings.push(`%${input.displayName}%`);
    }

    bindings.push(input.limit, input.offset);

    return this.db.all<UserRecord>(
      `SELECT *
       FROM users
       WHERE ${whereClauses.join(" AND ")}
       ORDER BY id ASC
       LIMIT ?
       OFFSET ?`,
      ...bindings,
    );
  }

  async setPasswordHash(id: number, passwordHash: string): Promise<UserRecord> {
    const updated = await this.db.first<UserRecord>(
      `UPDATE users
       SET password_hash = ?, updated_at = ?
       WHERE id = ?
       RETURNING *`,
      passwordHash,
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update password hash for user ${id}`);
    }

    return updated;
  }

  async update(id: number, input: UpdateUserInput): Promise<UserRecord> {
    const existing = await this.findByIdOrThrow(id);

    const updated = await this.db.first<UserRecord>(
      `UPDATE users
       SET display_name = ?, email_verified_at = ?, vanity = ?, status = ?, updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.displayName ?? existing.display_name,
      input.emailVerifiedAt === undefined
        ? existing.email_verified_at
        : input.emailVerifiedAt,
      input.vanity === undefined ? existing.vanity : input.vanity,
      input.status ?? existing.status,
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update user ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(id: number): Promise<UserRecord> {
    const record = await this.findById(id);

    if (!record) {
      throw new Error(`User ${id} not found`);
    }

    return record;
  }
}
