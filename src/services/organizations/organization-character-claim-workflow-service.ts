import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { CharacterClaimRequestsRepository } from "../../repositories/character-claim-requests-repository";
import { CharactersRepository } from "../../repositories/characters-repository";
import { OrganizationMembersRepository } from "../../repositories/organization-members-repository";
import type {
  CharacterClaimRequestRecord,
  CharacterRecord,
  OrganizationMemberRecord,
} from "../../repositories/types";

function nowIso(): string {
  return new Date().toISOString();
}

export class OrganizationCharacterClaimWorkflowService {
  constructor(private readonly db: DatabaseClient) {}

  async assignCharacter(input: {
    characterId: number;
    organizationId: number;
    targetMemberId?: number;
    targetUserId?: number;
  }): Promise<CharacterRecord> {
    const characters = new CharactersRepository(this.db);
    const character = await this.requireOrganizationCharacter(
      input.organizationId,
      input.characterId,
    );

    if (character.deleted_at !== null || character.is_active !== 1) {
      throw new ConflictError("Character is not available for assignment", {
        code: "CHARACTER_NOT_AVAILABLE",
      });
    }

    if (character.claimed_by_user_id !== null) {
      throw new ConflictError(
        "Claimed characters must use a transfer confirmation request",
        {
          code: "CHARACTER_TRANSFER_CONFIRMATION_REQUIRED",
        },
      );
    }

    const membership = await this.requireActiveMember(input.organizationId, {
      memberId: input.targetMemberId,
      userId: input.targetUserId,
    });
    const existingCharacterClaims = await characters.listByOrganizationAndUser(
      input.organizationId,
      membership.user_id,
    );
    if (
      existingCharacterClaims.some((claimedCharacter) => claimedCharacter.id !== character.id)
    ) {
      throw new ConflictError(
        "Target user already has a claimed character in this organization",
        {
          code: "USER_ALREADY_HAS_ORGANIZATION_CHARACTER",
        },
      );
    }

    await this.cancelPendingClaimRequests(input.organizationId, character.id);
    return characters.update(character.id, {
      claimedByUserId: membership.user_id,
    });
  }

  async unassignCharacter(input: {
    characterId: number;
    organizationId: number;
  }): Promise<CharacterRecord> {
    const characters = new CharactersRepository(this.db);
    const character = await this.requireOrganizationCharacter(
      input.organizationId,
      input.characterId,
    );

    const updated = await characters.update(character.id, {
      claimedByUserId: null,
    });
    await this.cancelPendingClaimRequests(input.organizationId, character.id);
    return updated;
  }

  async createClaimRequest(input: {
    characterId: number;
    organizationId: number;
    requestedByUserId: number;
    targetMemberId?: number;
    targetUserId?: number;
  }): Promise<CharacterClaimRequestRecord> {
    const claimRequests = new CharacterClaimRequestsRepository(this.db);
    const character = await this.requireOrganizationCharacter(
      input.organizationId,
      input.characterId,
    );
    const membership = await this.requireActiveMember(input.organizationId, {
      memberId: input.targetMemberId,
      userId: input.targetUserId,
    });

    if (character.deleted_at !== null || character.is_active !== 1) {
      throw new ConflictError("Character is not available for reassignment", {
        code: "CHARACTER_NOT_AVAILABLE",
      });
    }

    if (character.claimed_by_user_id === null) {
      throw new ConflictError(
        "Unclaimed characters should use direct assignment instead of a claim request",
        {
          code: "CHARACTER_ASSIGN_DIRECT_REQUIRED",
        },
      );
    }

    if (character.claimed_by_user_id === membership.user_id) {
      throw new ConflictError("Character is already claimed by this member", {
        code: "CHARACTER_ALREADY_CLAIMED",
      });
    }

    const existing = await claimRequests.findPendingByCharacterAndUser(
      character.id,
      membership.user_id,
    );
    if (existing) {
      throw new ConflictError("Pending character claim request already exists", {
        code: "CHARACTER_CLAIM_REQUEST_EXISTS",
      });
    }

    return claimRequests.create({
      characterId: character.id,
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      targetMemberId: membership.id,
      targetUserId: membership.user_id,
    });
  }

