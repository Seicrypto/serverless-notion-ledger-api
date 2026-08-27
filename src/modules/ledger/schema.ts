import { createRoute, z } from "@hono/zod-openapi";
import { errorSchema, validationErrorSchema } from "../../lib/openapi";

const eventSchema = z
  .object({
    assetId: z.number().int().positive().nullable(),
    createdAt: z.string(),
    createdByUserId: z.number().int().positive().nullable(),
    eventKey: z.string(),
    eventType: z.enum([
      "loot",
      "raid",
      "activity",
      "bonus",
      "salary",
      "guild_event",
      "other",
    ]),
    gameId: z.number().int().positive().nullable(),
    holderRef: z.string().nullable(),
    holderType: z.enum(["character", "org_treasury", "market", "external", "custom"]),
    id: z.number().int().positive(),
    notes: z.string().nullable(),
    occurredAt: z.string(),
    organizationId: z.number().int().positive(),
    sourceType: z.enum(["manual", "api", "import"]),
    status: z.enum([
      "open",
      "ready_for_settlement",
      "partially_settled",
      "settled",
      "cancelled",
    ]),
    title: z.string(),
    updatedAt: z.string(),
  })
  .openapi("LedgerEvent");

const settlementSchema = z
  .object({
    allocationMode: z.enum(["equal", "weight", "manual"]),
    createdAt: z.string(),
    createdByUserId: z.number().int().positive().nullable(),
    decidedAt: z.string(),
    eventId: z.number().int().positive().nullable(),
    feeAmount: z.number().nullable(),
    feeMode: z.enum(["none", "percent", "fixed", "rule"]),
    feePercent: z.number().nullable(),
    feeRuleKey: z.string().nullable(),
    grossAmount: z.number(),
    id: z.number().int().positive(),
    netAmount: z.number(),
    notes: z.string().nullable(),
    organizationId: z.number().int().positive(),
    payerRef: z.string().nullable(),
    payerType: z.enum(["character", "org_treasury", "external", "custom"]),
    settlementKey: z.string(),
    settlementType: z.enum([
      "sale",
      "bonus",
      "salary",
      "reward",
      "subsidy",
      "adjustment",
    ]),
    status: z.enum(["draft", "calculated", "paying", "paid", "cancelled"]),
    title: z.string(),
    unitAssetId: z.number().int().positive().nullable(),
    updatedAt: z.string(),
  })
  .openapi("LedgerSettlement");

const allocationSchema = z
  .object({
    amount: z.number(),
    characterId: z.number().int().positive().nullable(),
    createdAt: z.string(),
    id: z.number().int().positive(),
    ratio: z.number().nullable(),
    settlementId: z.number().int().positive(),
    status: z.enum(["pending", "claimed", "waived", "cancelled"]),
    updatedAt: z.string(),
    weight: z.number(),
  })
  .openapi("LedgerSettlementAllocation");

const claimSchema = z
  .object({
    amount: z.number(),
    claimedAt: z.string(),
    claimedByCharacterId: z.number().int().positive().nullable(),
    confirmedAt: z.string().nullable(),
    confirmedByUserId: z.number().int().positive().nullable(),
    createdAt: z.string(),
    id: z.number().int().positive(),
    method: z.enum(["manual", "in_game_mail", "trade", "bank", "other"]),
    notes: z.string().nullable(),
    settlementAllocationId: z.number().int().positive(),
    status: z.enum(["recorded", "confirmed", "voided"]),
    updatedAt: z.string(),
    voidedAt: z.string().nullable(),
    voidedByUserId: z.number().int().positive().nullable(),
  })
  .openapi("LedgerSettlementClaim");

const organizationParamSchema = z
  .object({
    organization: z.string().trim().min(1),
  })
  .openapi("LedgerOrganizationParam");

const eventIdParamSchema = z
  .object({
    eventId: z.coerce.number().int().positive(),
    organization: z.string().trim().min(1),
  })
  .openapi("LedgerEventIdParam");

