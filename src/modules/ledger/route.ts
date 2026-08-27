import { OpenAPIHono } from "@hono/zod-openapi";
import { D1Client } from "../../infrastructure/d1/d1-client";
import {
  AppError,
  buildErrorResponseBody,
  ensureRequestId,
} from "../../lib/errors";
import { CharactersRepository } from "../../repositories/characters-repository";
import { EventsRepository } from "../../repositories/events-repository";
import { SettlementAllocationsRepository } from "../../repositories/settlement-allocations-repository";
import { SettlementClaimsRepository } from "../../repositories/settlement-claims-repository";
import { SettlementsRepository } from "../../repositories/settlements-repository";
import type {
  EventRecord,
  SettlementAllocationRecord,
  SettlementClaimRecord,
  SettlementRecord,
} from "../../repositories/types";
import { AllocationLifecycleService } from "../../services/ledger/allocation-lifecycle-service";
import { ClaimLifecycleService } from "../../services/ledger/claim-lifecycle-service";
import { EventLifecycleService } from "../../services/ledger/event-lifecycle-service";
import { SettlementLifecycleService } from "../../services/ledger/settlement-lifecycle-service";
import type { AppBindings } from "../../types/hono";
import {
  requireTargetOrganizationManager,
  requireTargetOrganizationMember,
} from "../organizations/middleware";
import {
  createLedgerAllocationRoute,
  createLedgerClaimRoute,
  createLedgerEventRoute,
  createLedgerSettlementRoute,
  updateLedgerAllocationStatusRoute,
  updateLedgerClaimStatusRoute,
  updateLedgerEventStatusRoute,
  updateLedgerSettlementStatusRoute,
} from "./schema";

export const organizationLedgerRouter = new OpenAPIHono<AppBindings>();

function validationErrorFromIssues(
  issues: Array<{ message: string; path: PropertyKey[] }>,
  requestId: string,
) {
  return {
    code: "VALIDATION_ERROR",
    error: "Validation failed",
    issues: issues.map((issue) => {
      const path = issue.path.map(String).join(".") || "body";
      return `${path}: ${issue.message}`;
    }),
    requestId,
  };
}

organizationLedgerRouter.use(
  "/{organization}/ledger/events",
  requireTargetOrganizationMember,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/events/{eventId}/status",
  requireTargetOrganizationManager,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/settlements",
  requireTargetOrganizationManager,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/settlements/{settlementId}/status",
  requireTargetOrganizationManager,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/allocations",
  requireTargetOrganizationManager,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/allocations/{allocationId}/status",
  requireTargetOrganizationManager,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/claims",
  requireTargetOrganizationMember,
);
organizationLedgerRouter.use(
  "/{organization}/ledger/claims/{claimId}/status",
  requireTargetOrganizationManager,
);

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
    const organization = c.get("organization");
    const session = c.get("session");
    if (!organization || !session) {
      throw new AppError("Organization context is required", 404, {
        code: "ORGANIZATION_CONTEXT_REQUIRED",
      });
    }

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
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
      );
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(updateLedgerEventStatusRoute, async (c) => {
  const paramsParsed = updateLedgerEventStatusRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c)),
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
    const organization = c.get("organization");
    if (!organization) {
      throw new AppError("Organization context is required", 404, {
        code: "ORGANIZATION_CONTEXT_REQUIRED",
      });
    }

    const db = new D1Client(c.env.APP_DB);
    const event = await requireOrganizationEvent(
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
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
      );
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
    const organization = c.get("organization");
    const session = c.get("session");
    if (!organization || !session) {
      throw new AppError("Organization context is required", 404, {
        code: "ORGANIZATION_CONTEXT_REQUIRED",
      });
    }

    const db = new D1Client(c.env.APP_DB);
    if (parsed.data.eventId) {
      await requireOrganizationEvent(db, parsed.data.eventId, organization.id);
    }

    const service = new SettlementLifecycleService(db);
    const settlement = await service.createDraftSettlement({
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
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
      );
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(updateLedgerSettlementStatusRoute, async (c) => {
  const paramsParsed =
    updateLedgerSettlementStatusRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c)),
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
    const organization = c.get("organization");
    if (!organization) {
      throw new AppError("Organization context is required", 404, {
        code: "ORGANIZATION_CONTEXT_REQUIRED",
      });
    }

    const db = new D1Client(c.env.APP_DB);
    const settlement = await requireOrganizationSettlement(
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
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
      );
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
    const organization = c.get("organization");
    if (!organization) {
      throw new AppError("Organization context is required", 404, {
        code: "ORGANIZATION_CONTEXT_REQUIRED",
      });
    }

    const db = new D1Client(c.env.APP_DB);
    await requireOrganizationSettlement(db, parsed.data.settlementId, organization.id);
    if (parsed.data.characterId) {
      await requireOrganizationCharacter(db, parsed.data.characterId, organization.id);
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
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
      );
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(updateLedgerAllocationStatusRoute, async (c) => {
  const paramsParsed =
    updateLedgerAllocationStatusRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c)),
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
    const organization = c.get("organization");
    if (!organization) {
      throw new AppError("Organization context is required", 404, {
        code: "ORGANIZATION_CONTEXT_REQUIRED",
      });
    }

    const db = new D1Client(c.env.APP_DB);
    const allocation = await requireOrganizationAllocation(
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
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
      );
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
    const organization = c.get("organization");
    if (!organization) {
      throw new AppError("Organization context is required", 404, {
        code: "ORGANIZATION_CONTEXT_REQUIRED",
      });
    }

    const db = new D1Client(c.env.APP_DB);
    await requireOrganizationAllocation(
      db,
      parsed.data.settlementAllocationId,
      organization.id,
    );
    if (parsed.data.claimedByCharacterId) {
      await requireOrganizationCharacter(
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
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
      );
    }

    throw error;
  }
});