  async acceptClaimRequest(input: {
    actorUserId: number;
    organizationId: number;
    requestId: number;
  }): Promise<{
    character: CharacterRecord;
    request: CharacterClaimRequestRecord;
  }> {
    const claimRequests = new CharacterClaimRequestsRepository(this.db);
    const request = await this.requireClaimRequest(input.organizationId, input.requestId);

    if (request.target_user_id !== input.actorUserId) {
      throw new ForbiddenError("You are not allowed to accept this claim request", {
        code: "CHARACTER_CLAIM_REQUEST_ACCEPT_FORBIDDEN",
      });
    }

    if (request.status !== "pending_confirmation") {
      throw new ConflictError("Claim request is not pending confirmation", {
        code: "CHARACTER_CLAIM_REQUEST_NOT_PENDING",
      });
    }

    const character = await this.requireOrganizationCharacter(
      input.organizationId,
      request.character_id,
    );
    const updatedCharacter = await new CharactersRepository(this.db).update(character.id, {
      claimedByUserId: request.target_user_id,
    });
    await this.cancelPendingClaimRequests(input.organizationId, character.id, request.id);
    const accepted = await claimRequests.update(request.id, {
      status: "accepted",
      targetMemberId: request.target_member_id,
      targetUserId: request.target_user_id,
    });

    return {
      character: updatedCharacter,
      request: accepted,
    };
  }

  async declineClaimRequest(input: {
    actorUserId: number;
    organizationId: number;
    requestId: number;
  }): Promise<CharacterClaimRequestRecord> {
    const claimRequests = new CharacterClaimRequestsRepository(this.db);
    const request = await this.requireClaimRequest(input.organizationId, input.requestId);

    if (request.target_user_id !== input.actorUserId) {
      throw new ForbiddenError("You are not allowed to decline this claim request", {
        code: "CHARACTER_CLAIM_REQUEST_DECLINE_FORBIDDEN",
      });
    }

    if (request.status !== "pending_confirmation") {
      throw new ConflictError("Claim request is not pending confirmation", {
        code: "CHARACTER_CLAIM_REQUEST_NOT_PENDING",
      });
    }

    return claimRequests.update(request.id, {
      status: "declined",
    });
  }

  async cancelClaimRequest(input: {
    actorUserId: number;
    allowManagerOverride?: boolean;
    organizationId: number;
    requestId: number;
  }): Promise<CharacterClaimRequestRecord> {
    const claimRequests = new CharacterClaimRequestsRepository(this.db);
    const request = await this.requireClaimRequest(input.organizationId, input.requestId);

    if (!input.allowManagerOverride && request.requested_by_user_id !== input.actorUserId) {
      throw new ForbiddenError("You are not allowed to cancel this claim request", {
        code: "CHARACTER_CLAIM_REQUEST_CANCEL_FORBIDDEN",
      });
    }

    if (request.status !== "pending_confirmation") {
      throw new ConflictError("Claim request is not pending confirmation", {
        code: "CHARACTER_CLAIM_REQUEST_NOT_PENDING",
      });
    }

    return claimRequests.update(request.id, {
      status: "cancelled",
    });
  }

  private async requireClaimRequest(
    organizationId: number,
    requestId: number,
  ): Promise<CharacterClaimRequestRecord> {
    const request = await new CharacterClaimRequestsRepository(this.db).findById(requestId);
    if (!request || request.organization_id !== organizationId) {
      throw new NotFoundError("Character claim request not found");
    }

    return request;
  }

  private async requireOrganizationCharacter(
    organizationId: number,
    characterId: number,
  ): Promise<CharacterRecord> {
    const character = await new CharactersRepository(this.db).findById(characterId);
    if (!character || character.organization_id !== organizationId) {
      throw new NotFoundError("Character not found");
    }

    return character;
  }

  private async requireActiveMember(
    organizationId: number,
    input: {
      memberId?: number;
      userId?: number;
    },
  ): Promise<OrganizationMemberRecord> {
    const members = new OrganizationMembersRepository(this.db);
    const membership =
      input.memberId !== undefined
        ? await members.findById(input.memberId)
        : await members.findByOrganizationAndUser(organizationId, input.userId!);

    if (!membership || membership.organization_id !== organizationId) {
      throw new NotFoundError("Organization member not found");
    }

    if (membership.status !== "active") {
      throw new ConflictError("Target member is not active in this organization", {
        code: "ORGANIZATION_MEMBER_NOT_ACTIVE",
      });
    }

    return membership;
  }

  private async cancelPendingClaimRequests(
    organizationId: number,
    characterId: number,
    excludeRequestId?: number,
  ): Promise<void> {
    const excludeClause = excludeRequestId ? "AND id != ?" : "";
    const bindings: unknown[] = [nowIso(), organizationId, characterId];
    if (excludeRequestId) {
      bindings.push(excludeRequestId);
    }

    await this.db.run(
      `UPDATE character_claim_requests
       SET status = 'cancelled',
           updated_at = ?
       WHERE organization_id = ?
         AND character_id = ?
         AND status = 'pending_confirmation'
         ${excludeClause}`,
      ...bindings,
    );
  }
}