const settlementIdParamSchema = z
  .object({
    organization: z.string().trim().min(1),
    settlementId: z.coerce.number().int().positive(),
  })
  .openapi("LedgerSettlementIdParam");

const allocationIdParamSchema = z
  .object({
    allocationId: z.coerce.number().int().positive(),
    organization: z.string().trim().min(1),
  })
  .openapi("LedgerAllocationIdParam");

const claimIdParamSchema = z
  .object({
    claimId: z.coerce.number().int().positive(),
    organization: z.string().trim().min(1),
  })
  .openapi("LedgerClaimIdParam");

const createEventRequestSchema = z
  .object({
    assetId: z.number().int().positive().nullable().optional(),
    eventType: z
      .enum(["loot", "raid", "activity", "bonus", "salary", "guild_event", "other"])
      .optional(),
    gameId: z.number().int().positive().nullable().optional(),
    holderRef: z.string().trim().max(255).nullable().optional(),
    holderType: z
      .enum(["character", "org_treasury", "market", "external", "custom"])
      .optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    occurredAt: z.string().datetime(),
    sourceType: z.enum(["manual", "api", "import"]).optional(),
    title: z.string().trim().min(1).max(160),
  })
  .openapi("CreateLedgerEventRequest");

const updateEventStatusRequestSchema = z
  .object({
    status: z.enum(["ready_for_settlement", "cancelled"]),
  })
  .openapi("UpdateLedgerEventStatusRequest");

const createSettlementRequestSchema = z
  .object({
    allocationMode: z.enum(["equal", "weight", "manual"]).optional(),
    decidedAt: z.string().datetime(),
    eventId: z.number().int().positive().nullable().optional(),
    feeAmount: z.number().nullable().optional(),
    feeMode: z.enum(["none", "percent", "fixed", "rule"]).optional(),
    feePercent: z.number().nullable().optional(),
    feeRuleKey: z.string().trim().max(255).nullable().optional(),
    grossAmount: z.number().nonnegative(),
    netAmount: z.number().nonnegative(),
    notes: z.string().trim().max(4000).nullable().optional(),
    payerRef: z.string().trim().max(255).nullable().optional(),
    payerType: z.enum(["character", "org_treasury", "external", "custom"]).optional(),
    settlementType: z
      .enum(["sale", "bonus", "salary", "reward", "subsidy", "adjustment"])
      .optional(),
    title: z.string().trim().min(1).max(160),
    unitAssetId: z.number().int().positive().nullable().optional(),
  })
  .openapi("CreateLedgerSettlementRequest");

const updateSettlementStatusRequestSchema = z
  .object({
    status: z.enum(["calculated", "paying", "paid", "cancelled"]),
  })
  .openapi("UpdateLedgerSettlementStatusRequest");

const createAllocationRequestSchema = z
  .object({
    amount: z.number().nonnegative(),
    characterId: z.number().int().positive().nullable().optional(),
    ratio: z.number().nonnegative().nullable().optional(),
    settlementId: z.number().int().positive(),
    weight: z.number().positive().optional(),
  })
  .openapi("CreateLedgerAllocationRequest");

const updateAllocationStatusRequestSchema = z
  .object({
    status: z.enum(["waived", "cancelled"]),
  })
  .openapi("UpdateLedgerAllocationStatusRequest");

const createClaimRequestSchema = z
  .object({
    amount: z.number().nonnegative(),
    claimedAt: z.string().datetime(),
    claimedByCharacterId: z.number().int().positive().nullable().optional(),
    method: z.enum(["manual", "in_game_mail", "trade", "bank", "other"]).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    settlementAllocationId: z.number().int().positive(),
  })
  .openapi("CreateLedgerClaimRequest");

const updateClaimStatusRequestSchema = z
  .object({
    status: z.enum(["confirmed", "voided"]),
  })
  .openapi("UpdateLedgerClaimStatusRequest");

