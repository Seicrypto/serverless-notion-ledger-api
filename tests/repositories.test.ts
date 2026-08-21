import test from "node:test";
import assert from "node:assert/strict";
import { CharactersRepository } from "../src/repositories/characters-repository";
import { OrganizationMembersRepository } from "../src/repositories/organization-members-repository";
import { OrganizationsRepository } from "../src/repositories/organizations-repository";
import { UsersRepository } from "../src/repositories/users-repository";
import { createTestDatabase } from "./support/test-database";

test("users repository supports CRUD over migrated schema", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const repository = new UsersRepository(db);
    const created = await repository.create({
      email: "owner@example.com",
      passwordHash: "hash-1",
    });

    assert.equal(created.email, "owner@example.com");
    assert.equal(created.status, "pending_verification");

    const found = await repository.findByEmail("owner@example.com");
    assert.ok(found);
    assert.equal(found.id, created.id);

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
      slug: "raid-ledger",
    });

    assert.equal(created.slug, "raid-ledger");

    const found = await organizations.findBySlug("raid-ledger");
    assert.ok(found);
    assert.equal(found.id, created.id);

    const updated = await organizations.update(created.id, {
      description: "Raid guild updated",
      iconUrl: "https://example.com/icon.png",
      name: "Raid Ledger Updated",
      slug: "raid-ledger-updated",
    });

    assert.equal(updated.name, "Raid Ledger Updated");
    assert.equal(updated.icon_url, "https://example.com/icon.png");

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
      slug: "member-guild",
    });

    const created = await members.create({
      organizationId: organization.id,
      role: "owner",
      userId: owner.id,
    });

    assert.equal(created.role, "owner");

    const byComposite = await members.findByOrganizationAndUser(
      organization.id,
      owner.id,
    );
    assert.ok(byComposite);
    assert.equal(byComposite.id, created.id);

    const updated = await members.updateRole(created.id, "admin");
    assert.equal(updated.role, "admin");

    const listed = await members.listByOrganization(organization.id);
    assert.equal(listed.length, 1);

    await members.delete(created.id);
    const deleted = await members.findById(created.id);
    assert.equal(deleted, null);
  } finally {
    await cleanup();
  }
});

test("characters repository supports CRUD over migrated schema", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const characters = new CharactersRepository(db);
    const owner = await users.create({
      email: "character-owner@example.com",
      passwordHash: "hash-4",
    });

    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Character Guild",
      slug: "character-guild",
    });

    const created = await characters.create({
      claimedByUserId: owner.id,
      name: "Main Tank",
      notes: "Primary raid lead",
      organizationId: organization.id,
      slug: "main-tank",
    });

    assert.equal(created.name, "Main Tank");
    assert.equal(created.is_active, 1);

    const updated = await characters.update(created.id, {
      isActive: false,
      name: "Main Tank Alt",
      notes: "Retired main",
    });

    assert.equal(updated.name, "Main Tank Alt");
    assert.equal(updated.is_active, 0);

    const listed = await characters.listByOrganization(organization.id);
    assert.equal(listed.length, 1);

    await characters.delete(created.id);
    const deleted = await characters.findById(created.id);
    assert.equal(deleted, null);
  } finally {
    await cleanup();
  }
});
