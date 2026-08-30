import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CharacterClaimRequestRecord,
  CreateCharacterClaimRequestInput,
  UpdateCharacterClaimRequestInput,
} from "./types";
import { nowIso } from "./utils";

export class CharacterClaimRequestsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(
    input: CreateCharacterClaimRequestInput,
  ): Promise<CharacterClaimRequestRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<CharacterClaimRequestRecord>(
      `INSERT INTO character_claim_requests (
        organization_id,
        character_id,
        target_user_id,
        target_member_id,
        requested_by_user_id,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.organizationId,
      input.characterId,
      input.targetUserId,
      input.targetMemberId ?? null,
      input.requestedByUserId,
      input.status ?? "pending_confirmation",
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create character claim request");
    }

    return created;
  }

  async findById(id: number): Promise<CharacterClaimRequestRecord | null> {
    return this.db.first<CharacterClaimRequestRecord>(
      `SELECT * FROM character_claim_requests WHERE id = ?`,
      id,
    );
  }

  async findPendingByCharacterAndUser(
    characterId: number,
    targetUserId: number,
  ): Promise<CharacterClaimRequestRecord | null> {
    return this.db.first<CharacterClaimRequestRecord>(
      `SELECT * FROM character_claim_requests
       WHERE character_id = ?
         AND target_user_id = ?
         AND status = 'pending_confirmation'
       ORDER BY id DESC
       LIMIT 1`,
      characterId,
      targetUserId,
    );
  }

  async update(
    id: number,
    input: UpdateCharacterClaimRequestInput,
  ): Promise<CharacterClaimRequestRecord> {
    const existing = await this.findById(id);

    if (!existing) {
      throw new Error(`Character claim request ${id} not found`);
    }

    const updated = await this.db.first<CharacterClaimRequestRecord>(
      `UPDATE character_claim_requests
       SET status = ?,
           target_member_id = ?,
           target_user_id = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.status ?? existing.status,
      input.targetMemberId === undefined
        ? existing.target_member_id
        : input.targetMemberId,
      input.targetUserId ?? existing.target_user_id,
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update character claim request ${id}`);
    }

    return updated;
  }
}
