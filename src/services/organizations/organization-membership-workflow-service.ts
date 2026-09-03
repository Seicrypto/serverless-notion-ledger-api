import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { CharactersRepository } from "../../repositories/characters-repository";
import { OrganizationMemberPendingActionsRepository } from "../../repositories/organization-member-pending-actions-repository";
import { OrganizationMembersRepository } from "../../repositories/organization-members-repository";
import type {
  OrganizationMemberPendingActionRecord,
  OrganizationMemberRecord,
} from "../../repositories/types";

function nowIso(): string {
  return new Date().toISOString();
}

function isExpired(timestamp: string | null): boolean {
  return timestamp !== null && timestamp <= nowIso();
}

export class OrganizationMembershipWorkflowService {
  constructor(private readonly db: DatabaseClient) {}

  async approvePendingApply(input: {
    memberId: number;
    organizationId: number;
  }): Promise<OrganizationMemberRecord> {
    const members = new OrganizationMembersRepository(this.db);
    const characters = new CharactersRepository(this.db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(this.db);
    const member = await this.requireMemberInOrganization(
      members,
      input.organizationId,
      input.memberId,
    );

    if (member.status !== "pending") {
      throw new ConflictError("Membership is not pending approval", {
        code: "ORGANIZATION_MEMBER_NOT_PENDING",
      });
    }

    const pendingAction = await this.requirePendingAction(
      pendingActions,
      member.id,
      "apply",
    );
    await this.ensurePendingActionNotExpired(member, pendingAction);

    if (!pendingAction.character_id) {
      throw new ConflictError("Pending membership is missing its reserved character", {
        code: "ORGANIZATION_MEMBER_CHARACTER_REQUIRED",
      });
    }

    const character = await characters.findById(pendingAction.character_id);
    if (!character || character.organization_id !== input.organizationId) {
      throw new ConflictError("Pending membership character is no longer available", {
        code: "ORGANIZATION_MEMBER_CHARACTER_REQUIRED",
      });
    }

    if (
      character.claimed_by_user_id !== null &&
      character.claimed_by_user_id !== member.user_id
    ) {
      throw new ConflictError("Pending membership character is already claimed", {
        code: "CHARACTER_ALREADY_CLAIMED",
      });
    }

    if (character.claimed_by_user_id !== member.user_id) {
      await characters.update(character.id, {
        claimedByUserId: member.user_id,
      });
    }

    const updated = await members.updateStatus(member.id, "active");
    await pendingActions.deleteByMemberId(member.id);
    return updated;
  }

  async acceptInvite(input: {
    actorUserId: number;
    memberId: number;
    organizationId: number;
  }): Promise<OrganizationMemberRecord> {
    const members = new OrganizationMembersRepository(this.db);
    const characters = new CharactersRepository(this.db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(this.db);
    const member = await this.requireMemberInOrganization(
      members,
      input.organizationId,
      input.memberId,
    );

    if (member.user_id !== input.actorUserId) {
      throw new ForbiddenError("You are not allowed to accept this invitation", {
        code: "ORGANIZATION_INVITE_ACCEPT_FORBIDDEN",
      });
    }

    if (member.status !== "pending") {
      throw new ConflictError("Invitation is not pending", {
        code: "ORGANIZATION_MEMBER_NOT_PENDING",
      });
    }

    const pendingAction = await this.requirePendingAction(
      pendingActions,
      member.id,
      "invite",
    );
    await this.ensurePendingActionNotExpired(member, pendingAction);

    if (!pendingAction.character_id) {
      throw new ConflictError("Invitation details were not found", {
        code: "ORGANIZATION_INVITE_DETAILS_MISSING",
      });
    }

    const existingCharacterClaims = await characters.listByOrganizationAndUser(
      input.organizationId,
      input.actorUserId,
    );
    if (existingCharacterClaims.length > 0) {
      throw new ConflictError(
        "You already have a claimed character in this organization",
        {
          code: "USER_ALREADY_HAS_ORGANIZATION_CHARACTER",
        },
      );
    }

    const character = await characters.findById(pendingAction.character_id);
    if (!character || character.organization_id !== input.organizationId) {
      throw new ConflictError("Invitation character is no longer available", {
        code: "ORGANIZATION_INVITE_DETAILS_MISSING",
      });
    }

    if (
      character.claimed_by_user_id !== null &&
      character.claimed_by_user_id !== input.actorUserId
    ) {
      throw new ConflictError("Invitation character is already claimed", {
        code: "CHARACTER_ALREADY_CLAIMED",
      });
    }

    if (character.claimed_by_user_id !== input.actorUserId) {
      await characters.update(character.id, {
        claimedByUserId: input.actorUserId,
      });
    }

    const updated = await members.updateStatus(member.id, "active");
    await pendingActions.deleteByMemberId(member.id);
    return updated;
  }

  async rejectPendingMembership(input: {
    actorUserId: number;
    memberId: number;
    organizationId: number;
  }): Promise<OrganizationMemberRecord> {
    return this.finishPendingMembership({
      actorUserId: input.actorUserId,
      memberId: input.memberId,
      organizationId: input.organizationId,
      status: "removed",
    });
  }

  async declineInvite(input: {
    actorUserId: number;
    memberId: number;
    organizationId: number;
  }): Promise<OrganizationMemberRecord> {
    const members = new OrganizationMembersRepository(this.db);
    const member = await this.requireMemberInOrganization(
      members,
      input.organizationId,
      input.memberId,
    );

    if (member.user_id !== input.actorUserId) {
      throw new ForbiddenError("You are not allowed to decline this invitation", {
        code: "ORGANIZATION_INVITE_DECLINE_FORBIDDEN",
      });
    }

    return this.finishPendingMembership({
      actorUserId: input.actorUserId,
      expectedKind: "invite",
      memberId: input.memberId,
      organizationId: input.organizationId,
      status: "removed",
    });
  }

  async cancelPendingMembership(input: {
    actorUserId: number;
    allowManagerOverride?: boolean;
    memberId: number;
    organizationId: number;
  }): Promise<OrganizationMemberRecord> {
    const members = new OrganizationMembersRepository(this.db);
    const member = await this.requireMemberInOrganization(
      members,
      input.organizationId,
      input.memberId,
    );

    if (!input.allowManagerOverride && member.user_id !== input.actorUserId) {
      throw new ForbiddenError("You are not allowed to cancel this pending membership", {
        code: "ORGANIZATION_MEMBER_CANCEL_FORBIDDEN",
      });
    }

    return this.finishPendingMembership({
      actorUserId: input.actorUserId,
      memberId: input.memberId,
      organizationId: input.organizationId,
      status: "removed",
    });
  }

  async leaveActiveMembership(input: {
    actorUserId: number;
    memberId: number;
    organizationId: number;
  }): Promise<OrganizationMemberRecord> {
    const members = new OrganizationMembersRepository(this.db);
    const member = await this.requireMemberInOrganization(
      members,
      input.organizationId,
      input.memberId,
    );

    if (member.user_id !== input.actorUserId) {
      throw new ForbiddenError("You are not allowed to leave this organization for another member", {
        code: "ORGANIZATION_MEMBER_LEAVE_FORBIDDEN",
      });
    }

    if (member.status !== "active") {
      throw new ConflictError("Only active members can leave the organization", {
        code: "ORGANIZATION_MEMBER_NOT_ACTIVE",
      });
    }

    if (member.role === "owner") {
      throw new ConflictError("Organization owner cannot leave in V1", {
        code: "ORGANIZATION_OWNER_ROLE_IMMUTABLE",
      });
    }

    await this.releaseActiveMemberCharacters(input.organizationId, member.user_id);
    return members.softLeave(member.id);
  }

  async removeActiveMembership(input: {
    memberId: number;
    organizationId: number;
  }): Promise<OrganizationMemberRecord> {
    const members = new OrganizationMembersRepository(this.db);
    const member = await this.requireMemberInOrganization(
      members,
      input.organizationId,
      input.memberId,
    );

    if (member.status !== "active") {
      throw new ConflictError("Only active members can be removed", {
        code: "ORGANIZATION_MEMBER_NOT_ACTIVE",
      });
    }

    if (member.role === "owner") {
      throw new ConflictError("Organization owner cannot be removed in V1", {
        code: "ORGANIZATION_OWNER_ROLE_IMMUTABLE",
      });
    }

    await this.releaseActiveMemberCharacters(input.organizationId, member.user_id);
    return members.softRemove(member.id);
  }

  private async finishPendingMembership(input: {
    actorUserId: number;
    expectedKind?: "apply" | "invite";
    memberId: number;
    organizationId: number;
    status: "removed";
  }): Promise<OrganizationMemberRecord> {
    const members = new OrganizationMembersRepository(this.db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(this.db);
    const member = await this.requireMemberInOrganization(
      members,
      input.organizationId,
      input.memberId,
    );

    if (member.status !== "pending") {
      throw new ConflictError("Membership is not pending approval", {
        code: "ORGANIZATION_MEMBER_NOT_PENDING",
      });
    }

    const pendingAction = await pendingActions.findByMemberId(member.id);
    if (!pendingAction) {
      throw new ConflictError("Pending membership details were not found", {
        code: "ORGANIZATION_MEMBER_PENDING_DETAILS_MISSING",
      });
    }

    if (input.expectedKind && pendingAction.kind !== input.expectedKind) {
      throw new ConflictError("Pending membership details were not found", {
        code:
          input.expectedKind === "invite"
            ? "ORGANIZATION_INVITE_DETAILS_MISSING"
            : "ORGANIZATION_MEMBER_PENDING_DETAILS_MISSING",
      });
    }

    await this.releasePendingCharacter(pendingAction, input.actorUserId);
    await pendingActions.deleteByMemberId(member.id);
    return members.softRemove(member.id);
  }

  private async ensurePendingActionNotExpired(
    member: OrganizationMemberRecord,
    pendingAction: OrganizationMemberPendingActionRecord,
  ): Promise<void> {
    if (!isExpired(pendingAction.expires_at)) {
      return;
    }

    await this.releasePendingCharacter(pendingAction, member.user_id);
    const members = new OrganizationMembersRepository(this.db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(this.db);
    await pendingActions.deleteByMemberId(member.id);
    await members.softRemove(member.id);

    throw new ConflictError("Pending membership has expired", {
      code: "ORGANIZATION_PENDING_MEMBERSHIP_EXPIRED",
    });
  }

  private async releaseActiveMemberCharacters(
    organizationId: number,
    userId: number,
  ): Promise<void> {
    const characters = await new CharactersRepository(this.db).listByOrganizationAndUser(
      organizationId,
      userId,
    );

    for (const character of characters) {
      await new CharactersRepository(this.db).update(character.id, {
        claimedByUserId: null,
      });
    }

    if (characters.length === 0) {
      return;
    }

    const placeholders = characters.map(() => "?").join(", ");
    await this.db.run(
      `UPDATE character_claim_requests
       SET status = 'cancelled',
           updated_at = ?
       WHERE organization_id = ?
         AND status = 'pending_confirmation'
         AND (
           target_user_id = ?
           OR character_id IN (${placeholders})
         )`,
      nowIso(),
      organizationId,
      userId,
      ...characters.map((character) => character.id),
    );
  }

  private async releasePendingCharacter(
    pendingAction: OrganizationMemberPendingActionRecord,
    actorUserId: number,
  ): Promise<void> {
    if (!pendingAction.character_id) {
      return;
    }

    if (!pendingAction.requested_character_name) {
      return;
    }

    await new CharactersRepository(this.db).delete(pendingAction.character_id, {
      deletedByUserId: actorUserId,
    });
  }

  private async requireMemberInOrganization(
    members: OrganizationMembersRepository,
    organizationId: number,
    memberId: number,
  ): Promise<OrganizationMemberRecord> {
    const member = await members.findById(memberId);
    if (!member || member.organization_id !== organizationId) {
      throw new NotFoundError("Organization membership not found");
    }

    return member;
  }

  private async requirePendingAction(
    pendingActions: OrganizationMemberPendingActionsRepository,
    memberId: number,
    kind: "apply" | "invite",
  ): Promise<OrganizationMemberPendingActionRecord> {
    const pendingAction = await pendingActions.findByMemberId(memberId);
    if (!pendingAction || pendingAction.kind !== kind) {
      throw new ConflictError(
        kind === "invite"
          ? "Invitation details were not found"
          : "Pending membership is missing its reserved character",
        {
          code:
            kind === "invite"
              ? "ORGANIZATION_INVITE_DETAILS_MISSING"
              : "ORGANIZATION_MEMBER_CHARACTER_REQUIRED",
        },
      );
    }

    return pendingAction;
  }
}
