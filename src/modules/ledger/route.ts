import { OpenAPIHono } from "@hono/zod-openapi";
import { D1Client } from "../../infrastructure/d1/d1-client";
import { AppError, buildErrorResponseBody, ensureRequestId } from "../../lib/errors";
import { GamesRepository } from "../../repositories/games-repository";
import { OrganizationGamesRepository } from "../../repositories/organization-games-repository";
import type {
  AssetRecord,
  EventRecord,
  EventStatus,
  SettlementAllocationRecord,
  SettlementClaimRecord,
  SettlementRecord,
} from "../../repositories/types";
import { AssetIdentityResolutionService } from "../../services/assets/asset-identity-resolution-service";
import { AllocationLifecycleService } from "../../services/ledger/allocation-lifecycle-service";
import { ClaimLifecycleService } from "../../services/ledger/claim-lifecycle-service";
import { EventLifecycleService } from "../../services/ledger/event-lifecycle-service";
import { SettlementLifecycleService } from "../../services/ledger/settlement-lifecycle-service";
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
  createLedgerClaimRoute,
  createLedgerEventRoute,
  createLedgerSettlementRoute,
  getLedgerEventRoute,
  getLedgerSettlementDefaultsRoute,
  listLedgerEventsRoute,
  listLedgerSettlementsRoute,
  updateLedgerAllocationStatusRoute,
  updateLedgerClaimStatusRoute,
  updateLedgerEventStatusRoute,
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

organizationLedgerRouter.use(
  "/{organization}/ledger/events",
  requireLedgerMember,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/events/{eventId}/status",
  requireLedgerManager,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/settlements",
  requireLedgerMember,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/settlements/{settlementId}/status",
  requireLedgerManager,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/settlement-defaults",
  requireLedgerMember,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/allocations",
  requireLedgerManager,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/allocations/{allocationId}/status",
  requireLedgerManager,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/claims",
  requireLedgerMember,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/claims/{claimId}/status",
  requireLedgerManager,
);

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

    return c.json(
      {
        events: events.map(toEventResponse),
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
        event: toEventResponse(event),
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

    return c.json(
      {
        event: toEventResponse(event),
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
        event: toEventResponse(updated),
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
    if (parsed.data.eventId) {
      await requireLedgerEvent(db, parsed.data.eventId, organization.id);
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

function mapEventStatusGroup(
  group: "unsettled" | "settleable" | "settled" | "cancelled",
): readonly EventStatus[] {
  switch (group) {
    case "settleable":
      return ["ready_for_settlement", "partially_settled"];
    case "settled":
      return ["settled"];
    case "cancelled":
      return ["cancelled"];
    case "unsettled":
    default:
      return ["open", "ready_for_settlement", "partially_settled"];
  }
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
