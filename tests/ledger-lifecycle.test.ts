import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseClient } from "../src/infrastructure/database/database-client";
import { AllocationLifecycleService } from "../src/services/ledger/allocation-lifecycle-service";
import { ClaimLifecycleService } from "../src/services/ledger/claim-lifecycle-service";
import { ClaimableRecipientsQueryService } from "../src/services/ledger/claimable-recipients-query-service";
import { EventLifecycleService } from "../src/services/ledger/event-lifecycle-service";
import { DashboardQueryService } from "../src/services/ledger/dashboard-query-service";
import { EventSettlementOrchestrationService } from "../src/services/ledger/event-settlement-orchestration-service";
import { SettlementDisbursementService } from "../src/services/ledger/settlement-disbursement-service";
import { SettlementLifecycleService } from "../src/services/ledger/settlement-lifecycle-service";
import { AppError, ConflictError } from "../src/lib/errors";
import { SettlementAllocationsRepository } from "../src/repositories/settlement-allocations-repository";
import { SettlementClaimsRepository } from "../src/repositories/settlement-claims-repository";
import { AssetsRepository } from "../src/repositories/assets-repository";
import { CharactersRepository } from "../src/repositories/characters-repository";
import { EventParticipantsRepository } from "../src/repositories/event-participants-repository";
import { GamesRepository } from "../src/repositories/games-repository";
import { OrganizationGamesRepository } from "../src/repositories/organization-games-repository";
import { OrganizationsRepository } from "../src/repositories/organizations-repository";
import { UsersRepository } from "../src/repositories/users-repository";
import { createTestDatabase } from "./support/test-database";
import {
  assertEventEditable,
  assertSettlementEditable,
  buildEventDetailResponse,
  buildSettlementWorkspaceResponseData,
  listEventParticipantSummaryMap,
  listLedgerEventSummaryLookup,
  mapEventStatusGroup,
} from "../src/modules/ledger/route";
import { D1Client } from "../src/infrastructure/d1/d1-client";

async function createLedgerFixture() {
  const context = await createTestDatabase();
  const users = new UsersRepository(context.db);
  const organizations = new OrganizationsRepository(context.db);
  const games = new GamesRepository(context.db);
  const organizationGames = new OrganizationGamesRepository(context.db);
  const assets = new AssetsRepository(context.db);
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
    vanity: "ledger-guild-home",
  });
  const game = await games.create({
    name: "Ledger Test Game",
    slug: "ledger-test-game",
  });
  await organizationGames.create({
    gameId: game.id,
    isPrimary: true,
    organizationId: organization.id,
  });
  await assets.create({
    assetKey: "ledger-test-game-coin",
    assetType: "currency",
    gameId: game.id,
    isDefaultSettlementUnit: true,
    name: "Coin",
    normalizedName: "coin",
    scope: "global",
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

async function addEventParticipants(
  db: DatabaseClient,
  eventId: number,
  characterIds: number[],
) {
  const participants = new EventParticipantsRepository(db);
  for (const characterId of characterIds) {
    await participants.create({
      characterId,
      eventId,
      weight: 1,
    });
  }
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

test("settlement lifecycle can auto-ready an open event through settleEvent", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);

    const event = await eventService.createEvent({
      occurredAt: "2026-08-26T12:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Auto Ready Settlement Event",
    });

    const settlement = await settlementService.settleEvent({
      decidedAt: "2026-08-26T13:00:00.000Z",
      eventId: event.id,
      grossAmount: 500,
      netAmount: 500,
      organizationId: fixture.organization.id,
      settlementKey: "st-auto-ready-1",
      title: "Auto Ready Settlement",
    });

    assert.equal(settlement.status, "draft");

    const eventAfterSettlement = await eventService.syncStatusFromSettlements(event.id);
    assert.equal(eventAfterSettlement.status, "partially_settled");
  } finally {
    await fixture.cleanup();
  }
});

