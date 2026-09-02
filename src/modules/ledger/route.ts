import { createHash } from "node:crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { D1Client } from "../../infrastructure/d1/d1-client";
import { KvJsonRepository } from "../../infrastructure/kv/kv-json-repository";
import { cacheKeys } from "../../lib/cache-keys";
import { AppError, buildErrorResponseBody, ensureRequestId } from "../../lib/errors";
import { getSessionCookie } from "../../lib/session-cookie";
import { SnapshotCacheService } from "../../services/cache/snapshot-cache-service";
import { AssetsRepository } from "../../repositories/assets-repository";
import { CharactersRepository } from "../../repositories/characters-repository";
import { EventParticipantsRepository } from "../../repositories/event-participants-repository";
import { EventsRepository } from "../../repositories/events-repository";
import { GamesRepository } from "../../repositories/games-repository";
import { OrganizationMembersRepository } from "../../repositories/organization-members-repository";
import { OrganizationGamesRepository } from "../../repositories/organization-games-repository";
import { OrganizationsRepository } from "../../repositories/organizations-repository";
import { SettlementAllocationsRepository } from "../../repositories/settlement-allocations-repository";
import { SettlementsRepository } from "../../repositories/settlements-repository";
import type {
  AssetRecord,
  EventRecord,
  EventStatus,
  EventParticipantRecord,
  SettlementAllocationRecord,
  SettlementClaimRecord,
  SettlementRecord,
} from "../../repositories/types";
import { AssetIdentityResolutionService } from "../../services/assets/asset-identity-resolution-service";
import { AllocationLifecycleService } from "../../services/ledger/allocation-lifecycle-service";
import { BatchClaimDispatchService } from "../../services/ledger/batch-claim-dispatch-service";
import { ClaimLifecycleService } from "../../services/ledger/claim-lifecycle-service";
import { ClaimableRecipientsQueryService } from "../../services/ledger/claimable-recipients-query-service";
import { DashboardQueryService } from "../../services/ledger/dashboard-query-service";
import { EventLifecycleService } from "../../services/ledger/event-lifecycle-service";
import { EventSettlementOrchestrationService } from "../../services/ledger/event-settlement-orchestration-service";
import { SettlementDisbursementService } from "../../services/ledger/settlement-disbursement-service";
import { SettlementLifecycleService } from "../../services/ledger/settlement-lifecycle-service";
import { SessionAuthService } from "../../services/auth/session-auth-service";
import type { AppBindings } from "../../types/hono";
import {
  assertLedgerManager,
  requireLedgerAllocation,
  requireLedgerCharacter,
  requireLedgerClaim,
  requireLedgerEvent,
  requireLedgerMembership,
  requireLedgerOrganization,
  requireLedgerSession,
  requireLedgerSettlement,
} from "./guards";
import {
  requireLedgerManager,
  requireLedgerMember,
} from "./middleware";
import {
  createLedgerAllocationRoute,
  createLedgerEventBatchRoute,
  createLedgerBatchClaimsRoute,
  createLedgerClaimRoute,
  createLedgerEventRoute,
  settleLedgerEventRoute,
  createLedgerSettlementDisbursementRoute,
  createLedgerSettlementRoute,
  getCharacterLedgerDashboardDetailRoute,
  getLedgerEventRoute,
  getLedgerClaimableRecipientRoute,
  getOrganizationLedgerDashboardSummaryRoute,
  getLedgerSettlementDefaultsRoute,
  getLedgerSettlementWorkspaceRoute,
  listLedgerEventSummariesRoute,
  listLedgerClaimableRecipientsRoute,
  listLedgerEventsRoute,
  listLedgerSettlementsRoute,
  queryCharacterLedgerDashboardSummariesRoute,
  updateLedgerAllocationStatusRoute,
  updateLedgerClaimStatusRoute,
  updateLedgerEventRoute,
  updateLedgerEventStatusRoute,
  updateLedgerSettlementRoute,
  updateLedgerSettlementStatusRoute,
} from "./schema";

export const organizationLedgerRouter = new OpenAPIHono<AppBindings>();

const SUPPORTED_ALLOCATION_MODES: Array<"equal" | "weight" | "manual"> = [
  "equal",
  "weight",
  "manual",
];

const SUPPORTED_FEE_MODES: Array<"none" | "percent" | "fixed" | "rule"> = [
  "none",
  "percent",
  "fixed",
  "rule",
];

function validationErrorFromIssues(
  issues: Array<{ message: string; path: PropertyKey[] }>,
  requestId: string,
  defaultPath: "body" | "query" | "params" = "body",
) {
  return {
    code: "VALIDATION_ERROR",
    error: "Validation failed",
    issues: issues.map((issue) => {
      const path = issue.path.map(String).join(".") || defaultPath;
      return `${path}: ${issue.message}`;
    }),
    requestId,
  };
}

type EventParticipantDetail = {
  character: {
    id: number;
    name: string;
    slug: string | null;
    vanity: string | null;
  } | null;
  characterId: number | null;
  createdAt: string;
  eventId: number;
  id: number;
  joinedAt: string | null;
  leftAt: string | null;
  roleLabel: string | null;
  updatedAt: string;
  weight: number;
};

type SettlementParticipantValidation = {
  eventParticipantCharacterIds: number[];
  eventParticipantCount: number;
  hasParticipantMismatch: boolean;
  omittedParticipantCharacterIds: number[];
  recipientCharacterIds: number[];
  requiresConfirmation: boolean;
  unexpectedRecipientCharacterIds: number[];
};

type EventParticipantSummary = {
  participantCharacterIds: number[];
  participantCount: number;
};

type EventSummaryLookupItem = {
  asset: {
    id: number;
    name: string;
  } | null;
  event: {
    id: number;
    title: string;
  };
  occurredAt: string;
  holder: {
    id: number | null;
    label: string | null;
    ref: string | null;
    type: EventRecord["holder_type"];
  };
};

export function assertEventEditable(event: EventRecord) {
  if (event.status === "open" || event.status === "ready_for_settlement") {
    return;
  }

  throw new AppError(
    "Only open or ready-for-settlement events can be edited",
    409,
    {
      code: "EVENT_NOT_EDITABLE",
    },
  );
}

export async function assertSettlementEditable(
  db: DatabaseClient,
  settlement: SettlementRecord,
) {
  if (settlement.status !== "draft") {
    throw new AppError("Only draft settlements can be edited", 409, {
      code: "SETTLEMENT_NOT_EDITABLE",
    });
  }

  const allocations = await new SettlementAllocationsRepository(db).listBySettlement(
    settlement.id,
  );
  if (allocations.length > 0) {
    throw new AppError(
      "Settlement cannot be edited after allocations have been created",
      409,
      {
        code: "SETTLEMENT_ALLOCATIONS_ALREADY_CREATED",
      },
    );
  }
}

type PublicOrganizationContext = {
  id: number;
  name: string;
  vanity: string | null;
};

type OrganizationViewer = {
  isMember: boolean;
  userId: number | null;
};

function toEventParticipantResponse(
  participant: EventParticipantRecord & {
    character_name?: string | null;
    character_slug?: string | null;
    character_vanity?: string | null;
  },
): EventParticipantDetail {
  return {
    character:
      participant.character_id === null
        ? null
        : {
            id: participant.character_id,
            name: participant.character_name ?? "",
            slug: participant.character_slug ?? null,
            vanity: participant.character_vanity ?? null,
          },
    characterId: participant.character_id,
    createdAt: participant.created_at,
    eventId: participant.event_id,
    id: participant.id,
    joinedAt: participant.joined_at,
    leftAt: participant.left_at,
    roleLabel: participant.role_label,
    updatedAt: participant.updated_at,
    weight: participant.weight,
  };
}

