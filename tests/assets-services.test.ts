import assert from "node:assert/strict";
import test from "node:test";
import { AssetAliasesRepository } from "../src/repositories/asset-aliases-repository";
import { AssetsRepository } from "../src/repositories/assets-repository";
import { GamesRepository } from "../src/repositories/games-repository";
import { OrganizationGamesRepository } from "../src/repositories/organization-games-repository";
import { OrganizationsRepository } from "../src/repositories/organizations-repository";
import { UsersRepository } from "../src/repositories/users-repository";
import { AssetDuplicateDetectionService } from "../src/services/assets/asset-duplicate-detection-service";
import { AssetTrustLifecycleService } from "../src/services/assets/asset-trust-lifecycle-service";
import { AssetLifecycleService } from "../src/services/assets/asset-lifecycle-service";
import {
  AssetNormalizationService,
  normalizeAssetName,
} from "../src/services/assets/asset-normalization-service";
import { createTestDatabase } from "./support/test-database";
import { EventLifecycleService } from "../src/services/ledger/event-lifecycle-service";

test("asset normalization keeps multilingual text while normalizing spacing and punctuation", () => {
  const service = new AssetNormalizationService();

  assert.equal(service.normalizeName("  Heart-Gem  "), "heart gem");
  assert.equal(service.normalizeName("HEART　GEM"), "heart gem");
  assert.equal(service.normalizeName("稀有－寶石"), "稀有 寶石");
  assert.equal(normalizeAssetName("Ｆｉｒｅ　Ｏｒｂ"), "fire orb");
});

test("asset duplicate detection returns exact canonical matches", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const games = new GamesRepository(db);
    const assets = new AssetsRepository(db);

    const owner = await users.create({
      email: "assets-owner@example.com",
      passwordHash: "hash-assets-owner",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Assets Guild",
    });
    const game = await games.create({
      name: "Asset Game",
      slug: "asset-game",
    });

    await assets.create({
      assetKey: "asset-game-heart-gem",
      gameId: game.id,
      name: "Heart Gem",
      normalizedName: "heart gem",
      organizationId: organization.id,
      scope: "global",
    });

    const service = new AssetDuplicateDetectionService(db);
    const result = await service.detect({
      gameId: game.id,
      name: " heart-gem ",
      organizationId: organization.id,
    });

    assert.ok(result.exactMatch);
    assert.equal(result.exactMatch?.asset.name, "Heart Gem");
    assert.equal(result.exactMatch?.matchedBy, "canonical_exact");
    assert.equal(result.recommendedAction, "use_existing");
  } finally {
    await cleanup();
  }
});

test("asset duplicate detection returns exact alias matches", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const games = new GamesRepository(db);
    const assets = new AssetsRepository(db);
    const aliases = new AssetAliasesRepository(db);

    const owner = await users.create({
      email: "assets-alias-owner@example.com",
      passwordHash: "hash-assets-alias-owner",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Alias Guild",
    });
    const game = await games.create({
      name: "Alias Game",
      slug: "alias-game",
    });

    const asset = await assets.create({
      assetKey: "alias-game-chaos-orb",
      assetType: "currency",
      gameId: game.id,
      name: "Chaos Orb",
      normalizedName: "chaos orb",
      organizationId: organization.id,
      scope: "global",
    });

    await aliases.create({
      alias: "混沌石",
      assetId: asset.id,
      aliasType: "localized",
      normalizedAlias: "混沌石",
    });

    const service = new AssetDuplicateDetectionService(db);
    const result = await service.detect({
      gameId: game.id,
      name: "混沌石",
      organizationId: organization.id,
    });

    assert.ok(result.exactMatch);
    assert.equal(result.exactMatch?.asset.id, asset.id);
    assert.equal(result.exactMatch?.matchedBy, "alias_exact");
    assert.equal(result.recommendedAction, "use_existing");
  } finally {
    await cleanup();
  }
});

