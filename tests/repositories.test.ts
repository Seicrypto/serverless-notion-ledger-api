import test from "node:test";
import assert from "node:assert/strict";
import { CharactersRepository } from "../src/repositories/characters-repository";
import { GamesRepository } from "../src/repositories/games-repository";
import { OrganizationMembersRepository } from "../src/repositories/organization-members-repository";
import { OrganizationGamesRepository } from "../src/repositories/organization-games-repository";
import { OrganizationsRepository } from "../src/repositories/organizations-repository";
import { UserProfilesRepository } from "../src/repositories/user-profiles-repository";
import { UsersRepository } from "../src/repositories/users-repository";
import { createTestDatabase } from "./support/test-database";

test("users repository supports CRUD over migrated schema", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const repository = new UsersRepository(db);
    const created = await repository.create({
      email: "owner@example.com",
      passwordHash: "hash-1",
      vanity: "u-owner-home",
    });

    assert.equal(created.email, "owner@example.com");
    assert.equal(created.status, "pending_verification");
    assert.equal(created.vanity, "u-owner-home");

    const found = await repository.findByEmail("owner@example.com");
    assert.ok(found);
    assert.equal(found.id, created.id);

    const vanityFound = await repository.findByVanity("u-owner-home");
    assert.ok(vanityFound);
    assert.equal(vanityFound.id, created.id);

    const updated = await repository.update(created.id, {
      displayName: "Owner",
      emailVerifiedAt: "2026-08-20T00:00:00.000Z",
      status: "disabled",
    });

    assert.equal(updated.display_name, "Owner");
    assert.equal(updated.status, "disabled");

    await repository.delete(created.id);
    const deleted = await repository.findById(created.id);
    assert.equal(deleted, null);
  } finally {
    await cleanup();
  }
});

test("user profiles repository supports create and upsert over migrated schema", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const profiles = new UserProfilesRepository(db);
    const user = await users.create({
      email: "locale-owner@example.com",
      passwordHash: "hash-locale-owner",
      vanity: "u-locale-owner",
    });

    const created = await profiles.create({
      preferredLocale: "zh-tw",
      userId: user.id,
    });

    assert.equal(created.preferred_locale, "zh-tw");

    const upserted = await profiles.upsert({
      preferredLocale: "en",
      userId: user.id,
    });

    assert.equal(upserted.preferred_locale, "en");

    const found = await profiles.findByUserId(user.id);
    assert.ok(found);
    assert.equal(found.preferred_locale, "en");
  } finally {
    await cleanup();
  }
});

test("organizations repository supports CRUD over migrated schema", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const owner = await users.create({
      email: "guild-owner@example.com",
      passwordHash: "hash-2",
    });

    const created = await organizations.create({
      createdByUserId: owner.id,
      description: "Raid guild",
      name: "Raid Ledger",
      vanity: "raid-home",
    });

    assert.equal(created.vanity, "raid-home");

    const vanityFound = await organizations.findByVanity("raid-home");
    assert.ok(vanityFound);
    assert.equal(vanityFound.id, created.id);

    const updated = await organizations.update(created.id, {
      description: "Raid guild updated",
      iconUrl: "https://example.com/icon.png",
      name: "Raid Ledger Updated",
      vanity: "raid-ledger-home",
    });

    assert.equal(updated.name, "Raid Ledger Updated");
    assert.equal(updated.icon_url, "https://example.com/icon.png");
    assert.equal(updated.vanity, "raid-ledger-home");

    await organizations.delete(created.id);
    const deleted = await organizations.findById(created.id);
    assert.equal(deleted, null);
  } finally {
    await cleanup();
  }
});

test("organization members repository supports CRUD over migrated schema", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const owner = await users.create({
      email: "member-owner@example.com",
      passwordHash: "hash-3",
    });

    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Member Guild",
    });

    const created = await members.create({
      organizationId: organization.id,
      role: "owner",
      status: "active",
      userId: owner.id,
    });

    assert.equal(created.role, "owner");
    assert.equal(created.status, "active");
    assert.ok(created.approved_at);

    const byComposite = await members.findByOrganizationAndUser(
      organization.id,
      owner.id,
    );
    assert.ok(byComposite);
    assert.equal(byComposite.id, created.id);

    const updated = await members.updateRole(created.id, "admin");
    assert.equal(updated.role, "admin");

    const listed = await members.listByOrganization(organization.id, "active");
    assert.equal(listed.length, 1);

    await members.delete(created.id);
    const deleted = await members.findById(created.id);
    assert.ok(deleted);
    assert.equal(deleted.status, "removed");
    assert.ok(deleted.removed_at);
  } finally {
    await cleanup();
  }
});

