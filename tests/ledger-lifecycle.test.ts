import assert from "node:assert/strict";
import test from "node:test";
import { AllocationLifecycleService } from "../src/services/ledger/allocation-lifecycle-service";
import { ClaimLifecycleService } from "../src/services/ledger/claim-lifecycle-service";
import { EventLifecycleService } from "../src/services/ledger/event-lifecycle-service";
import { SettlementLifecycleService } from "../src/services/ledger/settlement-lifecycle-service";
import { ConflictError } from "../src/lib/errors";
import { CharactersRepository } from "../src/repositories/characters-repository";
import { GamesRepository } from "../src/repositories/games-repository";
import { OrganizationsRepository } from "../src/repositories/organizations-repository";
import { UsersRepository } from "../src/repositories/users-repository";
import { createTestDatabase } from "./support/test-database";

async function createLedgerFixture() {
  const context = await createTestDatabase();
  const users = new UsersRepository(context.db);
  const organizations = new OrganizationsRepository(context.db);
  const games = new GamesRepository(context.db);
  const characters = new CharactersRepository(context.db);

  const owner = await users.create({
    email: "ledger-owner@example.com",
    passwordHash: "hash-owner",
    status: "active",
    vanity: "u-ledger-owner",
  });
  const organization = await organizations.create({
    createdByUserId: owner.id,
    name: "Ledger Guild",
    slug: "ledger-guild",
    vanity: "ledger-guild-home",
  });
  const game = await games.create({
    name: "Ledger Test Game",
    slug: "ledger-test-game",
  });
  const characterOne = await characters.create({
    claimedByUserId: owner.id,
    gameId: game.id,
    name: "Alpha",
    organizationId: organization.id,
    vanity: "c-alpha",
  });
  const characterTwo = await characters.create({
    claimedByUserId: owner.id,
    gameId: game.id,
    name: "Beta",
    organizationId: organization.id,
    vanity: "c-beta",
  });

  return {
    ...context,
    characterOne,
    characterTwo,
    game,
    organization,
    owner,
  };
}

test("settlement lifecycle requires event readiness before settlement creation", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);

    const event = await eventService.createEvent({
      eventKey: "evt-open-1",
      occurredAt: "2026-08-26T10:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Open Event",
    });

    await assert.rejects(
      () =>
        settlementService.createDraftSettlement({
          decidedAt: "2026-08-26T11:00:00.000Z",
          eventId: event.id,
          grossAmount: 1000,
          netAmount: 1000,
          organizationId: fixture.organization.id,
          settlementKey: "st-open-1",
          title: "Should Fail While Event Open",
        }),
      (error: unknown) =>
        error instanceof ConflictError &&
        error.code === "SETTLEMENT_EVENT_STATUS_INVALID",
    );

    const readyEvent = await eventService.markReadyForSettlement(event.id);
    assert.equal(readyEvent.status, "ready_for_settlement");

    const settlement = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-26T11:00:00.000Z",
      eventId: event.id,
      grossAmount: 1000,
      netAmount: 1000,
      organizationId: fixture.organization.id,
      settlementKey: "st-ready-1",
      title: "Ready Settlement",
    });

    assert.equal(settlement.status, "draft");

    const eventAfterSettlement = await eventService.syncStatusFromSettlements(event.id);
    assert.equal(eventAfterSettlement.status, "partially_settled");
  } finally {
    await fixture.cleanup();
  }
});

test("claim confirmations drive allocation, settlement, and event completion", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);
    const allocationService = new AllocationLifecycleService(fixture.db);
    const claimService = new ClaimLifecycleService(fixture.db);

    const event = await eventService.createEvent({
      eventKey: "evt-flow-1",
      occurredAt: "2026-08-26T12:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Flow Event",
    });
    await eventService.markReadyForSettlement(event.id);

    const settlement = await settlementService.createDraftSettlement({
      allocationMode: "equal",
      decidedAt: "2026-08-26T13:00:00.000Z",
      eventId: event.id,
      grossAmount: 9000,
      netAmount: 9000,
      organizationId: fixture.organization.id,
      settlementKey: "st-flow-1",
      title: "Flow Settlement",
    });
    const calculated = await settlementService.markCalculated(settlement.id);
    assert.equal(calculated.status, "calculated");

    const allocationOne = await allocationService.createPendingAllocation({
      amount: 4500,
      characterId: fixture.characterOne.id,
      settlementId: settlement.id,
      weight: 1,
    });
    const allocationTwo = await allocationService.createPendingAllocation({
      amount: 4500,
      characterId: fixture.characterTwo.id,
      settlementId: settlement.id,
      weight: 1,
    });

    const claimOne = await claimService.recordClaim({
      amount: 4500,
      claimedAt: "2026-08-26T14:00:00.000Z",
      claimedByCharacterId: fixture.characterOne.id,
      settlementAllocationId: allocationOne.id,
    });
    assert.equal(claimOne.status, "recorded");

    const confirmedClaimOne = await claimService.confirmClaim(
      claimOne.id,
      fixture.owner.id,
    );
    assert.equal(confirmedClaimOne.status, "confirmed");

    const settlementPaying = await settlementService.syncStatusFromAllocations(
      settlement.id,
    );
    assert.equal(settlementPaying.status, "paying");

    const claimTwo = await claimService.recordClaim({
      amount: 4500,
      claimedAt: "2026-08-26T15:00:00.000Z",
      claimedByCharacterId: fixture.characterTwo.id,
      settlementAllocationId: allocationTwo.id,
    });
    const confirmedClaimTwo = await claimService.confirmClaim(
      claimTwo.id,
      fixture.owner.id,
    );
    assert.equal(confirmedClaimTwo.status, "confirmed");

    const paidSettlement = await settlementService.syncStatusFromAllocations(
      settlement.id,
    );
    assert.equal(paidSettlement.status, "paid");

    const settledEvent = await eventService.syncStatusFromSettlements(event.id);
    assert.equal(settledEvent.status, "settled");
  } finally {
    await fixture.cleanup();
  }
});

test("settlement cancellation is blocked once payout has started", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);
    const allocationService = new AllocationLifecycleService(fixture.db);
    const claimService = new ClaimLifecycleService(fixture.db);

    const event = await eventService.createEvent({
      eventKey: "evt-cancel-1",
      occurredAt: "2026-08-26T16:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Cancel Event",
    });
    await eventService.markReadyForSettlement(event.id);

    const settlement = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-26T17:00:00.000Z",
      eventId: event.id,
      grossAmount: 3000,
      netAmount: 3000,
      organizationId: fixture.organization.id,
      settlementKey: "st-cancel-1",
      title: "Cancel Settlement",
    });
    await settlementService.markCalculated(settlement.id);

    const allocation = await allocationService.createPendingAllocation({
      amount: 1500,
      characterId: fixture.characterOne.id,
      settlementId: settlement.id,
    });
    await allocationService.createPendingAllocation({
      amount: 1500,
      characterId: fixture.characterTwo.id,
      settlementId: settlement.id,
    });
    const claim = await claimService.recordClaim({
      amount: 1500,
      claimedAt: "2026-08-26T18:00:00.000Z",
      claimedByCharacterId: fixture.characterOne.id,
      settlementAllocationId: allocation.id,
    });
    await claimService.confirmClaim(claim.id, fixture.owner.id);

    await assert.rejects(
      () => settlementService.cancelSettlement(settlement.id),
      (error: unknown) =>
        error instanceof ConflictError &&
        error.code === "INVALID_STATE_TRANSITION",
    );
  } finally {
    await fixture.cleanup();
  }
});