test("high-level settle flow creates a calculated settlement with pending allocations", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const dashboardService = new DashboardQueryService(fixture.db);
    const claimableService = new ClaimableRecipientsQueryService(fixture.db);

    const event = await eventService.createEvent({
      occurredAt: "2026-08-26T12:30:00.000Z",
      organizationId: fixture.organization.id,
      title: "High Level Settle Event",
    });
    await addEventParticipants(fixture.db, event.id, [
      fixture.characterOne.id,
      fixture.characterTwo.id,
    ]);

    const result = await new EventSettlementOrchestrationService(
      fixture.db,
    ).settleEventWithAllocations({
      allocationMode: "equal",
      decidedAt: "2026-08-26T13:30:00.000Z",
      eventId: event.id,
      grossAmount: 2000,
      netAmount: 2000,
      organizationId: fixture.organization.id,
      recipients: [
        { characterId: fixture.characterOne.id },
        { characterId: fixture.characterTwo.id },
      ],
      title: "High Level Settle Settlement",
    });

    assert.equal(result.settlement.status, "calculated");
    assert.equal(result.allocations.length, 2);
    assert.equal(result.allocations[0]?.amount, 1000);
    assert.equal(result.allocations[1]?.amount, 1000);
    assert.equal(result.event.status, "partially_settled");

    const summary = await dashboardService.getOrganizationSummary({
      organization: {
        id: fixture.organization.id,
        name: fixture.organization.name,
        vanity: fixture.organization.vanity,
      },
    });
    assert.equal(summary.summary.unsettledEventCount, 0);
    assert.equal(summary.summary.disbursementNotStartedCount, 1);

    const claimableRecipients = await claimableService.listClaimableRecipients(
      fixture.organization.id,
    );
    assert.equal(claimableRecipients.length, 2);
    assert.equal(claimableRecipients[0]?.pendingClaimAmountTotal, 1000);
    assert.equal(claimableRecipients[1]?.pendingClaimAmountTotal, 1000);
  } finally {
    await fixture.cleanup();
  }
});

test("event lifecycle can auto-assign keys and transition through route-facing statuses", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);

    const event = await eventService.createEvent({
      occurredAt: "2026-08-26T09:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Auto Key Event",
    });

    assert.match(event.event_key, /^evt-[a-f0-9-]+$/);
    assert.equal(event.game_id, fixture.game.id);
    assert.equal(event.status, "open");

    const ready = await eventService.transitionStatus(
      event.id,
      "ready_for_settlement",
    );
    assert.equal(ready.status, "ready_for_settlement");

    await assert.rejects(
      () => eventService.transitionStatus(event.id, "settled"),
      (error: unknown) =>
        error instanceof ConflictError && error.code === "EVENT_STATUS_MANAGED",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("event detail and summary expose participant suggestions for settlement workflows", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const event = await eventService.createEvent({
      assetId: 1,
      eventKey: "evt-detail-1",
      gameId: fixture.game.id,
      holderRef: String(fixture.characterOne.id),
      holderType: "character",
      occurredAt: "2026-08-26T09:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Detail Event",
    });
    await addEventParticipants(fixture.db, event.id, [
      fixture.characterOne.id,
      fixture.characterTwo.id,
    ]);

    const detail = await buildEventDetailResponse(
      fixture.db as unknown as D1Client,
      event,
    );
    assert.deepEqual(detail.participantCharacterIds, [
      fixture.characterOne.id,
      fixture.characterTwo.id,
    ]);
    assert.equal(detail.participantCount, 2);
    assert.deepEqual(detail.recommendedRecipientCharacterIds, [
      fixture.characterOne.id,
      fixture.characterTwo.id,
    ]);
    assert.equal(detail.requiresParticipantConfirmation, false);
    assert.equal(detail.holder.character?.id, fixture.characterOne.id);
    assert.equal(detail.game?.id, fixture.game.id);
    assert.equal(detail.asset?.id, 1);

    const summaryMap = await listEventParticipantSummaryMap(
      fixture.db as unknown as D1Client,
      [event.id],
    );
    assert.deepEqual(summaryMap.get(event.id), {
      participantCharacterIds: [fixture.characterOne.id, fixture.characterTwo.id],
      participantCount: 2,
    });
  } finally {
    await fixture.cleanup();
  }
});