async function listEventParticipants(
  db: D1Client,
  eventId: number,
  organizationId: number,
): Promise<EventParticipantDetail[]> {
  const rows = await db.all<
    EventParticipantRecord & {
      character_name: string | null;
      character_slug: string | null;
      character_vanity: string | null;
    }
  >(
    `SELECT
       ep.*,
       c.name AS character_name,
       c.slug AS character_slug,
       c.vanity AS character_vanity
     FROM event_participants ep
     LEFT JOIN characters c
       ON c.id = ep.character_id
      AND c.organization_id = ?
     WHERE ep.event_id = ?
     ORDER BY ep.id ASC`,
    organizationId,
    eventId,
  );

  return rows.map(toEventParticipantResponse);
}

export async function listEventParticipantSummaryMap(
  db: D1Client,
  eventIds: number[],
): Promise<Map<number, EventParticipantSummary>> {
  const summaryMap = new Map<number, EventParticipantSummary>();

  if (eventIds.length === 0) {
    return summaryMap;
  }

  const rows = await db.all<{ event_id: number; character_id: number | null }>(
    `SELECT event_id, character_id
     FROM event_participants
     WHERE event_id IN (${eventIds.map(() => "?").join(", ")})
     ORDER BY id ASC`,
    ...eventIds,
  );

  for (const eventId of eventIds) {
    summaryMap.set(eventId, {
      participantCharacterIds: [],
      participantCount: 0,
    });
  }

  for (const row of rows) {
    const entry = summaryMap.get(row.event_id);
    if (!entry || row.character_id === null) {
      continue;
    }

    if (!entry.participantCharacterIds.includes(row.character_id)) {
      entry.participantCharacterIds.push(row.character_id);
    }
  }

  for (const entry of summaryMap.values()) {
    entry.participantCount = entry.participantCharacterIds.length;
  }

  return summaryMap;
}

async function resolveEventGame(
  db: D1Client,
  event: EventRecord,
) {
  if (!event.game_id) {
    return null;
  }

  const game = await new GamesRepository(db).findById(event.game_id);
  if (!game) {
    return null;
  }

  return {
    id: game.id,
    name: game.name,
    slug: game.slug,
    source: game.source,
    type: game.type,
  };
}

async function resolveEventAsset(
  db: D1Client,
  event: EventRecord,
) {
  if (!event.asset_id) {
    return null;
  }

  const asset = await new AssetsRepository(db).findById(event.asset_id);
  if (!asset) {
    return null;
  }

  return {
    assetType: asset.asset_type,
    iconUrl: asset.icon_url,
    id: asset.id,
    name: asset.name,
    status: asset.status,
  };
}

async function resolveEventHolder(
  db: D1Client,
  event: EventRecord,
) {
  let character: {
    id: number;
    name: string;
    slug: string | null;
    vanity: string | null;
  } | null = null;

  if (event.holder_type === "character" && event.holder_ref) {
    const characters = new CharactersRepository(db);
    const candidate = /^\d+$/.test(event.holder_ref)
      ? await characters.findById(Number(event.holder_ref))
      : await characters.findByVanity(event.holder_ref);

    if (candidate && candidate.organization_id === event.organization_id) {
      character = {
        id: candidate.id,
        name: candidate.name,
        slug: candidate.slug,
        vanity: candidate.vanity,
      };
    }
  }

  return {
    character,
    ref: event.holder_ref,
    type: event.holder_type,
  };
}

function buildSettlementReadiness(
  event: EventRecord,
  participantValidation: SettlementParticipantValidation,
) {
  const canCreateFromReadyEvent =
    event.status === "ready_for_settlement" || event.status === "partially_settled";
  const canCreateSettlement =
    canCreateFromReadyEvent && !participantValidation.requiresConfirmation;
  const canSettleEvent =
    (event.status === "open" || event.status === "ready_for_settlement") &&
    !participantValidation.requiresConfirmation;

  return {
    canCreateFromReadyEvent,
    canCreateSettlement,
    canSettleEvent,
    eventStatus: event.status,
    requiresParticipantConfirmation: participantValidation.requiresConfirmation,
  };
}

export async function buildEventDetailResponse(db: D1Client, event: EventRecord) {
  const participants = await listEventParticipants(db, event.id, event.organization_id);
  const participantCharacterIds = [
    ...new Set(
      participants
        .map((participant) => participant.characterId)
        .filter((value): value is number => value !== null),
    ),
  ];
  const participantValidation = await computeSettlementParticipantValidation(
    db,
    event.id,
    participantCharacterIds,
  );

  return {
    ...toEventResponse(event),
    asset: await resolveEventAsset(db, event),
    game: await resolveEventGame(db, event),
    holder: await resolveEventHolder(db, event),
    participantCharacterIds,
    participantCount: participantCharacterIds.length,
    participants,
    recommendedRecipientCharacterIds: participantCharacterIds,
    requiresParticipantConfirmation: participantValidation.requiresConfirmation,
    settlementReadiness: buildSettlementReadiness(event, participantValidation),
  };
}

export async function buildSettlementWorkspaceResponseData(input: {
  db: D1Client;
  event: EventRecord;
  organizationId: number;
  role: "owner" | "admin" | "member";
  userId: number;
}) {
  const organizationGames = await new OrganizationGamesRepository(input.db).listByOrganization(
    input.organizationId,
  );
  const organizationGame =
    input.event.game_id !== null
      ? organizationGames.find((candidate) => candidate.game_id === input.event.game_id) ?? null
      : organizationGames.find((candidate) => candidate.is_primary === 1) ??
        organizationGames[0] ??
        null;
  const game = organizationGame
    ? await new GamesRepository(input.db).findById(organizationGame.game_id)
    : null;
  const defaultSettlementUnit =
    game === null
      ? null
      : await new AssetIdentityResolutionService(input.db).resolveDefaultSettlementUnit({
          gameId: game.id,
          organizationId: input.organizationId,
        });
  const availableCharacters = await new CharactersRepository(input.db).listByOrganization(
    input.organizationId,
  );
  const claimedCharacters = await new CharactersRepository(input.db).listByOrganizationAndUser(
    input.organizationId,
    input.userId,
  );
  const eventDetail = await buildEventDetailResponse(input.db, input.event);

  return {
    availableCharacters: availableCharacters.map((character) => ({
      gameId: character.game_id,
      id: character.id,
      isActive: character.is_active === 1,
      name: character.name,
      slug: character.slug,
      vanity: character.vanity,
    })),
    currentUserRole: input.role,
    defaultPayerCharacterId: claimedCharacters[0]?.id ?? null,
    defaultRecipientCharacterIds: eventDetail.recommendedRecipientCharacterIds,
    defaults: {
      defaultAllocationMode: "equal" as const,
      defaultFeeMode: "none" as const,
      defaultSettlementUnit: defaultSettlementUnit
        ? toSettlementDefaultUnit(defaultSettlementUnit)
        : null,
      supportedAllocationModes: SUPPORTED_ALLOCATION_MODES,
      supportedFeeModes: SUPPORTED_FEE_MODES,
    },
    event: eventDetail,
    participantCharacterIds: eventDetail.participantCharacterIds,
  };
}

async function validateEventParticipantCharacters(
  db: D1Client,
  organizationId: number,
  participants: Array<{
    characterId?: number | null;
  }>,
) {
  const characters = new CharactersRepository(db);
  for (const participant of participants) {
    if (participant.characterId === undefined || participant.characterId === null) {
      continue;
    }

    await requireLedgerCharacter(db, participant.characterId, organizationId);
    const character = await characters.findById(participant.characterId);
    if (!character || character.organization_id !== organizationId) {
      throw new AppError("Character not found", 404, {
        code: "CHARACTER_NOT_FOUND",
      });
    }
  }
}

