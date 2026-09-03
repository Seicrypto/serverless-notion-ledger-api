import test from "node:test";
import assert from "node:assert/strict";
import { CharacterClaimRequestsRepository } from "../src/repositories/character-claim-requests-repository";
import { CharactersRepository } from "../src/repositories/characters-repository";
import { GamesRepository } from "../src/repositories/games-repository";
import { OrganizationMemberPendingActionsRepository } from "../src/repositories/organization-member-pending-actions-repository";
import { OrganizationMembersRepository } from "../src/repositories/organization-members-repository";
import { OrganizationsRepository } from "../src/repositories/organizations-repository";
import { UsersRepository } from "../src/repositories/users-repository";
import { OrganizationCharacterClaimWorkflowService } from "../src/services/organizations/organization-character-claim-workflow-service";
import { OrganizationMembershipWorkflowService } from "../src/services/organizations/organization-membership-workflow-service";
import { createTestDatabase } from "./support/test-database";

test("membership workflow approves pending apply and claims reserved character", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(db);
    const characters = new CharactersRepository(db);
    const games = new GamesRepository(db);
    const owner = await users.create({
      email: "workflow-owner@example.com",
      passwordHash: "hash-workflow-owner",
      status: "active",
    });
    const applicant = await users.create({
      email: "workflow-applicant@example.com",
      passwordHash: "hash-workflow-applicant",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Workflow Guild",
    });
    const game = await games.create({
      name: "Workflow Game",
      slug: "workflow-game",
    });
    const member = await members.create({
      organizationId: organization.id,
      role: "member",
      status: "pending",
      userId: applicant.id,
    });
    const character = await characters.create({
      gameId: game.id,
      name: "Pending Applicant",
      organizationId: organization.id,
      vanity: "c-pending-applicant",
    });
    await pendingActions.create({
      characterId: character.id,
      kind: "apply",
      memberId: member.id,
      requestedCharacterName: "Pending Applicant",
    });

    const service = new OrganizationMembershipWorkflowService(db);
    const approved = await service.approvePendingApply({
      memberId: member.id,
      organizationId: organization.id,
    });

    assert.equal(approved.status, "active");
    const updatedCharacter = await characters.findById(character.id);
    assert.equal(updatedCharacter?.claimed_by_user_id, applicant.id);
    const pending = await pendingActions.findByMemberId(member.id);
    assert.equal(pending, null);
  } finally {
    await cleanup();
  }
});

test("membership workflow leave unassigns claimed characters and marks member left", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const games = new GamesRepository(db);
    const owner = await users.create({
      email: "leave-owner@example.com",
      passwordHash: "hash-leave-owner",
      status: "active",
    });
    const memberUser = await users.create({
      email: "leave-member@example.com",
      passwordHash: "hash-leave-member",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Leave Guild",
    });
    const game = await games.create({
      name: "Leave Game",
      slug: "leave-game",
    });
    const member = await members.create({
      organizationId: organization.id,
      role: "member",
      status: "active",
      userId: memberUser.id,
    });
    const character = await characters.create({
      claimedByUserId: memberUser.id,
      gameId: game.id,
      name: "Leaving Character",
      organizationId: organization.id,
      vanity: "c-leaving-character",
    });

    const service = new OrganizationMembershipWorkflowService(db);
    const left = await service.leaveActiveMembership({
      actorUserId: memberUser.id,
      memberId: member.id,
      organizationId: organization.id,
    });

    assert.equal(left.status, "left");
    const updatedCharacter = await characters.findById(character.id);
    assert.equal(updatedCharacter?.claimed_by_user_id, null);
  } finally {
    await cleanup();
  }
});

test("character claim workflow creates and accepts transfer confirmation", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const games = new GamesRepository(db);
    const requester = await users.create({
      email: "claim-requester@example.com",
      passwordHash: "hash-claim-requester",
      status: "active",
    });
    const targetUser = await users.create({
      email: "claim-target@example.com",
      passwordHash: "hash-claim-target",
      status: "active",
    });
    const currentOwner = await users.create({
      email: "claim-current-owner@example.com",
      passwordHash: "hash-claim-current-owner",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: requester.id,
      name: "Claim Guild",
    });
    const game = await games.create({
      name: "Claim Game",
      slug: "claim-game",
    });
    const targetMember = await members.create({
      organizationId: organization.id,
      role: "member",
      status: "active",
      userId: targetUser.id,
    });
    await members.create({
      organizationId: organization.id,
      role: "member",
      status: "active",
      userId: currentOwner.id,
    });
    const character = await characters.create({
      claimedByUserId: currentOwner.id,
      gameId: game.id,
      name: "Transfer Character",
      organizationId: organization.id,
      vanity: "c-transfer-character",
    });

    const service = new OrganizationCharacterClaimWorkflowService(db);
    const request = await service.createClaimRequest({
      characterId: character.id,
      organizationId: organization.id,
      requestedByUserId: requester.id,
      targetMemberId: targetMember.id,
    });

    assert.equal(request.status, "pending_confirmation");
    const accepted = await service.acceptClaimRequest({
      actorUserId: targetUser.id,
      organizationId: organization.id,
      requestId: request.id,
    });

    assert.equal(accepted.request.status, "accepted");
    assert.equal(accepted.character.claimed_by_user_id, targetUser.id);
  } finally {
    await cleanup();
  }
});