test("organization members repository supports pending approval workflow", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const owner = await users.create({
      email: "pending-owner@example.com",
      passwordHash: "hash-pending-owner",
      vanity: "u-pending-owner",
    });
    const applicant = await users.create({
      email: "pending-applicant@example.com",
      passwordHash: "hash-pending-applicant",
      vanity: "u-pending-applicant",
    });

    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Pending Guild",
    });

    const created = await members.create({
      organizationId: organization.id,
      role: "member",
      status: "pending",
      userId: applicant.id,
    });

    assert.equal(created.status, "pending");
    assert.equal(created.approved_at, null);

    const activated = await members.updateStatus(created.id, "active");
    assert.equal(activated.status, "active");
    assert.ok(activated.approved_at);
  } finally {
    await cleanup();
  }
});

test("characters repository supports CRUD over migrated schema", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const games = new GamesRepository(db);
    const characters = new CharactersRepository(db);
    const owner = await users.create({
      email: "character-owner@example.com",
      passwordHash: "hash-4",
    });

    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Character Guild",
    });

    const game = await games.create({
      name: "Final Fantasy XIV",
      slug: "ffxiv",
    });

    const created = await characters.create({
      claimedByUserId: owner.id,
      gameId: game.id,
      name: "Main Tank",
      notes: "Primary raid lead",
      organizationId: organization.id,
      slug: "main-tank",
    });

    assert.equal(created.name, "Main Tank");
    assert.equal(created.is_active, 1);
    assert.equal(created.game_id, game.id);

    const updated = await characters.update(created.id, {
      gameId: null,
      isActive: false,
      name: "Main Tank Alt",
      notes: "Retired main",
    });

    assert.equal(updated.name, "Main Tank Alt");
    assert.equal(updated.is_active, 0);
    assert.equal(updated.game_id, null);

    const listed = await characters.listByOrganization(organization.id);
    assert.equal(listed.length, 1);

    const byGame = await characters.listByGame(game.id);
    assert.equal(byGame.length, 0);

    await characters.delete(created.id);
    const deleted = await characters.findById(created.id);
    assert.equal(deleted, null);
  } finally {
    await cleanup();
  }
});

test("games repository supports CRUD over migrated schema", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const games = new GamesRepository(db);

    const created = await games.create({
      description: "Massively multiplayer online role-playing game",
      name: "World of Warcraft",
      slug: "wow",
      source: "steam",
      sourceId: "12345",
      type: "game",
    });

    assert.equal(created.slug, "wow");
    assert.equal(created.type, "game");
    assert.equal(created.source, "steam");
    assert.equal(created.source_id, "12345");

    const found = await games.findBySlug("wow");
    assert.ok(found);
    assert.equal(found.id, created.id);

    const updated = await games.update(created.id, {
      iconUrl: "https://example.com/wow.png",
      isActive: false,
      name: "World of Warcraft Retail",
      slug: "wow-retail",
      sourceId: "54321",
    });

    assert.equal(updated.name, "World of Warcraft Retail");
    assert.equal(updated.icon_url, "https://example.com/wow.png");
    assert.equal(updated.is_active, 0);
    assert.equal(updated.source_id, "54321");

    await games.delete(created.id);
    const deleted = await games.findById(created.id);
    assert.equal(deleted, null);
  } finally {
    await cleanup();
  }
});

test("organization games repository supports CRUD over migrated schema", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const games = new GamesRepository(db);
    const organizationGames = new OrganizationGamesRepository(db);
    const owner = await users.create({
      email: "organization-games-owner@example.com",
      passwordHash: "hash-5",
    });

    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Multi Game Guild",
    });

    const game = await games.create({
      name: "Monster Hunter Wilds",
      slug: "mhwilds",
    });

    const created = await organizationGames.create({
      displayName: "Wilds Squad",
      gameId: game.id,
      isPrimary: true,
      organizationId: organization.id,
      sortOrder: 10,
    });

    assert.equal(created.display_name, "Wilds Squad");
    assert.equal(created.is_primary, 1);

    const listedByOrganization = await organizationGames.listByOrganization(
      organization.id,
    );
    assert.equal(listedByOrganization.length, 1);

    const listedByGame = await organizationGames.listByGame(game.id);
    assert.equal(listedByGame.length, 1);

    const updated = await organizationGames.update(created.id, {
      displayName: "Wilds Main Team",
      isPrimary: false,
      sortOrder: 20,
    });

    assert.equal(updated.display_name, "Wilds Main Team");
    assert.equal(updated.is_primary, 0);
    assert.equal(updated.sort_order, 20);

    await organizationGames.delete(created.id);
    const deleted = await organizationGames.findById(created.id);
    assert.equal(deleted, null);
  } finally {
    await cleanup();
  }
});