async function replaceEventParticipants(
  db: D1Client,
  eventId: number,
  organizationId: number,
  participants: Array<{
    characterId?: number | null;
    joinedAt?: string | null;
    leftAt?: string | null;
    roleLabel?: string | null;
    weight?: number;
  }>,
) {
  await validateEventParticipantCharacters(db, organizationId, participants);
  await db.run(`DELETE FROM event_participants WHERE event_id = ?`, eventId);

  const repository = new EventParticipantsRepository(db);
  for (const participant of participants) {
    await repository.create({
      characterId: participant.characterId ?? null,
      eventId,
      joinedAt: participant.joinedAt ?? null,
      leftAt: participant.leftAt ?? null,
      roleLabel: participant.roleLabel ?? null,
      weight: participant.weight ?? 1,
    });
  }
}

async function computeSettlementParticipantValidation(
  db: D1Client,
  eventId: number,
  recipientCharacterIds: number[],
): Promise<SettlementParticipantValidation> {
  const participants = await new EventParticipantsRepository(db).listByEvent(eventId);
  const eventParticipantCharacterIds = [
    ...new Set(
      participants
        .map((participant) => participant.character_id)
        .filter((value): value is number => value !== null),
    ),
  ];
  const recipientSet = new Set(recipientCharacterIds);
  const participantSet = new Set(eventParticipantCharacterIds);
  const unexpectedRecipientCharacterIds = recipientCharacterIds.filter(
    (characterId) => !participantSet.has(characterId),
  );
  const omittedParticipantCharacterIds = eventParticipantCharacterIds.filter(
    (characterId) => !recipientSet.has(characterId),
  );
  const hasParticipantMismatch =
    unexpectedRecipientCharacterIds.length > 0 || omittedParticipantCharacterIds.length > 0;
  const requiresConfirmation =
    eventParticipantCharacterIds.length === 0 || hasParticipantMismatch;

  return {
    eventParticipantCharacterIds,
    eventParticipantCount: eventParticipantCharacterIds.length,
    hasParticipantMismatch,
    omittedParticipantCharacterIds,
    recipientCharacterIds,
    requiresConfirmation,
    unexpectedRecipientCharacterIds,
  };
}

async function validateSettlementParticipantsOrRespond(
  c: Context<AppBindings>,
  db: D1Client,
  input: {
    confirmParticipantException?: boolean;
    eventId?: number | null;
    organizationId: number;
    participantExceptionReason?: string | null;
    recipientCharacterIds?: number[];
  },
): Promise<
  | {
      conflict: null;
      participantExceptionConfirmed: boolean;
      participantExceptionReason: string | null;
      participantValidation: SettlementParticipantValidation | null;
    }
  | {
      conflict: {
        body: ReturnType<typeof buildSettlementParticipantConflictResponse> & {
          requestId: string;
        };
        status: 409;
      };
      participantExceptionConfirmed: false;
      participantExceptionReason: null;
      participantValidation: SettlementParticipantValidation;
    }
> {
  if (!input.eventId) {
    return {
      conflict: null,
      participantExceptionConfirmed: false,
      participantExceptionReason: null,
      participantValidation: null,
    };
  }

  await requireLedgerEvent(db, input.eventId, input.organizationId);
  const participantValidation = await computeSettlementParticipantValidation(
    db,
    input.eventId,
    input.recipientCharacterIds ?? [],
  );

  if (
    participantValidation.requiresConfirmation &&
    input.confirmParticipantException !== true
  ) {
    return {
      conflict: {
        body: {
          ...buildSettlementParticipantConflictResponse(
            c,
            participantValidation.eventParticipantCount === 0
              ? "This event has no recorded participants. Confirm the exception before creating a settlement."
              : "Settlement recipients do not match the event participants. Confirm the exception before creating a settlement.",
            participantValidation,
          ),
          requestId: ensureRequestId(c),
        },
        status: 409,
      },
      participantExceptionConfirmed: false,
      participantExceptionReason: null,
      participantValidation,
    };
  }

  return {
    conflict: null,
    participantExceptionConfirmed:
      participantValidation.requiresConfirmation === true &&
      input.confirmParticipantException === true,
    participantExceptionReason:
      participantValidation.requiresConfirmation === true
        ? input.participantExceptionReason ?? null
        : null,
    participantValidation,
  };
}

function resolveSettlementRecipientCharacterIds(input: {
  recipientCharacterIds?: number[];
  recipients?: Array<{ characterId: number }>;
}) {
  if (input.recipients && input.recipients.length > 0) {
    return input.recipients.map((recipient) => recipient.characterId);
  }

  return input.recipientCharacterIds;
}

organizationLedgerRouter.use(
  "/:organization/ledger/events",
  requireLedgerMember,
);
organizationLedgerRouter.use(
  "/:organization/ledger/events/summary",
  requireLedgerMember,
);
organizationLedgerRouter.use(
  "/:organization/ledger/events/:eventId/status",
  requireLedgerManager,
);
organizationLedgerRouter.use(
  "/:organization/ledger/events/:eventId/settle",
  requireLedgerManager,
);
organizationLedgerRouter.use(
  "/:organization/ledger/settlements",
  requireLedgerMember,
);
organizationLedgerRouter.use(
  "/:organization/ledger/settlements/:settlementId/status",
  requireLedgerManager,
);
organizationLedgerRouter.use(
  "/:organization/ledger/settlements/:settlementId/disburse",
  requireLedgerManager,
);
organizationLedgerRouter.use(
  "/:organization/ledger/settlement-defaults",
  requireLedgerMember,
);
organizationLedgerRouter.use(
  "/:organization/ledger/allocations",
  requireLedgerManager,
);
organizationLedgerRouter.use(
  "/:organization/ledger/allocations/:allocationId/status",
  requireLedgerManager,
);
organizationLedgerRouter.use(
  "/:organization/ledger/claimable-recipients",
  requireLedgerMember,
);
organizationLedgerRouter.use(
  "/:organization/ledger/claimable-recipients/:characterId",
  requireLedgerMember,
);
organizationLedgerRouter.use(
  "/:organization/ledger/claims",
  requireLedgerMember,
);
organizationLedgerRouter.use(
  "/:organization/ledger/claims/batch",
  requireLedgerManager,
);
organizationLedgerRouter.use(
  "/:organization/ledger/claims/:claimId/status",
  requireLedgerManager,
);