test("event summary lookup returns compact user-facing event rows with game and time filters", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const games = new GamesRepository(fixture.db);
    const assets = new AssetsRepository(fixture.db);

    const otherGame = await games.create({
      name: "Other Ledger Game",
      slug: "other-ledger-game",
    });
    const lookupAsset = await assets.create({
      assetKey: "lookup-asset-coin",
      assetType: "currency",
      gameId: fixture.game.id,
      name: "Lookup Coin",
      normalizedName: "lookup coin",
      scope: "organization",
      organizationId: fixture.organization.id,
    });

    await eventService.createEvent({
      assetId: lookupAsset.id,
      gameId: otherGame.id,
      holderRef: "external-trader",
      holderType: "external",
      occurredAt: "2026-08-25T10:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Other Game Event",
    });

    await eventService.createEvent({
      assetId: lookupAsset.id,
      gameId: fixture.game.id,
      holderRef: String(fixture.characterOne.id),
      holderType: "character",
      occurredAt: "2026-08-26T10:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Older Matching Event",
    });

    await eventService.createEvent({
      assetId: lookupAsset.id,
      gameId: fixture.game.id,
      holderRef: String(fixture.characterTwo.id),
      holderType: "character",
      occurredAt: "2026-08-27T10:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Newest Matching Event",
    });

    const result = await listLedgerEventSummaryLookup({
      db: fixture.db as unknown as D1Client,
      fromOccurredAt: "2026-08-26T00:00:00.000Z",
      gameId: fixture.game.id,
      limit: 1,
      offset: 0,
      organizationId: fixture.organization.id,
      toOccurredAt: "2026-08-27T23:59:59.999Z",
    });

    assert.equal(result.events.length, 1);
    assert.equal(result.pagination.hasMore, true);
    assert.equal(result.events[0]?.event.title, "Newest Matching Event");
    assert.equal(result.events[0]?.event.id !== undefined, true);
    assert.equal(result.events[0]?.occurredAt, "2026-08-27T10:00:00.000Z");
    assert.equal(result.events[0]?.holder.id, fixture.characterTwo.id);
    assert.equal(result.events[0]?.holder.label, fixture.characterTwo.name);
    assert.equal(result.events[0]?.asset?.id, lookupAsset.id);
    assert.equal(result.events[0]?.asset?.name, "Lookup Coin");

    const secondPage = await listLedgerEventSummaryLookup({
      db: fixture.db as unknown as D1Client,
      gameId: fixture.game.id,
      limit: 10,
      offset: 1,
      organizationId: fixture.organization.id,
    });

    assert.equal(secondPage.events.length, 1);
    assert.equal(secondPage.events[0]?.event.title, "Older Matching Event");
  } finally {
    await fixture.cleanup();
  }
});