test("character assign workflow rejects direct assignment for already claimed characters", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const games = new GamesRepository(db);
    const owner = await users.create({
      email: "assign-owner@example.com",
      passwordHash: "hash-assign-owner",
      status: "active",
    });
    const targetUser = await users.create({
      email: "assign-target@example.com",
      passwordHash: "hash-assign-target",
      status: "active",
    });
    const currentOwner = await users.create({
      email: "assign-current-owner@example.com",
      passwordHash: "hash-assign-current-owner",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Assign Guild",
    });
    const game = await games.create({
      name: "Assign Game",
      slug: "assign-game",
    });
    const targetMember = await members.create({
      organizationId: organization.id,
      role: "member",
      status: "active",
      userId: targetUser.id,
    });
    const character = await characters.create({
      claimedByUserId: currentOwner.id,
      gameId: game.id,
      name: "Already Claimed",
      organizationId: organization.id,
      vanity: "c-already-claimed",
    });

    const service = new OrganizationCharacterClaimWorkflowService(db);

    await assert.rejects(
      () =>
        service.assignCharacter({
          characterId: character.id,
          organizationId: organization.id,
          targetMemberId: targetMember.id,
        }),
      /transfer confirmation/i,
    );
  } finally {
    await cleanup();
  }
});

test("pending membership cancellation removes pending draft character", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(db);
    const characters = new CharactersRepository(db);
    const games = new GamesRepository(db);
    const applicant = await users.create({
      email: "cancel-applicant@example.com",
      passwordHash: "hash-cancel-applicant",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: applicant.id,
      name: "Cancel Guild",
    });
    const game = await games.create({
      name: "Cancel Game",
      slug: "cancel-game",
    });
    const member = await members.create({
      organizationId: organization.id,
      role: "member",
      status: "pending",
      userId: applicant.id,
    });
    const draftCharacter = await characters.create({
      gameId: game.id,
      name: "Draft Pending",
      organizationId: organization.id,
      vanity: "c-draft-pending",
    });
    await pendingActions.create({
      characterId: draftCharacter.id,
      kind: "apply",
      memberId: member.id,
      requestedCharacterName: "Draft Pending",
    });

    const service = new OrganizationMembershipWorkflowService(db);
    const removed = await service.cancelPendingMembership({
      actorUserId: applicant.id,
      memberId: member.id,
      organizationId: organization.id,
    });

    assert.equal(removed.status, "removed");
    const pending = await pendingActions.findByMemberId(member.id);
    assert.equal(pending, null);
    const deletedCharacter = await characters.findById(draftCharacter.id, {
      includeDeleted: true,
    });
    assert.ok(deletedCharacter?.deleted_at);
  } finally {
    await cleanup();
  }
});

test("character claim workflow cancellation marks pending request cancelled", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const claimRequests = new CharacterClaimRequestsRepository(db);
    const characters = new CharactersRepository(db);
    const games = new GamesRepository(db);
    const requester = await users.create({
      email: "cancel-requester@example.com",
      passwordHash: "hash-cancel-requester",
      status: "active",
    });
    const targetUser = await users.create({
      email: "cancel-target@example.com",
      passwordHash: "hash-cancel-target",
      status: "active",
    });
    const currentOwner = await users.create({
      email: "cancel-current-owner@example.com",
      passwordHash: "hash-cancel-current-owner",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: requester.id,
      name: "Cancel Request Guild",
    });
    const game = await games.create({
      name: "Cancel Request Game",
      slug: "cancel-request-game",
    });
    const targetMember = await members.create({
      organizationId: organization.id,
      role: "member",
      status: "active",
      userId: targetUser.id,
    });
    await members.create({
      organizationId: organization.id,
      role: "member",
      status: "active",
      userId: currentOwner.id,
    });
    const character = await characters.create({
      claimedByUserId: currentOwner.id,
      gameId: game.id,
      name: "Cancelable Transfer",
      organizationId: organization.id,
      vanity: "c-cancelable-transfer",
    });
    const service = new OrganizationCharacterClaimWorkflowService(db);
    const request = await service.createClaimRequest({
      characterId: character.id,
      organizationId: organization.id,
      requestedByUserId: requester.id,
      targetMemberId: targetMember.id,
    });

    const cancelled = await service.cancelClaimRequest({
      actorUserId: requester.id,
      organizationId: organization.id,
      requestId: request.id,
    });

    assert.equal(cancelled.status, "cancelled");
    const stored = await claimRequests.findById(request.id);
    assert.equal(stored?.status, "cancelled");
  } finally {
    await cleanup();
  }
});