organizationLedgerRouter.openapi(getOrganizationLedgerDashboardSummaryRoute, async (c) => {
  try {
    const organization = await resolvePublicOrganization(c);
    const viewer = await resolveOrganizationViewer(c, organization.id);
    const cacheKey = cacheKeys.ledgerQuery(
      String(organization.id),
      `dashboard-summary:${getThirtyMinuteBucket()}`,
    );

    const payload = await readThroughDashboardSnapshot(
      c,
      cacheKey,
      viewer.isMember,
      () =>
        new DashboardQueryService(new D1Client(c.env.APP_DB)).getOrganizationSummary({
          organization,
        }),
    );

    return c.json(payload, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 404);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(queryCharacterLedgerDashboardSummariesRoute, async (c) => {
  const schema =
    queryCharacterLedgerDashboardSummariesRoute.request.body.content["application/json"].schema;
  const parsed = schema.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = await resolvePublicOrganization(c);
    const viewer = await resolveOrganizationViewer(c, organization.id);
    const characterHash = createHash("sha1")
      .update(parsed.data.characterIds.join(","))
      .digest("hex")
      .slice(0, 16);
    const cacheKey = cacheKeys.ledgerQuery(
      String(organization.id),
      `dashboard-character-summaries:${characterHash}:${getThirtyMinuteBucket()}`,
    );

    const payload = await readThroughDashboardSnapshot(
      c,
      cacheKey,
      viewer.isMember,
      () =>
        new DashboardQueryService(new D1Client(c.env.APP_DB)).queryCharacterSummaries({
          characterIds: parsed.data.characterIds,
          organizationId: organization.id,
        }),
    );

    return c.json(payload, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 404);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(getCharacterLedgerDashboardDetailRoute, async (c) => {
  const parsed = getCharacterLedgerDashboardDetailRoute.request.params.safeParse(
    c.req.param(),
  );
  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c), "params"),
      422,
    );
  }

  try {
    const organization = await resolvePublicOrganization(c);
    const viewer = await resolveOrganizationViewer(c, organization.id);
    const cacheKey = cacheKeys.ledgerQuery(
      String(organization.id),
      `dashboard-character-detail:${parsed.data.characterId}:${getThirtyMinuteBucket()}`,
    );

    const payload = await readThroughDashboardSnapshot(
      c,
      cacheKey,
      viewer.isMember,
      () =>
        new DashboardQueryService(new D1Client(c.env.APP_DB)).getCharacterDetail({
          characterId: parsed.data.characterId,
          organizationId: organization.id,
        }),
    );

    return c.json(payload, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 404);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(listLedgerEventsRoute, async (c) => {
  const parsed = listLedgerEventsRoute.request.query.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c), "query"),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);

    const db = new D1Client(c.env.APP_DB);
    const limit = parsed.data.limit ?? 20;
    const offset = parsed.data.offset ?? 0;
    const sortBy = parsed.data.sortBy ?? "occurredAt";
    const sortOrder = parsed.data.sortOrder ?? "desc";
    const sortColumn = mapEventSortColumn(sortBy);
    const whereClauses = [`organization_id = ?`];
    const bindings: unknown[] = [organization.id];

    if (parsed.data.status) {
      whereClauses.push(`status = ?`);
      bindings.push(parsed.data.status);
    } else if (parsed.data.statusGroup) {
      const statuses = mapEventStatusGroup(parsed.data.statusGroup);
      whereClauses.push(`status IN (${statuses.map(() => "?").join(", ")})`);
      bindings.push(...statuses);
    }

    if (parsed.data.createdByUserId) {
      whereClauses.push(`created_by_user_id = ?`);
      bindings.push(parsed.data.createdByUserId);
    }

    if (parsed.data.assetId) {
      whereClauses.push(`asset_id = ?`);
      bindings.push(parsed.data.assetId);
    }

    if (parsed.data.holderType) {
      whereClauses.push(`holder_type = ?`);
      bindings.push(parsed.data.holderType);
    }

    if (parsed.data.holderRef) {
      whereClauses.push(`holder_ref = ?`);
      bindings.push(parsed.data.holderRef);
    }

    if (parsed.data.eventType) {
      whereClauses.push(`event_type = ?`);
      bindings.push(parsed.data.eventType);
    }

    if (parsed.data.fromOccurredAt) {
      whereClauses.push(`occurred_at >= ?`);
      bindings.push(parsed.data.fromOccurredAt);
    }

    if (parsed.data.toOccurredAt) {
      whereClauses.push(`occurred_at <= ?`);
      bindings.push(parsed.data.toOccurredAt);
    }

    bindings.push(limit + 1, offset);

    const rows = await db.all<EventRecord>(
      `SELECT *
       FROM events
       WHERE ${whereClauses.join(" AND ")}
       ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}, id ${sortOrder.toUpperCase()}
       LIMIT ?
       OFFSET ?`,
      ...bindings,
    );

    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;
    const participantSummaryMap =
      parsed.data.include === "participants_summary"
        ? await listEventParticipantSummaryMap(
            db,
            events.map((event) => event.id),
          )
        : null;

    return c.json(
      {
        events: events.map((event) => ({
          ...toEventResponse(event),
          ...(participantSummaryMap?.get(event.id) ?? {}),
        })),
        pagination: {
          hasMore,
          limit,
          offset,
        },
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404);
    }

    throw error;
  }
});

export async function listLedgerEventSummaryLookup(input: {
  db: D1Client;
  fromOccurredAt?: string;
  gameId: number;
  limit: number;
  offset: number;
  organizationId: number;
  toOccurredAt?: string;
}): Promise<{
  events: EventSummaryLookupItem[];
  pagination: {
    hasMore: boolean;
    limit: number;
    offset: number;
  };
}> {
  const whereClauses = ["e.organization_id = ?", "e.game_id = ?"];
  const bindings: Array<number | string> = [input.organizationId, input.gameId];

  if (input.fromOccurredAt) {
    whereClauses.push("e.occurred_at >= ?");
    bindings.push(input.fromOccurredAt);
  }

  if (input.toOccurredAt) {
    whereClauses.push("e.occurred_at <= ?");
    bindings.push(input.toOccurredAt);
  }

  bindings.push(input.limit + 1, input.offset);

  const rows = await input.db.all<
    EventRecord & {
      asset_name: string | null;
    }
  >(
    `SELECT
       e.*,
       a.name AS asset_name
     FROM events e
     LEFT JOIN assets a
       ON a.id = e.asset_id
     WHERE ${whereClauses.join(" AND ")}
     ORDER BY e.occurred_at DESC, e.id DESC
     LIMIT ?
     OFFSET ?`,
    ...bindings,
  );

  const hasMore = rows.length > input.limit;
  const events = hasMore ? rows.slice(0, input.limit) : rows;
  const items: EventSummaryLookupItem[] = [];

  for (const event of events) {
    const holder = await resolveEventHolder(input.db, event);
    items.push({
      asset:
        event.asset_id === null
          ? null
          : {
              id: event.asset_id,
              name: event.asset_name ?? "",
            },
      event: {
        id: event.id,
        title: event.title,
      },
      occurredAt: event.occurred_at,
      holder: {
        id: holder.character?.id ?? null,
        label: holder.character?.name ?? holder.ref,
        ref: holder.ref,
        type: holder.type,
      },
    });
  }

  return {
    events: items,
    pagination: {
      hasMore,
      limit: input.limit,
      offset: input.offset,
    },
  };
}