test("event editing is only allowed while open or ready for settlement", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);

    const openEvent = await eventService.createEvent({
      occurredAt: "2026-08-26T09:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Editable Open Event",
    });
    assert.doesNotThrow(() => assertEventEditable(openEvent));

    const readyEvent = await eventService.markReadyForSettlement(openEvent.id);
    assert.doesNotThrow(() => assertEventEditable(readyEvent));
    await addEventParticipants(fixture.db, readyEvent.id, [fixture.characterOne.id]);

    const settlement = await new SettlementLifecycleService(fixture.db).createDraftSettlement({
      decidedAt: "2026-08-26T10:00:00.000Z",
      eventId: readyEvent.id,
      grossAmount: 100,
      netAmount: 100,
      organizationId: fixture.organization.id,
      title: "Locks Event Editing",
    });
    assert.equal(settlement.status, "draft");

    const partiallySettledEvent = await eventService.syncStatusFromSettlements(
      readyEvent.id,
    );
    assert.throws(
      () => assertEventEditable(partiallySettledEvent),
      (error: unknown) =>
        error instanceof AppError && error.code === "EVENT_NOT_EDITABLE",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("allocations require matching event participants unless settlement exception was confirmed", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);
    const allocationService = new AllocationLifecycleService(fixture.db);
    const participants = new EventParticipantsRepository(fixture.db);

    const event = await eventService.createEvent({
      occurredAt: "2026-08-26T09:30:00.000Z",
      organizationId: fixture.organization.id,
      title: "Participant Guard Event",
    });
    await participants.create({
      characterId: fixture.characterOne.id,
      eventId: event.id,
      weight: 1,
    });
    await eventService.markReadyForSettlement(event.id);

    const strictSettlement = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-26T10:00:00.000Z",
      eventId: event.id,
      grossAmount: 1000,
      netAmount: 1000,
      organizationId: fixture.organization.id,
      title: "Strict Participant Settlement",
    });

    await assert.rejects(
      () =>
        allocationService.createPendingAllocation({
          amount: 1000,
          characterId: fixture.characterTwo.id,
          settlementId: strictSettlement.id,
        }),
      (error: unknown) =>
        error instanceof ConflictError &&
        error.code === "SETTLEMENT_EVENT_PARTICIPANT_MISMATCH",
    );

    const exceptionSettlement = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-26T10:30:00.000Z",
      eventId: event.id,
      grossAmount: 1000,
      netAmount: 1000,
      organizationId: fixture.organization.id,
      participantExceptionConfirmed: true,
      participantExceptionReason: "Manual exception approved before allocation.",
      title: "Exception Participant Settlement",
    });

    const allocation = await allocationService.createPendingAllocation({
      amount: 1000,
      characterId: fixture.characterTwo.id,
      settlementId: exceptionSettlement.id,
    });

    assert.equal(allocation.character_id, fixture.characterTwo.id);
  } finally {
    await fixture.cleanup();
  }
});

test("disbursement requires event participants when no settlement exception was confirmed", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);
    const disbursementService = new SettlementDisbursementService(fixture.db);
    const participants = new EventParticipantsRepository(fixture.db);

    const event = await eventService.createEvent({
      occurredAt: "2026-08-26T11:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Disbursement Guard Event",
    });
    await participants.create({
      characterId: fixture.characterOne.id,
      eventId: event.id,
      weight: 1,
    });
    await eventService.markReadyForSettlement(event.id);

    const settlement = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-26T11:30:00.000Z",
      eventId: event.id,
      grossAmount: 2000,
      netAmount: 2000,
      organizationId: fixture.organization.id,
      title: "Disbursement Guard Settlement",
    });

    await assert.rejects(
      () =>
        disbursementService.disburseSettlement({
          claimedAt: "2026-08-26T12:00:00.000Z",
          items: [
            {
              amount: 2000,
              characterId: fixture.characterTwo.id,
            },
          ],
          organizationId: fixture.organization.id,
          settlementId: settlement.id,
        }),
      (error: unknown) =>
        error instanceof ConflictError &&
        error.code === "SETTLEMENT_EVENT_PARTICIPANT_MISMATCH",
    );
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
    await addEventParticipants(fixture.db, event.id, [
      fixture.characterOne.id,
      fixture.characterTwo.id,
    ]);
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

