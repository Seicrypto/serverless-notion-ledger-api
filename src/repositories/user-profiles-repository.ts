import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CreateUserProfileInput,
  UpdateUserProfileInput,
  UserProfileRecord,
} from "./types";
import { nowIso } from "./utils";

export class UserProfilesRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateUserProfileInput): Promise<UserProfileRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<UserProfileRecord>(
      `INSERT INTO user_profiles (
        user_id,
        preferred_locale,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?)
      RETURNING *`,
      input.userId,
      input.preferredLocale ?? null,
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error(`Failed to create user profile for user ${input.userId}`);
    }

    return created;
  }

  async findByUserId(userId: number): Promise<UserProfileRecord | null> {
    return this.db.first<UserProfileRecord>(
      `SELECT * FROM user_profiles WHERE user_id = ?`,
      userId,
    );
  }

  async upsert(input: CreateUserProfileInput): Promise<UserProfileRecord> {
    const timestamp = nowIso();
    const updated = await this.db.first<UserProfileRecord>(
      `INSERT INTO user_profiles (
        user_id,
        preferred_locale,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        preferred_locale = excluded.preferred_locale,
        updated_at = excluded.updated_at
      RETURNING *`,
      input.userId,
      input.preferredLocale ?? null,
      timestamp,
      timestamp,
    );

    if (!updated) {
      throw new Error(`Failed to upsert user profile for user ${input.userId}`);
    }

    return updated;
  }

  async update(
    userId: number,
    input: UpdateUserProfileInput,
  ): Promise<UserProfileRecord> {
    const existing = await this.findByUserIdOrThrow(userId);

    const updated = await this.db.first<UserProfileRecord>(
      `UPDATE user_profiles
       SET preferred_locale = ?, updated_at = ?
       WHERE user_id = ?
       RETURNING *`,
      input.preferredLocale === undefined
        ? existing.preferred_locale
        : input.preferredLocale,
      nowIso(),
      userId,
    );

    if (!updated) {
      throw new Error(`Failed to update user profile for user ${userId}`);
    }

    return updated;
  }

  private async findByUserIdOrThrow(userId: number): Promise<UserProfileRecord> {
    const record = await this.findByUserId(userId);

    if (!record) {
      throw new Error(`User profile ${userId} not found`);
    }

    return record;
  }
}