organizationLedgerRouter.openapi(listLedgerEventSummariesRoute, async (c) => {
  const parsed = listLedgerEventSummariesRoute.request.query.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c), "query"),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const limit = parsed.data.limit ?? 20;
    const offset = parsed.data.offset ?? 0;
    const response = await listLedgerEventSummaryLookup({
      db: new D1Client(c.env.APP_DB),
      fromOccurredAt: parsed.data.fromOccurredAt,
      gameId: parsed.data.gameId,
      limit,
      offset,
      organizationId: organization.id,
      toOccurredAt: parsed.data.toOccurredAt,
    });

    return c.json(response, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(getLedgerEventRoute, async (c) => {
  const parsed = getLedgerEventRoute.request.params.safeParse(c.req.param());
  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c), "params"),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const db = new D1Client(c.env.APP_DB);
    const event = await requireLedgerEvent(db, parsed.data.eventId, organization.id);

    return c.json(
      {
        event: await buildEventDetailResponse(db, event),
        message: "Event retrieved successfully.",
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(getLedgerSettlementWorkspaceRoute, async (c) => {
  const queryParsed = getLedgerSettlementWorkspaceRoute.request.query.safeParse(
    c.req.query(),
  );
  if (!queryParsed.success) {
    return c.json(
      validationErrorFromIssues(queryParsed.error.issues, ensureRequestId(c), "query"),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const membership = requireLedgerMembership(c);
    const session = requireLedgerSession(c);
    const db = new D1Client(c.env.APP_DB);
    const event = await requireLedgerEvent(
      db,
      queryParsed.data.eventId,
      organization.id,
    );
    return c.json(
      await buildSettlementWorkspaceResponseData({
        db,
        event,
        organizationId: organization.id,
        role: membership.role,
        userId: session.user.id,
      }),
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(listLedgerClaimableRecipientsRoute, async (c) => {
  try {
    const organization = requireLedgerOrganization(c);
    const recipients = await new ClaimableRecipientsQueryService(
      new D1Client(c.env.APP_DB),
    ).listClaimableRecipients(organization.id);

    return c.json({ recipients }, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(getLedgerClaimableRecipientRoute, async (c) => {
  const paramsParsed = getLedgerClaimableRecipientRoute.request.params.safeParse(
    c.req.param(),
  );
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c), "params"),
      422,
    );
  }

  const queryParsed = getLedgerClaimableRecipientRoute.request.query.safeParse(
    c.req.query(),
  );
  if (!queryParsed.success) {
    return c.json(
      validationErrorFromIssues(queryParsed.error.issues, ensureRequestId(c), "query"),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const db = new D1Client(c.env.APP_DB);
    await requireLedgerCharacter(db, paramsParsed.data.characterId, organization.id);
    const detail = await new ClaimableRecipientsQueryService(
      db,
    ).getClaimableRecipientDetail({
      characterId: paramsParsed.data.characterId,
      includeSiblingCharacters: queryParsed.data.includeSiblingCharacters,
      organizationId: organization.id,
    });

    return c.json(detail, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(createLedgerEventRoute, async (c) => {
  const schema = createLedgerEventRoute.request.body.content["application/json"].schema;
  const parsed = schema.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const session = requireLedgerSession(c);

    const db = new D1Client(c.env.APP_DB);
    const service = new EventLifecycleService(db);
    const event = await service.createEvent({
      assetId: parsed.data.assetId,
      createdByUserId: session.user.id,
      eventType: parsed.data.eventType,
      gameId: parsed.data.gameId,
      holderRef: parsed.data.holderRef,
      holderType: parsed.data.holderType,
      notes: parsed.data.notes,
      occurredAt: parsed.data.occurredAt,
      organizationId: organization.id,
      sourceType: parsed.data.sourceType,
      title: parsed.data.title,
    });
    await replaceEventParticipants(
      db,
      event.id,
      organization.id,
      parsed.data.participants ?? [],
    );

    return c.json(
      {
        event: await buildEventDetailResponse(db, event),
        message: "Event created successfully.",
      },
      201,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(createLedgerEventBatchRoute, async (c) => {
  const schema =
    createLedgerEventBatchRoute.request.body.content["application/json"].schema;
  const parsed = schema.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const session = requireLedgerSession(c);
    const db = new D1Client(c.env.APP_DB);
    const service = new EventLifecycleService(db);
    const events: EventRecord[] = [];

    for (const item of parsed.data.events) {
      const event = await service.createEvent({
        assetId: item.assetId,
        createdByUserId: session.user.id,
        eventType: item.eventType,
        gameId: item.gameId,
        holderRef: item.holderRef,
        holderType: item.holderType,
        notes: item.notes,
        occurredAt: item.occurredAt,
        organizationId: organization.id,
        sourceType: item.sourceType,
        title: item.title,
      });
      await replaceEventParticipants(
        db,
        event.id,
        organization.id,
        item.participants ?? [],
      );
      events.push(event);
    }

    return c.json(
      {
        events: await Promise.all(
          events.map((event) => buildEventDetailResponse(db, event)),
        ),
        message: "Events created successfully.",
      },
      201,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404 | 409);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(updateLedgerEventRoute, async (c) => {
  const paramsParsed = updateLedgerEventRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c), "params"),
      422,
    );
  }

  const bodySchema =
    updateLedgerEventRoute.request.body.content["application/json"].schema;
  const bodyParsed = bodySchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json(
      validationErrorFromIssues(bodyParsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const membership = requireLedgerMembership(c);
    assertLedgerManager(membership);
    const db = new D1Client(c.env.APP_DB);
    const event = await requireLedgerEvent(db, paramsParsed.data.eventId, organization.id);
    assertEventEditable(event);

    if (bodyParsed.data.assetId !== undefined && bodyParsed.data.assetId !== null) {
      const asset = await new AssetsRepository(db).findById(bodyParsed.data.assetId);
      if (!asset || asset.organization_id !== organization.id) {
        throw new AppError("Asset not found", 404, { code: "ASSET_NOT_FOUND" });
      }
    }

    if (bodyParsed.data.gameId !== undefined && bodyParsed.data.gameId !== null) {
      const organizationGame = await new OrganizationGamesRepository(db).findByOrganizationAndGame(
        organization.id,
        bodyParsed.data.gameId,
      );
      if (!organizationGame) {
        throw new AppError("Game not found for this organization", 404, {
          code: "ORGANIZATION_GAME_NOT_FOUND",
        });
      }
    }

    const updated = await new EventsRepository(db).update(event.id, {
      assetId: bodyParsed.data.assetId,
      gameId: bodyParsed.data.gameId,
      holderRef: bodyParsed.data.holderRef,
      holderType: bodyParsed.data.holderType,
      notes: bodyParsed.data.notes,
      occurredAt: bodyParsed.data.occurredAt,
      title: bodyParsed.data.title,
    });
    if (bodyParsed.data.participants !== undefined) {
      await replaceEventParticipants(
        db,
        event.id,
        organization.id,
        bodyParsed.data.participants,
      );
    }

    return c.json(
      {
        event: await buildEventDetailResponse(db, updated),
        message: "Event updated successfully.",
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404 | 409);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(updateLedgerEventStatusRoute, async (c) => {
  const paramsParsed = updateLedgerEventStatusRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c), "params"),
      422,
    );
  }

  const bodySchema =
    updateLedgerEventStatusRoute.request.body.content["application/json"].schema;
  const bodyParsed = bodySchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json(
      validationErrorFromIssues(bodyParsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);

    const db = new D1Client(c.env.APP_DB);
    const event = await requireLedgerEvent(
      db,
      paramsParsed.data.eventId,
      organization.id,
    );
    const updated = await new EventLifecycleService(db).transitionStatus(
      event.id,
      bodyParsed.data.status,
    );

    return c.json(
      {
        event: await buildEventDetailResponse(db, updated),
        message: "Event status updated successfully.",
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(listLedgerSettlementsRoute, async (c) => {
  const parsed = listLedgerSettlementsRoute.request.query.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c), "query"),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);

    const db = new D1Client(c.env.APP_DB);
    const limit = parsed.data.limit ?? 20;
    const offset = parsed.data.offset ?? 0;
    const sortBy = parsed.data.sortBy ?? "decidedAt";
    const sortOrder = parsed.data.sortOrder ?? "desc";
    const sortColumn = mapSettlementSortColumn(sortBy);
    const whereClauses = [`organization_id = ?`];
    const bindings: unknown[] = [organization.id];

    if (parsed.data.status) {
      whereClauses.push(`status = ?`);
      bindings.push(parsed.data.status);
    }

    if (parsed.data.createdByUserId) {
      whereClauses.push(`created_by_user_id = ?`);
      bindings.push(parsed.data.createdByUserId);
    }

    if (parsed.data.eventId) {
      whereClauses.push(`event_id = ?`);
      bindings.push(parsed.data.eventId);
    }

    if (parsed.data.feeMode) {
      whereClauses.push(`fee_mode = ?`);
      bindings.push(parsed.data.feeMode);
    }

    if (parsed.data.unitAssetId) {
      whereClauses.push(`unit_asset_id = ?`);
      bindings.push(parsed.data.unitAssetId);
    }

    if (parsed.data.settlementType) {
      whereClauses.push(`settlement_type = ?`);
      bindings.push(parsed.data.settlementType);
    }

    if (parsed.data.fromDecidedAt) {
      whereClauses.push(`decided_at >= ?`);
      bindings.push(parsed.data.fromDecidedAt);
    }

    if (parsed.data.toDecidedAt) {
      whereClauses.push(`decided_at <= ?`);
      bindings.push(parsed.data.toDecidedAt);
    }

    bindings.push(limit + 1, offset);

    const rows = await db.all<SettlementRecord>(
      `SELECT *
       FROM settlements
       WHERE ${whereClauses.join(" AND ")}
       ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}, id ${sortOrder.toUpperCase()}
       LIMIT ?
       OFFSET ?`,
      ...bindings,
    );

    const hasMore = rows.length > limit;
    const settlements = hasMore ? rows.slice(0, limit) : rows;

    return c.json(
      {
        pagination: {
          hasMore,
          limit,
          offset,
        },
        settlements: settlements.map(toSettlementResponse),
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(getLedgerSettlementDefaultsRoute, async (c) => {
  const parsed = getLedgerSettlementDefaultsRoute.request.query.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c), "query"),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);

    const db = new D1Client(c.env.APP_DB);
    const organizationGames = await new OrganizationGamesRepository(db).listByOrganization(
      organization.id,
    );
    const organizationGame =
      parsed.data.gameId !== undefined
        ? organizationGames.find((candidate) => candidate.game_id === parsed.data.gameId) ?? null
        : organizationGames.find((candidate) => candidate.is_primary === 1) ??
          organizationGames[0] ??
          null;

    const game = organizationGame
      ? await new GamesRepository(db).findById(organizationGame.game_id)
      : null;

    if (parsed.data.gameId && !game) {
      throw new AppError("Game not found for this organization", 404, {
        code: "ORGANIZATION_GAME_NOT_FOUND",
      });
    }

    const defaultSettlementUnit =
      game === null
        ? null
        : await new AssetIdentityResolutionService(db).resolveDefaultSettlementUnit({
            gameId: game.id,
            organizationId: organization.id,
          });

    return c.json(
      {
        defaults: {
          defaultAllocationMode: "equal" as const,
          defaultFeeMode: "none" as const,
          defaultSettlementUnit: defaultSettlementUnit
            ? toSettlementDefaultUnit(defaultSettlementUnit)
            : null,
          supportedAllocationModes: SUPPORTED_ALLOCATION_MODES,
          supportedFeeModes: SUPPORTED_FEE_MODES,
        },
        game: game
          ? {
              id: game.id,
              name: game.name,
              organizationDisplayName: organizationGame?.display_name ?? null,
              slug: game.slug,
              source: game.source,
              type: game.type,
            }
          : null,
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(createLedgerBatchClaimsRoute, async (c) => {
  const schema =
    createLedgerBatchClaimsRoute.request.body.content["application/json"].schema;
  const parsed = schema.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const membership = requireLedgerMembership(c);
    assertLedgerManager(membership);

    const result = await new BatchClaimDispatchService(
      new D1Client(c.env.APP_DB),
    ).recordBatchClaims({
      claimedAt: parsed.data.claimedAt,
      items: parsed.data.items,
      method: parsed.data.method,
      notes: parsed.data.notes,
      organizationId: organization.id,
    });

    return c.json(
      {
        allocationsProcessed: result.allocationsProcessed,
        claims: result.claims.map(toClaimResponse),
        message: "Batch claims recorded successfully.",
        settlementsTouched: result.settlementsTouched,
      },
      201,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404 | 409);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(createLedgerSettlementDisbursementRoute, async (c) => {
  const paramsParsed =
    createLedgerSettlementDisbursementRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c), "params"),
      422,
    );
  }

  const schema =
    createLedgerSettlementDisbursementRoute.request.body.content["application/json"].schema;
  const parsed = schema.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const membership = requireLedgerMembership(c);
    assertLedgerManager(membership);

    const result = await new SettlementDisbursementService(
      new D1Client(c.env.APP_DB),
    ).disburseSettlement({
      claimedAt: parsed.data.claimedAt,
      items: parsed.data.items,
      method: parsed.data.method,
      notes: parsed.data.notes,
      organizationId: organization.id,
      settlementId: paramsParsed.data.settlementId,
    });

    return c.json(
      {
        allocationMode: result.allocationMode,
        allocations: result.allocations.map(toAllocationResponse),
        claims: result.claims.map(toClaimResponse),
        message: "Settlement disbursed successfully.",
        settlement: toSettlementResponse(result.settlement),
        settlementStatusChanged: result.settlementStatusChanged,
      },
      201,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404 | 409);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(createLedgerSettlementRoute, async (c) => {
  const schema =
    createLedgerSettlementRoute.request.body.content["application/json"].schema;
  const parsed = schema.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const membership = requireLedgerMembership(c);
    const session = requireLedgerSession(c);
    assertLedgerManager(membership);

    const db = new D1Client(c.env.APP_DB);
    const settlementValidation = await validateSettlementParticipantsOrRespond(c, db, {
      confirmParticipantException: parsed.data.confirmParticipantException,
      eventId: parsed.data.eventId,
      organizationId: organization.id,
      participantExceptionReason: parsed.data.participantExceptionReason,
      recipientCharacterIds: parsed.data.recipientCharacterIds,
    });

    if (settlementValidation.conflict) {
      return c.json(
        settlementValidation.conflict.body,
        settlementValidation.conflict.status,
      );
    }

    const settlement = await new SettlementLifecycleService(db).createDraftSettlement({
      allocationMode: parsed.data.allocationMode,
      createdByUserId: session.user.id,
      decidedAt: parsed.data.decidedAt,
      eventId: parsed.data.eventId,
      feeAmount: parsed.data.feeAmount,
      feeMode: parsed.data.feeMode,
      feePercent: parsed.data.feePercent,
      feeRuleKey: parsed.data.feeRuleKey,
      grossAmount: parsed.data.grossAmount,
      netAmount: parsed.data.netAmount,
      notes: parsed.data.notes,
      organizationId: organization.id,
      participantExceptionConfirmed:
        settlementValidation.participantExceptionConfirmed,
      participantExceptionReason: settlementValidation.participantExceptionReason,
      payerRef: parsed.data.payerRef,
      payerType: parsed.data.payerType,
      settlementType: parsed.data.settlementType,
      title: parsed.data.title,
      unitAssetId: parsed.data.unitAssetId,
    });

    return c.json(
      {
        message: "Settlement created successfully.",
        settlement: toSettlementResponse(settlement),
        participantValidation: settlementValidation.participantValidation,
      },
      201,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404 | 409);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(settleLedgerEventRoute, async (c) => {
  const paramsParsed = settleLedgerEventRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c), "params"),
      422,
    );
  }

  const schema =
    settleLedgerEventRoute.request.body.content["application/json"].schema;
  const parsed = schema.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const membership = requireLedgerMembership(c);
    const session = requireLedgerSession(c);
    assertLedgerManager(membership);

    const db = new D1Client(c.env.APP_DB);
    const settlementValidation = await validateSettlementParticipantsOrRespond(c, db, {
      confirmParticipantException: parsed.data.confirmParticipantException,
      eventId: paramsParsed.data.eventId,
      organizationId: organization.id,
      participantExceptionReason: parsed.data.participantExceptionReason,
      recipientCharacterIds: resolveSettlementRecipientCharacterIds(parsed.data),
    });

    if (settlementValidation.conflict) {
      return c.json(
        settlementValidation.conflict.body,
        settlementValidation.conflict.status,
      );
    }

    const result = await new EventSettlementOrchestrationService(
      db,
    ).settleEventWithAllocations({
      allocationMode: parsed.data.allocationMode,
      createdByUserId: session.user.id,
      decidedAt: parsed.data.decidedAt,
      eventId: paramsParsed.data.eventId,
      feeAmount: parsed.data.feeAmount,
      feeMode: parsed.data.feeMode,
      feePercent: parsed.data.feePercent,
      feeRuleKey: parsed.data.feeRuleKey,
      grossAmount: parsed.data.grossAmount,
      netAmount: parsed.data.netAmount,
      notes: parsed.data.notes,
      organizationId: organization.id,
      participantExceptionConfirmed:
        settlementValidation.participantExceptionConfirmed,
      participantExceptionReason: settlementValidation.participantExceptionReason,
      payerRef: parsed.data.payerRef,
      payerType: parsed.data.payerType,
      recipientCharacterIds: parsed.data.recipientCharacterIds,
      recipients: parsed.data.recipients,
      settlementType: parsed.data.settlementType,
      title: parsed.data.title,
      unitAssetId: parsed.data.unitAssetId,
    });

    return c.json(
      {
        allocations: result.allocations.map(toAllocationResponse),
        event: await buildEventDetailResponse(db, result.event),
        message: "Event settled successfully.",
        participantValidation: settlementValidation.participantValidation,
        settlement: toSettlementResponse(result.settlement),
      },
      201,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404 | 409);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(updateLedgerSettlementStatusRoute, async (c) => {
  const paramsParsed =
    updateLedgerSettlementStatusRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c), "params"),
      422,
    );
  }

  const bodySchema =
    updateLedgerSettlementStatusRoute.request.body.content["application/json"].schema;
  const bodyParsed = bodySchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json(
      validationErrorFromIssues(bodyParsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);

    const db = new D1Client(c.env.APP_DB);
    const settlement = await requireLedgerSettlement(
      db,
      paramsParsed.data.settlementId,
      organization.id,
    );
    const updated = await new SettlementLifecycleService(db).transitionStatus(
      settlement.id,
      bodyParsed.data.status,
    );

    return c.json(
      {
        message: "Settlement status updated successfully.",
        settlement: toSettlementResponse(updated),
        participantValidation: null,
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404 | 409);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(updateLedgerSettlementRoute, async (c) => {
  const paramsParsed =
    updateLedgerSettlementRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c), "params"),
      422,
    );
  }

  const bodySchema =
    updateLedgerSettlementRoute.request.body.content["application/json"].schema;
  const bodyParsed = bodySchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json(
      validationErrorFromIssues(bodyParsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const membership = requireLedgerMembership(c);
    assertLedgerManager(membership);

    const db = new D1Client(c.env.APP_DB);
    const settlement = await requireLedgerSettlement(
      db,
      paramsParsed.data.settlementId,
      organization.id,
    );
    await assertSettlementEditable(db, settlement);

    if (bodyParsed.data.unitAssetId !== undefined && bodyParsed.data.unitAssetId !== null) {
      const asset = await new AssetsRepository(db).findById(bodyParsed.data.unitAssetId);
      if (
        !asset ||
        (asset.organization_id !== null && asset.organization_id !== organization.id)
      ) {
        throw new AppError("Settlement unit asset not found", 404, {
          code: "SETTLEMENT_UNIT_ASSET_NOT_FOUND",
        });
      }
    }

    const updated = await new SettlementsRepository(db).update(settlement.id, {
      allocationMode: bodyParsed.data.allocationMode,
      decidedAt: bodyParsed.data.decidedAt,
      feeAmount: bodyParsed.data.feeAmount,
      feeMode: bodyParsed.data.feeMode,
      feePercent: bodyParsed.data.feePercent,
      feeRuleKey: bodyParsed.data.feeRuleKey,
      grossAmount: bodyParsed.data.grossAmount,
      netAmount: bodyParsed.data.netAmount,
      notes: bodyParsed.data.notes,
      payerRef: bodyParsed.data.payerRef,
      payerType: bodyParsed.data.payerType,
      participantExceptionReason: bodyParsed.data.participantExceptionReason,
      settlementType: bodyParsed.data.settlementType,
      title: bodyParsed.data.title,
      unitAssetId: bodyParsed.data.unitAssetId,
    });

    return c.json(
      {
        message: "Settlement updated successfully.",
        settlement: toSettlementResponse(updated),
        participantValidation: null,
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404 | 409);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(createLedgerAllocationRoute, async (c) => {
  const schema =
    createLedgerAllocationRoute.request.body.content["application/json"].schema;
  const parsed = schema.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);

    const db = new D1Client(c.env.APP_DB);
    await requireLedgerSettlement(db, parsed.data.settlementId, organization.id);
    if (parsed.data.characterId) {
      await requireLedgerCharacter(db, parsed.data.characterId, organization.id);
    }

    const allocation = await new AllocationLifecycleService(db).createPendingAllocation({
      amount: parsed.data.amount,
      characterId: parsed.data.characterId,
      ratio: parsed.data.ratio,
      settlementId: parsed.data.settlementId,
      weight: parsed.data.weight,
    });

    return c.json(
      {
        allocation: toAllocationResponse(allocation),
        message: "Allocation created successfully.",
      },
      201,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404 | 409);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(updateLedgerAllocationStatusRoute, async (c) => {
  const paramsParsed =
    updateLedgerAllocationStatusRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c), "params"),
      422,
    );
  }

  const bodySchema =
    updateLedgerAllocationStatusRoute.request.body.content["application/json"].schema;
  const bodyParsed = bodySchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json(
      validationErrorFromIssues(bodyParsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);

    const db = new D1Client(c.env.APP_DB);
    const allocation = await requireLedgerAllocation(
      db,
      paramsParsed.data.allocationId,
      organization.id,
    );
    const updated = await new AllocationLifecycleService(db).transitionStatus(
      allocation.id,
      bodyParsed.data.status,
    );

    return c.json(
      {
        allocation: toAllocationResponse(updated),
        message: "Allocation status updated successfully.",
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404 | 409);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(createLedgerClaimRoute, async (c) => {
  const schema =
    createLedgerClaimRoute.request.body.content["application/json"].schema;
  const parsed = schema.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);

    const db = new D1Client(c.env.APP_DB);
    await requireLedgerAllocation(
      db,
      parsed.data.settlementAllocationId,
      organization.id,
    );
    if (parsed.data.claimedByCharacterId) {
      await requireLedgerCharacter(
        db,
        parsed.data.claimedByCharacterId,
        organization.id,
      );
    }

    const claim = await new ClaimLifecycleService(db).recordClaim({
      amount: parsed.data.amount,
      claimedAt: parsed.data.claimedAt,
      claimedByCharacterId: parsed.data.claimedByCharacterId,
      method: parsed.data.method,
      notes: parsed.data.notes,
      settlementAllocationId: parsed.data.settlementAllocationId,
    });

    return c.json(
      {
        claim: toClaimResponse(claim),
        message: "Claim recorded successfully.",
      },
      201,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404 | 409);
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(updateLedgerClaimStatusRoute, async (c) => {
  const paramsParsed =
    updateLedgerClaimStatusRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c), "params"),
      422,
    );
  }

  const bodySchema =
    updateLedgerClaimStatusRoute.request.body.content["application/json"].schema;
  const bodyParsed = bodySchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json(
      validationErrorFromIssues(bodyParsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = requireLedgerOrganization(c);
    const session = requireLedgerSession(c);

    const db = new D1Client(c.env.APP_DB);
    const { claim } = await requireLedgerClaim(
      db,
      paramsParsed.data.claimId,
      organization.id,
    );
    const updated = await new ClaimLifecycleService(db).transitionStatus(
      claim.id,
      bodyParsed.data.status,
      session.user.id,
    );

    return c.json(
      {
        claim: toClaimResponse(updated),
        message: "Claim status updated successfully.",
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404 | 409);
    }

    throw error;
  }
});

function mapEventSortColumn(sortBy: "occurredAt" | "createdAt" | "title" | "updatedAt") {
  switch (sortBy) {
    case "createdAt":
      return "created_at";
    case "title":
      return "title";
    case "updatedAt":
      return "updated_at";
    case "occurredAt":
    default:
      return "occurred_at";
  }
}

function mapSettlementSortColumn(
  sortBy: "decidedAt" | "createdAt" | "grossAmount" | "netAmount" | "updatedAt",
) {
  switch (sortBy) {
    case "createdAt":
      return "created_at";
    case "grossAmount":
      return "gross_amount";
    case "netAmount":
      return "net_amount";
    case "updatedAt":
      return "updated_at";
    case "decidedAt":
    default:
      return "decided_at";
  }
}

export function mapEventStatusGroup(
  group: "unsettled" | "settleable" | "settled" | "cancelled",
): readonly EventStatus[] {
  switch (group) {
    case "settleable":
      return ["open", "ready_for_settlement"];
    case "settled":
      return ["partially_settled", "settled"];
    case "cancelled":
      return ["cancelled"];
    case "unsettled":
    default:
      return ["open", "ready_for_settlement"];
  }
}

function isNumericIdentifier(value: string): boolean {
  return /^\d+$/.test(value);
}

async function resolvePublicOrganization(c: {
  env: AppBindings["Bindings"];
  req: { param(name: string): string };
}): Promise<PublicOrganizationContext> {
  const identifier = c.req.param("organization");
  const repository = new OrganizationsRepository(new D1Client(c.env.APP_DB));

  const organization = isNumericIdentifier(identifier)
    ? await repository.findById(Number(identifier))
    : await repository.findByVanity(identifier);

  if (!organization) {
    throw new AppError("Organization not found", 404, {
      code: "ORGANIZATION_NOT_FOUND",
    });
  }

  return {
    id: organization.id,
    name: organization.name,
    vanity: organization.vanity,
  };
}

async function resolveOrganizationViewer(
  c: Parameters<typeof organizationLedgerRouter.openapi>[1] extends never ? never : any,
  organizationId: number,
): Promise<OrganizationViewer> {
  const token = getSessionCookie(c);
  if (!token) {
    return { isMember: false, userId: null };
  }

  try {
    const session = await new SessionAuthService(c.env).requireActiveUser(token);
    const membership = await new OrganizationMembersRepository(
      new D1Client(c.env.APP_DB),
    ).findByOrganizationAndUser(organizationId, session.user.id);

    return {
      isMember: membership?.status === "active",
      userId: session.user.id,
    };
  } catch {
    return { isMember: false, userId: null };
  }
}

function getSnapshotCacheService(env: AppBindings["Bindings"]) {
  return new SnapshotCacheService(new KvJsonRepository(env.SNAPSHOT_CACHE));
}

function getThirtyMinuteBucket(date = new Date()): string {
  const bucket = new Date(date);
  bucket.setUTCMinutes(bucket.getUTCMinutes() < 30 ? 0 : 30, 0, 0);
  return bucket.toISOString().slice(0, 16);
}

async function readThroughDashboardSnapshot<T>(
  c: { env: AppBindings["Bindings"] },
  cacheKey: string,
  bypassRead: boolean,
  loader: () => Promise<T>,
): Promise<T> {
  const cache = getSnapshotCacheService(c.env);

  if (!bypassRead) {
    const cached = await cache.get<T>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const payload = await loader();
  await cache.put(cacheKey, payload, cache.ttl.publicDashboardSnapshot);
  return payload;
}

function buildSettlementParticipantConflictResponse(
  c: { req: { header(name: string): string | undefined | null } },
  message: string,
  participantValidation: SettlementParticipantValidation,
) {
  return {
    code: "SETTLEMENT_PARTICIPANT_CONFIRMATION_REQUIRED",
    error: "Settlement participant confirmation required",
    message,
    participantValidation,
    requestId: c.req.header("X-Request-Id") ?? "",
  };
}

function toEventResponse(event: EventRecord) {
  return {
    assetId: event.asset_id,
    createdAt: event.created_at,
    createdByUserId: event.created_by_user_id,
    eventKey: event.event_key,
    eventType: event.event_type,
    gameId: event.game_id,
    holderRef: event.holder_ref,
    holderType: event.holder_type,
    id: event.id,
    notes: event.notes,
    occurredAt: event.occurred_at,
    organizationId: event.organization_id,
    sourceType: event.source_type,
    status: event.status,
    title: event.title,
    updatedAt: event.updated_at,
  };
}

function toSettlementResponse(settlement: SettlementRecord) {
  return {
    allocationMode: settlement.allocation_mode,
    createdAt: settlement.created_at,
    createdByUserId: settlement.created_by_user_id,
    decidedAt: settlement.decided_at,
    eventId: settlement.event_id,
    feeAmount: settlement.fee_amount,
    feeMode: settlement.fee_mode,
    feePercent: settlement.fee_percent,
    feeRuleKey: settlement.fee_rule_key,
    grossAmount: settlement.gross_amount,
    id: settlement.id,
    netAmount: settlement.net_amount,
    notes: settlement.notes,
    organizationId: settlement.organization_id,
    participantExceptionConfirmed: settlement.participant_exception_confirmed === 1,
    participantExceptionReason: settlement.participant_exception_reason,
    payerRef: settlement.payer_ref,
    payerType: settlement.payer_type,
    settlementKey: settlement.settlement_key,
    settlementType: settlement.settlement_type,
    status: settlement.status,
    title: settlement.title,
    unitAssetId: settlement.unit_asset_id,
    updatedAt: settlement.updated_at,
  };
}

function toAllocationResponse(allocation: SettlementAllocationRecord) {
  return {
    amount: allocation.amount,
    characterId: allocation.character_id,
    createdAt: allocation.created_at,
    id: allocation.id,
    ratio: allocation.ratio,
    settlementId: allocation.settlement_id,
    status: allocation.status,
    updatedAt: allocation.updated_at,
    weight: allocation.weight,
  };
}

function toClaimResponse(claim: SettlementClaimRecord) {
  return {
    amount: claim.amount,
    claimedAt: claim.claimed_at,
    claimedByCharacterId: claim.claimed_by_character_id,
    confirmedAt: claim.confirmed_at,
    confirmedByUserId: claim.confirmed_by_user_id,
    createdAt: claim.created_at,
    id: claim.id,
    method: claim.method,
    notes: claim.notes,
    settlementAllocationId: claim.settlement_allocation_id,
    status: claim.status,
    updatedAt: claim.updated_at,
    voidedAt: claim.voided_at,
    voidedByUserId: claim.voided_by_user_id,
  };
}

function toSettlementDefaultUnit(asset: AssetRecord) {
  return {
    assetKey: asset.asset_key,
    assetType: asset.asset_type,
    id: asset.id,
    name: asset.name,
    organizationId: asset.organization_id,
    scope: asset.scope,
    status: asset.status,
  };
}