test("settlement disbursement can create allocations and recorded claims from draft", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);
    const disbursementService = new SettlementDisbursementService(fixture.db);
    const allocationsRepository = new SettlementAllocationsRepository(fixture.db);
    const claimsRepository = new SettlementClaimsRepository(fixture.db);

    const event = await eventService.createEvent({
      eventKey: "evt-disburse-create-1",
      occurredAt: "2026-08-27T12:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Disburse Create Event",
    });
    await addEventParticipants(fixture.db, event.id, [
      fixture.characterOne.id,
      fixture.characterTwo.id,
    ]);
    await eventService.markReadyForSettlement(event.id);

    const settlement = await settlementService.createDraftSettlement({
      allocationMode: "equal",
      decidedAt: "2026-08-27T13:00:00.000Z",
      eventId: event.id,
      grossAmount: 1000,
      netAmount: 1000,
      organizationId: fixture.organization.id,
      settlementKey: "st-disburse-create-1",
      title: "Disburse Create Settlement",
    });

    const result = await disbursementService.disburseSettlement({
      claimedAt: "2026-08-27T14:00:00.000Z",
      items: [
        { amount: 500, characterId: fixture.characterOne.id, weight: 1 },
        { amount: 500, characterId: fixture.characterTwo.id, weight: 1 },
      ],
      method: "manual",
      notes: "first payout batch",
      organizationId: fixture.organization.id,
      settlementId: settlement.id,
    });

    assert.equal(result.allocationMode, "created");
    assert.equal(result.allocations.length, 2);
    assert.equal(result.claims.length, 2);
    assert.equal(result.claims[0]?.status, "recorded");
    assert.equal(result.settlement.status, "paying");
    assert.equal(result.settlementStatusChanged, true);

    const allocations = await allocationsRepository.listBySettlement(settlement.id);
    assert.equal(allocations.length, 2);

    const claimsOne = await claimsRepository.listByAllocation(result.allocations[0]!.id);
    const claimsTwo = await claimsRepository.listByAllocation(result.allocations[1]!.id);
    assert.equal(claimsOne.length, 1);
    assert.equal(claimsTwo.length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("settlement disbursement can match existing allocations and reject amount mismatches", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);
    const allocationService = new AllocationLifecycleService(fixture.db);
    const disbursementService = new SettlementDisbursementService(fixture.db);

    const event = await eventService.createEvent({
      eventKey: "evt-disburse-match-1",
      occurredAt: "2026-08-27T15:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Disburse Match Event",
    });
    await addEventParticipants(fixture.db, event.id, [
      fixture.characterOne.id,
      fixture.characterTwo.id,
    ]);
    await eventService.markReadyForSettlement(event.id);

    const settlement = await settlementService.createDraftSettlement({
      allocationMode: "manual",
      decidedAt: "2026-08-27T16:00:00.000Z",
      eventId: event.id,
      grossAmount: 900,
      netAmount: 900,
      organizationId: fixture.organization.id,
      settlementKey: "st-disburse-match-1",
      title: "Disburse Match Settlement",
    });
    await settlementService.markCalculated(settlement.id);

    await allocationService.createPendingAllocation({
      amount: 400,
      characterId: fixture.characterOne.id,
      settlementId: settlement.id,
      weight: 1,
    });
    await allocationService.createPendingAllocation({
      amount: 500,
      characterId: fixture.characterTwo.id,
      settlementId: settlement.id,
      weight: 1,
    });

    await assert.rejects(
      () =>
        disbursementService.disburseSettlement({
          claimedAt: "2026-08-27T17:00:00.000Z",
          items: [
            { amount: 401, characterId: fixture.characterOne.id, weight: 1 },
            { amount: 500, characterId: fixture.characterTwo.id, weight: 1 },
          ],
          organizationId: fixture.organization.id,
          settlementId: settlement.id,
        }),
      (error: unknown) =>
        error instanceof ConflictError &&
        error.code === "SETTLEMENT_DISBURSE_AMOUNT_MISMATCH",
    );

    const result = await disbursementService.disburseSettlement({
      claimedAt: "2026-08-27T17:30:00.000Z",
      items: [
        { amount: 400, characterId: fixture.characterOne.id, weight: 1 },
        { amount: 500, characterId: fixture.characterTwo.id, weight: 1 },
      ],
      method: "trade",
      organizationId: fixture.organization.id,
      settlementId: settlement.id,
    });

    assert.equal(result.allocationMode, "matched");
    assert.equal(result.allocations.length, 2);
    assert.equal(result.claims.length, 2);
    assert.equal(result.settlement.status, "paying");
  } finally {
    await fixture.cleanup();
  }
});