test("asset duplicate detection returns possible matches and ignores merged or other-org assets", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const games = new GamesRepository(db);
    const assets = new AssetsRepository(db);

    const owner = await users.create({
      email: "assets-possible-owner@example.com",
      passwordHash: "hash-assets-possible-owner",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Possible Guild",
    });
    const otherOrganization = await organizations.create({
      createdByUserId: owner.id,
      name: "Other Guild",
    });
    const game = await games.create({
      name: "Possible Game",
      slug: "possible-game",
    });

    await assets.create({
      assetKey: "possible-game-ancient-dragon-blade",
      gameId: game.id,
      name: "Ancient Dragon Blade",
      normalizedName: "ancient dragon blade",
      scope: "global",
    });
    await assets.create({
      assetKey: "possible-game-local-token",
      gameId: game.id,
      name: "Guild Token",
      normalizedName: "guild token",
      organizationId: otherOrganization.id,
      scope: "organization",
    });
    await assets.create({
      assetKey: "possible-game-merged-blade",
      gameId: game.id,
      name: "Ancient Blade",
      normalizedName: "ancient blade",
      scope: "global",
      status: "merged",
    });

    const service = new AssetDuplicateDetectionService(db);
    const result = await service.detect({
      gameId: game.id,
      name: "Ancient Blade",
      organizationId: organization.id,
    });

    assert.equal(result.exactMatch, null);
    assert.equal(result.recommendedAction, "confirm_create");
    assert.equal(result.possibleMatches.length, 1);
    assert.equal(result.possibleMatches[0]?.asset.name, "Ancient Dragon Blade");
    assert.equal(result.possibleMatches[0]?.matchedBy, "possible");
  } finally {
    await cleanup();
  }
});

test("asset lifecycle creates organization-scoped assets and adds a primary alias", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const games = new GamesRepository(db);
    const lifecycle = new AssetLifecycleService(db);

    const owner = await users.create({
      email: "assets-lifecycle-owner@example.com",
      passwordHash: "hash-assets-lifecycle-owner",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Lifecycle Guild",
    });
    const game = await games.create({
      name: "Lifecycle Game",
      slug: "lifecycle-game",
    });

    const result = await lifecycle.createAsset({
      assetType: "item",
      gameId: game.id,
      name: "Boss Heart",
      organizationId: organization.id,
    });

    assert.equal(result.kind, "created");
    if (result.kind !== "created") {
      return;
    }

    assert.equal(result.asset.scope, "organization");
    assert.equal(result.asset.organization_id, organization.id);
    assert.equal(result.asset.normalized_name, "boss heart");
    assert.equal(result.asset.status, "candidate");
    assert.ok(result.asset.asset_key.startsWith("lifecycle-game-boss-heart-"));
    assert.ok(result.primaryAlias);
    assert.equal(result.primaryAlias?.is_primary, 1);
    assert.equal(result.primaryAlias?.normalized_alias, "boss heart");
  } finally {
    await cleanup();
  }
});

test("asset lifecycle returns duplicate results instead of creating repeated assets", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const games = new GamesRepository(db);
    const lifecycle = new AssetLifecycleService(db);

    const owner = await users.create({
      email: "assets-duplicate-owner@example.com",
      passwordHash: "hash-assets-duplicate-owner",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Duplicate Guild",
    });
    const game = await games.create({
      name: "Duplicate Game",
      slug: "duplicate-game",
    });

    const created = await lifecycle.createAsset({
      gameId: game.id,
      name: "Sun Stone",
      organizationId: organization.id,
    });
    assert.equal(created.kind, "created");

    const duplicate = await lifecycle.createAsset({
      gameId: game.id,
      name: "sun-stone",
      organizationId: organization.id,
    });

    assert.equal(duplicate.kind, "duplicate");
    if (duplicate.kind !== "duplicate") {
      return;
    }

    assert.ok(duplicate.duplicate.exactMatch);
    assert.equal(duplicate.duplicate.recommendedAction, "use_existing");
  } finally {
    await cleanup();
  }
});

test("asset lifecycle resolves canonical assets and merges source aliases into target", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const games = new GamesRepository(db);
    const assets = new AssetsRepository(db);
    const aliases = new AssetAliasesRepository(db);
    const lifecycle = new AssetLifecycleService(db);

    const owner = await users.create({
      email: "assets-merge-owner@example.com",
      passwordHash: "hash-assets-merge-owner",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Merge Guild",
    });
    const game = await games.create({
      name: "Merge Game",
      slug: "merge-game",
    });

    const target = await assets.create({
      assetKey: "merge-game-heart-gem",
      gameId: game.id,
      name: "Heart Gem",
      normalizedName: "heart gem",
      organizationId: organization.id,
      scope: "global",
    });
    const source = await assets.create({
      assetKey: "merge-game-heart-jewel",
      gameId: game.id,
      name: "Heart Jewel",
      normalizedName: "heart jewel",
      organizationId: organization.id,
      scope: "organization",
    });

    await aliases.create({
      alias: "心之寶珠",
      assetId: source.id,
      aliasType: "localized",
      normalizedAlias: "心之寶珠",
    });

    const merged = await lifecycle.mergeAsset({
      mergedByUserId: owner.id,
      sourceAssetId: source.id,
      targetAssetId: target.id,
    });

    assert.equal(merged.sourceAsset.status, "merged");
    assert.equal(merged.sourceAsset.canonical_asset_id, target.id);
    assert.equal(merged.targetAsset.id, target.id);

    const resolved = await lifecycle.resolveCanonicalAsset(source.id);
    assert.equal(resolved.id, target.id);

    const targetAliases = await aliases.listByAsset(target.id);
    assert.ok(targetAliases.some((alias) => alias.normalized_alias === "心之寶珠"));
  } finally {
    await cleanup();
  }
});

