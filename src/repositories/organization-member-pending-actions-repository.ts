import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CreateOrganizationMemberPendingActionInput,
  OrganizationMemberPendingActionRecord,
} from "./types";
import { nowIso } from "./utils";

export class OrganizationMemberPendingActionsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(
    input: CreateOrganizationMemberPendingActionInput,
  ): Promise<OrganizationMemberPendingActionRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<OrganizationMemberPendingActionRecord>(
      `INSERT INTO organization_member_pending_actions (
        member_id,
        kind,
        character_id,
        requested_game_id,
        requested_character_name,
        requested_character_slug,
        requested_character_notes,
        invited_by_user_id,
        expires_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.memberId,
      input.kind,
      input.characterId ?? null,
      input.requestedGameId ?? null,
      input.requestedCharacterName ?? null,
      input.requestedCharacterSlug ?? null,
      input.requestedCharacterNotes ?? null,
      input.invitedByUserId ?? null,
      input.expiresAt ?? null,
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create organization member pending action");
    }

    return created;
  }

  async deleteByMemberId(memberId: number): Promise<void> {
    await this.db.run(
      `DELETE FROM organization_member_pending_actions WHERE member_id = ?`,
      memberId,
    );
  }

  async findByCharacterId(
    characterId: number,
  ): Promise<OrganizationMemberPendingActionRecord | null> {
    return this.db.first<OrganizationMemberPendingActionRecord>(
      `SELECT * FROM organization_member_pending_actions
       WHERE character_id = ?`,
      characterId,
    );
  }

  async findByMemberId(
    memberId: number,
  ): Promise<OrganizationMemberPendingActionRecord | null> {
    return this.db.first<OrganizationMemberPendingActionRecord>(
      `SELECT * FROM organization_member_pending_actions
       WHERE member_id = ?`,
      memberId,
    );
  }

  async update(
    memberId: number,
    input: Partial<CreateOrganizationMemberPendingActionInput>,
  ): Promise<OrganizationMemberPendingActionRecord> {
    const existing = await this.findByMemberIdOrThrow(memberId);
    const updated = await this.db.first<OrganizationMemberPendingActionRecord>(
      `UPDATE organization_member_pending_actions
       SET kind = ?,
           character_id = ?,
           requested_game_id = ?,
           requested_character_name = ?,
           requested_character_slug = ?,
           requested_character_notes = ?,
           invited_by_user_id = ?,
           expires_at = ?,
           updated_at = ?
       WHERE member_id = ?
       RETURNING *`,
      input.kind ?? existing.kind,
      input.characterId === undefined ? existing.character_id : input.characterId,
      input.requestedGameId === undefined
        ? existing.requested_game_id
        : input.requestedGameId,
      input.requestedCharacterName === undefined
        ? existing.requested_character_name
        : input.requestedCharacterName,
      input.requestedCharacterSlug === undefined
        ? existing.requested_character_slug
        : input.requestedCharacterSlug,
      input.requestedCharacterNotes === undefined
        ? existing.requested_character_notes
        : input.requestedCharacterNotes,
      input.invitedByUserId === undefined
        ? existing.invited_by_user_id
        : input.invitedByUserId,
      input.expiresAt === undefined ? existing.expires_at : input.expiresAt,
      nowIso(),
      memberId,
    );

    if (!updated) {
      throw new Error(
        `Failed to update organization member pending action ${memberId}`,
      );
    }

    return updated;
  }

  private async findByMemberIdOrThrow(
    memberId: number,
  ): Promise<OrganizationMemberPendingActionRecord> {
    const record = await this.findByMemberId(memberId);

    if (!record) {
      throw new Error(
        `Organization member pending action for member ${memberId} not found`,
      );
    }

    return record;
  }
}