test("dashboard summary counts unsettled events and disbursement states", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);
    const allocationService = new AllocationLifecycleService(fixture.db);
    const claimService = new ClaimLifecycleService(fixture.db);
    const dashboardService = new DashboardQueryService(fixture.db);

    const openEvent = await eventService.createEvent({
      eventKey: "evt-dashboard-open-1",
      occurredAt: "2026-08-27T09:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Open Dashboard Event",
    });
    assert.equal(openEvent.status, "open");

    const readyEvent = await eventService.createEvent({
      eventKey: "evt-dashboard-ready-1",
      occurredAt: "2026-08-27T10:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Ready Dashboard Event",
    });
    await addEventParticipants(fixture.db, readyEvent.id, [fixture.characterTwo.id]);
    await eventService.markReadyForSettlement(readyEvent.id);

    const settlementOne = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-27T11:00:00.000Z",
      eventId: readyEvent.id,
      grossAmount: 1000,
      netAmount: 1000,
      organizationId: fixture.organization.id,
      payerRef: String(fixture.characterOne.id),
      payerType: "character",
      settlementKey: "st-dashboard-1",
      title: "Dashboard Settlement One",
    });
    await settlementService.markCalculated(settlementOne.id);
    const allocationOne = await allocationService.createPendingAllocation({
      amount: 1000,
      characterId: fixture.characterTwo.id,
      settlementId: settlementOne.id,
    });
    await claimService.recordClaim({
      amount: 1000,
      claimedAt: "2026-08-27T11:30:00.000Z",
      claimedByCharacterId: fixture.characterTwo.id,
      settlementAllocationId: allocationOne.id,
    });

    const settlementTwo = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-27T12:00:00.000Z",
      grossAmount: 500,
      netAmount: 500,
      organizationId: fixture.organization.id,
      payerRef: String(fixture.characterOne.id),
      payerType: "character",
      settlementKey: "st-dashboard-2",
      title: "Dashboard Settlement Two",
    });
    await settlementService.markCalculated(settlementTwo.id);

    const summary = await dashboardService.getOrganizationSummary({
      organization: {
        id: fixture.organization.id,
        name: fixture.organization.name,
        vanity: fixture.organization.vanity,
      },
    });

    assert.equal(summary.summary.settlementCount, 2);
    assert.equal(summary.summary.unsettledEventCount, 1);
    assert.equal(summary.summary.disbursementInProgressCount, 1);
    assert.equal(summary.summary.disbursementNotStartedCount, 1);
    assert.equal(summary.summary.revenueUnitBreakdown.length, 2);
  } finally {
    await fixture.cleanup();
  }
});

test("event status groups treat partially settled events as settled in user-facing lists", () => {
  assert.deepEqual(mapEventStatusGroup("unsettled"), ["open", "ready_for_settlement"]);
  assert.deepEqual(mapEventStatusGroup("settleable"), ["open", "ready_for_settlement"]);
  assert.deepEqual(mapEventStatusGroup("settled"), ["partially_settled", "settled"]);
  assert.deepEqual(mapEventStatusGroup("cancelled"), ["cancelled"]);
});

test("dashboard character summary and detail expose receivable and payable views", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);
    const allocationService = new AllocationLifecycleService(fixture.db);
    const dashboardService = new DashboardQueryService(fixture.db);

    const event = await eventService.createEvent({
      eventKey: "evt-dashboard-character-1",
      occurredAt: "2026-08-27T13:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Dashboard Character Event",
    });
    await addEventParticipants(fixture.db, event.id, [fixture.characterTwo.id]);
    await eventService.markReadyForSettlement(event.id);

    const settlement = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-27T14:00:00.000Z",
      eventId: event.id,
      grossAmount: 800,
      netAmount: 800,
      organizationId: fixture.organization.id,
      payerRef: String(fixture.characterOne.id),
      payerType: "character",
      settlementKey: "st-dashboard-character-1",
      title: "Dashboard Character Settlement",
    });
    await settlementService.markCalculated(settlement.id);

    await allocationService.createPendingAllocation({
      amount: 800,
      characterId: fixture.characterTwo.id,
      settlementId: settlement.id,
    });

    const summaries = await dashboardService.queryCharacterSummaries({
      characterIds: [fixture.characterOne.id, fixture.characterTwo.id],
      organizationId: fixture.organization.id,
    });

    const payerSummary = summaries.summaries.find(
      (item) => item.characterId === fixture.characterOne.id,
    );
    const receiverSummary = summaries.summaries.find(
      (item) => item.characterId === fixture.characterTwo.id,
    );

    assert.equal(payerSummary?.payableSettlementCount, 1);
    assert.equal(receiverSummary?.receivableSettlementCount, 1);
    assert.equal(receiverSummary?.pendingClaimCount, 1);

    const detail = await dashboardService.getCharacterDetail({
      characterId: fixture.characterTwo.id,
      organizationId: fixture.organization.id,
    });

    assert.equal(detail.receivableGroups.length, 1);
    assert.equal(detail.receivableGroups[0]?.counterpartyType, "character");
    assert.equal(detail.receivableGroups[0]?.settlements[0]?.claimStatus, "none");
  } finally {
    await fixture.cleanup();
  }
});