test("asset lifecycle resolves organization or global default settlement units", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const games = new GamesRepository(db);
    const organizationGames = new OrganizationGamesRepository(db);
    const assets = new AssetsRepository(db);
    const lifecycle = new AssetLifecycleService(db);

    const owner = await users.create({
      email: "assets-unit-owner@example.com",
      passwordHash: "hash-assets-unit-owner",
      status: "active",
    });
    const organization = await organizations.create({
      createdByUserId: owner.id,
      name: "Unit Guild",
    });
    const game = await games.create({
      name: "Unit Game",
      slug: "unit-game",
    });
    await organizationGames.create({
      gameId: game.id,
      isPrimary: true,
      organizationId: organization.id,
    });

    const globalUnit = await assets.create({
      assetKey: "unit-game-coin",
      assetType: "currency",
      gameId: game.id,
      isDefaultSettlementUnit: true,
      name: "Unit Coin",
      normalizedName: "unit coin",
      scope: "global",
    });
    const organizationUnit = await assets.create({
      assetKey: "unit-game-guild-point",
      assetType: "currency",
      gameId: game.id,
      isDefaultSettlementUnit: true,
      name: "Guild Point",
      normalizedName: "guild point",
      organizationId: organization.id,
      scope: "organization",
    });

    const resolvedForOrg = await lifecycle.resolveDefaultSettlementUnit({
      gameId: game.id,
      organizationId: organization.id,
    });
    assert.equal(resolvedForOrg?.id, organizationUnit.id);

    const resolvedGlobal = await lifecycle.resolveDefaultSettlementUnit({
      gameId: game.id,
    });
    assert.equal(resolvedGlobal?.id, globalUnit.id);
  } finally {
    await cleanup();
  }
});

test("asset trust lifecycle promotes from candidate to org_verified and active based on usage", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const organizations = new OrganizationsRepository(db);
    const games = new GamesRepository(db);
    const lifecycle = new AssetLifecycleService(db);
    const trust = new AssetTrustLifecycleService(db);
    const events = new EventLifecycleService(db);

    const ownerOne = await users.create({
      email: "assets-trust-owner-one@example.com",
      passwordHash: "hash-assets-trust-owner-one",
      status: "active",
    });
    const ownerTwo = await users.create({
      email: "assets-trust-owner-two@example.com",
      passwordHash: "hash-assets-trust-owner-two",
      status: "active",
    });
    const ownerThree = await users.create({
      email: "assets-trust-owner-three@example.com",
      passwordHash: "hash-assets-trust-owner-three",
      status: "active",
    });

    const organizationOne = await organizations.create({
      createdByUserId: ownerOne.id,
      name: "Trust Guild One",
    });
    const organizationTwo = await organizations.create({
      createdByUserId: ownerTwo.id,
      name: "Trust Guild Two",
    });
    const game = await games.create({
      name: "Trust Game",
      slug: "trust-game",
    });

    const created = await lifecycle.createAsset({
      createdByUserId: ownerOne.id,
      gameId: game.id,
      name: "Moon Crystal",
      organizationId: organizationOne.id,
    });
    assert.equal(created.kind, "created");
    if (created.kind !== "created") {
      return;
    }

    const assetId = created.asset.id;
    assert.equal(created.asset.status, "candidate");

    await events.createEvent({
      assetId,
      createdByUserId: ownerOne.id,
      gameId: game.id,
      occurredAt: "2026-08-27T01:00:00.000Z",
      organizationId: organizationOne.id,
      title: "Trust Event One",
    });

    let asset = await trust.recomputeStatus(assetId);
    assert.equal(asset.status, "candidate");

    await events.createEvent({
      assetId,
      createdByUserId: ownerThree.id,
      gameId: game.id,
      occurredAt: "2026-08-27T02:00:00.000Z",
      organizationId: organizationOne.id,
      title: "Trust Event Two",
    });

    asset = await trust.recomputeStatus(assetId);
    assert.equal(asset.status, "org_verified");

    await events.createEvent({
      assetId,
      createdByUserId: ownerTwo.id,
      gameId: game.id,
      occurredAt: "2026-08-27T03:00:00.000Z",
      organizationId: organizationTwo.id,
      title: "Trust Event Three",
    });

    asset = await trust.recomputeStatus(assetId);
    assert.equal(asset.status, "active");
  } finally {
    await cleanup();
  }
});