const eventResponseSchema = z
  .object({
    event: eventSchema,
    message: z.string(),
  })
  .openapi("LedgerEventResponse");

const settlementResponseSchema = z
  .object({
    message: z.string(),
    settlement: settlementSchema,
  })
  .openapi("LedgerSettlementResponse");

const allocationResponseSchema = z
  .object({
    allocation: allocationSchema,
    message: z.string(),
  })
  .openapi("LedgerAllocationResponse");

const claimResponseSchema = z
  .object({
    claim: claimSchema,
    message: z.string(),
  })
  .openapi("LedgerClaimResponse");

export const createLedgerEventRoute = createRoute({
  method: "post",
  path: "/{organization}/ledger/events",
  tags: ["Ledger", "Events"],
  request: {
    params: organizationParamSchema,
    body: {
      content: { "application/json": { schema: createEventRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: eventResponseSchema } },
      description: "Create a ledger event.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization membership required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Organization or related record not found." },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Business rule conflict." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const updateLedgerEventStatusRoute = createRoute({
  method: "patch",
  path: "/{organization}/ledger/events/{eventId}/status",
  tags: ["Ledger", "Events"],
  request: {
    params: eventIdParamSchema,
    body: {
      content: { "application/json": { schema: updateEventStatusRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: eventResponseSchema } },
      description: "Update a ledger event status.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization manager access required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Event not found." },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Business rule conflict." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const createLedgerSettlementRoute = createRoute({
  method: "post",
  path: "/{organization}/ledger/settlements",
  tags: ["Ledger", "Settlements"],
  request: {
    params: organizationParamSchema,
    body: {
      content: { "application/json": { schema: createSettlementRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: settlementResponseSchema } },
      description: "Create a draft settlement.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization manager access required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Related record not found." },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Business rule conflict." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const updateLedgerSettlementStatusRoute = createRoute({
  method: "patch",
  path: "/{organization}/ledger/settlements/{settlementId}/status",
  tags: ["Ledger", "Settlements"],
  request: {
    params: settlementIdParamSchema,
    body: {
      content: {
        "application/json": { schema: updateSettlementStatusRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: settlementResponseSchema } },
      description: "Update a settlement status.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization manager access required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Settlement not found." },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Business rule conflict." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const createLedgerAllocationRoute = createRoute({
  method: "post",
  path: "/{organization}/ledger/allocations",
  tags: ["Ledger", "Allocations"],
  request: {
    params: organizationParamSchema,
    body: {
      content: { "application/json": { schema: createAllocationRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: allocationResponseSchema } },
      description: "Create a settlement allocation.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization manager access required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Settlement or character not found." },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Business rule conflict." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const updateLedgerAllocationStatusRoute = createRoute({
  method: "patch",
  path: "/{organization}/ledger/allocations/{allocationId}/status",
  tags: ["Ledger", "Allocations"],
  request: {
    params: allocationIdParamSchema,
    body: {
      content: {
        "application/json": { schema: updateAllocationStatusRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: allocationResponseSchema } },
      description: "Update an allocation status.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization manager access required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Allocation not found." },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Business rule conflict." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const createLedgerClaimRoute = createRoute({
  method: "post",
  path: "/{organization}/ledger/claims",
  tags: ["Ledger", "Claims"],
  request: {
    params: organizationParamSchema,
    body: {
      content: { "application/json": { schema: createClaimRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: claimResponseSchema } },
      description: "Record a settlement claim.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization membership required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Allocation or character not found." },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Business rule conflict." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const updateLedgerClaimStatusRoute = createRoute({
  method: "patch",
  path: "/{organization}/ledger/claims/{claimId}/status",
  tags: ["Ledger", "Claims"],
  request: {
    params: claimIdParamSchema,
    body: {
      content: {
        "application/json": { schema: updateClaimStatusRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: claimResponseSchema } },
      description: "Update a claim status.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization manager access required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Claim not found." },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Business rule conflict." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});