test("settlement lifecycle can auto-assign keys and default unit assets", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);

    const event = await eventService.createEvent({
      occurredAt: "2026-08-26T12:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Default Unit Event",
    });
    await eventService.markReadyForSettlement(event.id);

    const settlement = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-26T13:00:00.000Z",
      eventId: event.id,
      grossAmount: 1200,
      netAmount: 1200,
      organizationId: fixture.organization.id,
      title: "Auto Unit Settlement",
    });

    assert.match(settlement.settlement_key, /^st-[a-f0-9-]+$/);
    assert.ok(settlement.unit_asset_id);

    const calculated = await settlementService.transitionStatus(
      settlement.id,
      "calculated",
    );
    assert.equal(calculated.status, "calculated");
  } finally {
    await fixture.cleanup();
  }
});

test("settlement workspace bootstrap returns event suggestions, defaults, and viewer role", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const event = await eventService.createEvent({
      eventKey: "evt-workspace-1",
      gameId: fixture.game.id,
      holderRef: String(fixture.characterOne.id),
      holderType: "character",
      occurredAt: "2026-08-26T12:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Workspace Event",
    });
    await addEventParticipants(fixture.db, event.id, [
      fixture.characterOne.id,
      fixture.characterTwo.id,
    ]);

    const workspace = await buildSettlementWorkspaceResponseData({
      db: fixture.db as unknown as D1Client,
      event,
      organizationId: fixture.organization.id,
      role: "owner",
      userId: fixture.owner.id,
    });

    assert.equal(workspace.currentUserRole, "owner");
    assert.equal(workspace.defaultPayerCharacterId, fixture.characterOne.id);
    assert.deepEqual(workspace.defaultRecipientCharacterIds, [
      fixture.characterOne.id,
      fixture.characterTwo.id,
    ]);
    assert.deepEqual(workspace.participantCharacterIds, [
      fixture.characterOne.id,
      fixture.characterTwo.id,
    ]);
    assert.equal(workspace.event.game?.id, fixture.game.id);
    assert.equal(workspace.defaults.defaultFeeMode, "none");
    assert.equal(workspace.defaults.defaultAllocationMode, "equal");
    assert.ok(workspace.availableCharacters.length >= 2);
  } finally {
    await fixture.cleanup();
  }
});