organizationLedgerRouter.openapi(updateLedgerClaimStatusRoute, async (c) => {
  const paramsParsed =
    updateLedgerClaimStatusRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c)),
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
    const organization = c.get("organization");
    const session = c.get("session");
    if (!organization || !session) {
      throw new AppError("Organization context is required", 404, {
        code: "ORGANIZATION_CONTEXT_REQUIRED",
      });
    }

    const db = new D1Client(c.env.APP_DB);
    const { claim } = await requireOrganizationClaim(
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
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
      );
    }

    throw error;
  }
});

async function requireOrganizationEvent(
  db: D1Client,
  eventId: number,
  organizationId: number,
) {
  const event = await new EventsRepository(db).findById(eventId);
  if (!event) {
    throw new AppError("Event not found", 404, {
      code: "EVENT_NOT_FOUND",
    });
  }

  if (event.organization_id !== organizationId) {
    throw new AppError("Event does not belong to this organization", 404, {
      code: "EVENT_NOT_FOUND",
    });
  }

  return event;
}

async function requireOrganizationSettlement(
  db: D1Client,
  settlementId: number,
  organizationId: number,
) {
  const settlement = await new SettlementsRepository(db).findById(settlementId);
  if (!settlement) {
    throw new AppError("Settlement not found", 404, {
      code: "SETTLEMENT_NOT_FOUND",
    });
  }

  if (settlement.organization_id !== organizationId) {
    throw new AppError("Settlement does not belong to this organization", 404, {
      code: "SETTLEMENT_NOT_FOUND",
    });
  }

  return settlement;
}

async function requireOrganizationAllocation(
  db: D1Client,
  allocationId: number,
  organizationId: number,
) {
  const allocation = await new SettlementAllocationsRepository(db).findById(allocationId);
  if (!allocation) {
    throw new AppError("Allocation not found", 404, {
      code: "ALLOCATION_NOT_FOUND",
    });
  }

  await requireOrganizationSettlement(db, allocation.settlement_id, organizationId);
  return allocation;
}

async function requireOrganizationClaim(
  db: D1Client,
  claimId: number,
  organizationId: number,
) {
  const claim = await new SettlementClaimsRepository(db).findById(claimId);
  if (!claim) {
    throw new AppError("Claim not found", 404, {
      code: "CLAIM_NOT_FOUND",
    });
  }

  const allocation = await requireOrganizationAllocation(
    db,
    claim.settlement_allocation_id,
    organizationId,
  );
  return { allocation, claim };
}

async function requireOrganizationCharacter(
  db: D1Client,
  characterId: number,
  organizationId: number,
) {
  const character = await new CharactersRepository(db).findById(characterId);
  if (!character) {
    throw new AppError("Character not found", 404, {
      code: "CHARACTER_NOT_FOUND",
    });
  }

  if (character.organization_id !== organizationId) {
    throw new AppError("Character does not belong to this organization", 404, {
      code: "CHARACTER_NOT_FOUND",
    });
  }

  return character;
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
