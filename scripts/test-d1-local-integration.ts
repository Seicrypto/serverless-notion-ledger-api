import assert from "node:assert/strict";
import { CharactersRepository } from "../src/repositories/characters-repository";
import { GamesRepository } from "../src/repositories/games-repository";
import { OrganizationMembersRepository } from "../src/repositories/organization-members-repository";
import { OrganizationsRepository } from "../src/repositories/organizations-repository";
import { UsersRepository } from "../src/repositories/users-repository";
import { OrganizationCharacterLifecycleService } from "../src/services/organizations/organization-character-lifecycle-service";
import { OrganizationMemberLifecycleService } from "../src/services/organizations/organization-member-lifecycle-service";
import { SqliteCliClient } from "../tests/support/sqlite-cli-client";
import { createLocalD1TestContext } from "./d1-local-test-utils";

async function main() {
  const context = await createLocalD1TestContext();

  try {
    const db = new SqliteCliClient(context.databasePath);
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const games = new GamesRepository(db);
    const characterLifecycle = new OrganizationCharacterLifecycleService(db);
    const memberLifecycle = new OrganizationMemberLifecycleService(db);

    const spiritVale = await games.findBySlug("spiritvale");
    assert.ok(spiritVale, "SpiritVale should be available in local D1 test DB");
    assert.equal(spiritVale.source, "steam");
    assert.equal(spiritVale.source_id, "3767850");

    const owner = await users.create({
      email: "owner-local@example.com",
      passwordHash: "hash-owner-local",
      vanity: "u-owner-local",
    });
    const returningMember = await users.create({
      email: "returning-local@example.com",
      passwordHash: "hash-returning-local",
      vanity: "u-returning-local",
    });

    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Local D1 Guild",
      vanity: "g-local-d1",
    });

    await members.create({
      organizationId: organization.id,
      role: "owner",
      status: "active",
      userId: owner.id,
    });

    const ownerCharacter = await characters.create({
      claimedByUserId: owner.id,
      gameId: spiritVale.id,
      name: "Founder",
      organizationId: organization.id,
      slug: "founder",
    });

    const deletedCharacter = await characterLifecycle.softDeleteCharacter(
      ownerCharacter.id,
      owner.id,
    );
    assert.equal(deletedCharacter.is_active, 0);
    assert.equal(deletedCharacter.claimed_by_user_id, null);
    assert.ok(deletedCharacter.deleted_at);
    assert.equal(deletedCharacter.deleted_by_user_id, owner.id);

    const hiddenCharacter = await characters.findById(ownerCharacter.id);
    assert.equal(hiddenCharacter, null);

    const historicalCharacter = await characters.findById(ownerCharacter.id, {
      includeDeleted: true,
    });
    assert.ok(historicalCharacter);
    assert.ok(historicalCharacter.deleted_at);

    const createdMembership = await members.create({
      organizationId: organization.id,
      role: "member",
      status: "active",
      userId: returningMember.id,
    });

    const removedMembership = await memberLifecycle.removeMember(
      createdMembership.id,
    );
    assert.equal(removedMembership.status, "removed");
    assert.ok(removedMembership.removed_at);

    const reactivatedMembership = await members.createOrReactivate({
      organizationId: organization.id,
      role: "member",
      status: "active",
      userId: returningMember.id,
    });

    assert.equal(reactivatedMembership.id, createdMembership.id);
    assert.equal(reactivatedMembership.status, "active");
    assert.equal(reactivatedMembership.removed_at, null);
    assert.equal(reactivatedMembership.left_at, null);

    const visibleMembers = await members.listByOrganization(organization.id);
    assert.equal(visibleMembers.length, 2);

    console.log("Local D1 integration test passed.");
  } finally {
    await context.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