test("settlement editing is only allowed while draft and before allocations exist", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);
    const allocationService = new AllocationLifecycleService(fixture.db);

    const event = await eventService.createEvent({
      occurredAt: "2026-08-26T16:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Editable Settlement Event",
    });
    await addEventParticipants(fixture.db, event.id, [fixture.characterOne.id]);
    await eventService.markReadyForSettlement(event.id);

    const editableSettlement = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-26T17:00:00.000Z",
      eventId: event.id,
      grossAmount: 1200,
      netAmount: 1200,
      organizationId: fixture.organization.id,
      title: "Editable Draft Settlement",
    });
    await assertSettlementEditable(fixture.db, editableSettlement);

    await allocationService.createPendingAllocation({
      amount: 1200,
      characterId: fixture.characterOne.id,
      settlementId: editableSettlement.id,
    });
    await assert.rejects(
      () => assertSettlementEditable(fixture.db, editableSettlement),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "SETTLEMENT_ALLOCATIONS_ALREADY_CREATED",
    );

    const eventTwo = await eventService.createEvent({
      occurredAt: "2026-08-26T18:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Calculated Settlement Event",
    });
    await addEventParticipants(fixture.db, eventTwo.id, [fixture.characterOne.id]);
    await eventService.markReadyForSettlement(eventTwo.id);

    const calculatedSettlement = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-26T19:00:00.000Z",
      eventId: eventTwo.id,
      grossAmount: 800,
      netAmount: 800,
      organizationId: fixture.organization.id,
      title: "Calculated Settlement",
    });
    const updatedCalculatedSettlement = await settlementService.markCalculated(
      calculatedSettlement.id,
    );

    await assert.rejects(
      () => assertSettlementEditable(fixture.db, updatedCalculatedSettlement),
      (error: unknown) => error instanceof AppError && error.code === "SETTLEMENT_NOT_EDITABLE",
    );
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
    await addEventParticipants(fixture.db, event.id, [
      fixture.characterOne.id,
      fixture.characterTwo.id,
    ]);
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

test("allocation lifecycle transition blocks direct claimed status and supports waive", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);
    const allocationService = new AllocationLifecycleService(fixture.db);

    const event = await eventService.createEvent({
      occurredAt: "2026-08-26T19:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Allocation Transition Event",
    });
    await addEventParticipants(fixture.db, event.id, [fixture.characterOne.id]);
    await eventService.markReadyForSettlement(event.id);

    const settlement = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-26T20:00:00.000Z",
      eventId: event.id,
      grossAmount: 1000,
      netAmount: 1000,
      organizationId: fixture.organization.id,
      title: "Allocation Transition Settlement",
    });

    const allocation = await allocationService.createPendingAllocation({
      amount: 1000,
      characterId: fixture.characterOne.id,
      settlementId: settlement.id,
    });

    await assert.rejects(
      () => allocationService.transitionStatus(allocation.id, "claimed"),
      (error: unknown) =>
        error instanceof ConflictError && error.code === "ALLOCATION_STATUS_MANAGED",
    );

    const waived = await allocationService.transitionStatus(allocation.id, "waived");
    assert.equal(waived.status, "waived");
  } finally {
    await fixture.cleanup();
  }
});

test("claim lifecycle transition supports confirm and void workflows", async () => {
  const fixture = await createLedgerFixture();
  try {
    const eventService = new EventLifecycleService(fixture.db);
    const settlementService = new SettlementLifecycleService(fixture.db);
    const allocationService = new AllocationLifecycleService(fixture.db);
    const claimService = new ClaimLifecycleService(fixture.db);

    const event = await eventService.createEvent({
      occurredAt: "2026-08-26T21:00:00.000Z",
      organizationId: fixture.organization.id,
      title: "Claim Transition Event",
    });
    await addEventParticipants(fixture.db, event.id, [fixture.characterOne.id]);
    await eventService.markReadyForSettlement(event.id);

    const settlement = await settlementService.createDraftSettlement({
      decidedAt: "2026-08-26T22:00:00.000Z",
      eventId: event.id,
      grossAmount: 2000,
      netAmount: 2000,
      organizationId: fixture.organization.id,
      title: "Claim Transition Settlement",
    });
    await settlementService.markCalculated(settlement.id);

    const allocation = await allocationService.createPendingAllocation({
      amount: 2000,
      characterId: fixture.characterOne.id,
      settlementId: settlement.id,
    });

    const claim = await claimService.recordClaim({
      amount: 2000,
      claimedAt: "2026-08-26T22:10:00.000Z",
      claimedByCharacterId: fixture.characterOne.id,
      settlementAllocationId: allocation.id,
    });

    const confirmed = await claimService.transitionStatus(
      claim.id,
      "confirmed",
      fixture.owner.id,
    );
    assert.equal(confirmed.status, "confirmed");

    const voided = await claimService.transitionStatus(
      claim.id,
      "voided",
      fixture.owner.id,
    );
    assert.equal(voided.status, "voided");
  } finally {
    await fixture.cleanup();
  }
});
