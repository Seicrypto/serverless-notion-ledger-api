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

const eventParticipantCharacterSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    slug: z.string().nullable(),
    vanity: z.string().nullable(),
  })
  .nullable()
  .openapi("LedgerEventParticipantCharacter");

const eventParticipantSchema = z
  .object({
    character: eventParticipantCharacterSchema,
    characterId: z.number().int().positive().nullable(),
    createdAt: z.string(),
    eventId: z.number().int().positive(),
    id: z.number().int().positive(),
    joinedAt: z.string().nullable(),
    leftAt: z.string().nullable(),
    roleLabel: z.string().nullable(),
    updatedAt: z.string(),
    weight: z.number(),
  })
  .openapi("LedgerEventParticipant");

const eventDetailSchema = eventSchema
  .extend({
    participants: z.array(eventParticipantSchema),
  })
  .openapi("LedgerEventDetail");

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
    participantExceptionConfirmed: z.boolean(),
    participantExceptionReason: z.string().nullable(),
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

const settlementParticipantValidationSchema = z
  .object({
    eventParticipantCharacterIds: z.array(z.number().int().positive()),
    eventParticipantCount: z.number().int().nonnegative(),
    hasParticipantMismatch: z.boolean(),
    omittedParticipantCharacterIds: z.array(z.number().int().positive()),
    recipientCharacterIds: z.array(z.number().int().positive()),
    requiresConfirmation: z.boolean(),
    unexpectedRecipientCharacterIds: z.array(z.number().int().positive()),
  })
  .openapi("LedgerSettlementParticipantValidation");

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
    participants: z
      .array(
        z.object({
          characterId: z.number().int().positive().nullable().optional(),
          joinedAt: z.string().datetime().nullable().optional(),
          leftAt: z.string().datetime().nullable().optional(),
          roleLabel: z.string().trim().max(120).nullable().optional(),
          weight: z.number().positive().optional(),
        }),
      )
      .max(200)
      .optional(),
    sourceType: z.enum(["manual", "api", "import"]).optional(),
    title: z.string().trim().min(1).max(160),
  })
  .openapi("CreateLedgerEventRequest");

const updateEventRequestSchema = z
  .object({
    assetId: z.number().int().positive().nullable().optional(),
    gameId: z.number().int().positive().nullable().optional(),
    holderRef: z.string().trim().max(255).nullable().optional(),
    holderType: z
      .enum(["character", "org_treasury", "market", "external", "custom"])
      .optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    occurredAt: z.string().datetime().optional(),
    participants: z
      .array(
        z.object({
          characterId: z.number().int().positive().nullable().optional(),
          joinedAt: z.string().datetime().nullable().optional(),
          leftAt: z.string().datetime().nullable().optional(),
          roleLabel: z.string().trim().max(120).nullable().optional(),
          weight: z.number().positive().optional(),
        }),
      )
      .max(200)
      .optional(),
    title: z.string().trim().min(1).max(160).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })
  .openapi("UpdateLedgerEventRequest");

const createEventBatchRequestSchema = z
  .object({
    events: z.array(createEventRequestSchema).min(1).max(100),
  })
  .openapi("CreateLedgerEventBatchRequest");

const createEventBatchResponseSchema = z
  .object({
    events: z.array(eventDetailSchema),
    message: z.string(),
  })
  .openapi("CreateLedgerEventBatchResponse");

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
    confirmParticipantException: z.boolean().optional(),
    payerRef: z.string().trim().max(255).nullable().optional(),
    payerType: z.enum(["character", "org_treasury", "external", "custom"]).optional(),
    participantExceptionReason: z.string().trim().max(1000).nullable().optional(),
    recipientCharacterIds: z.array(z.number().int().positive()).max(200).optional(),
    settlementType: z
      .enum(["sale", "bonus", "salary", "reward", "subsidy", "adjustment"])
      .optional(),
    title: z.string().trim().min(1).max(160),
    unitAssetId: z.number().int().positive().nullable().optional(),
  })
  .openapi("CreateLedgerSettlementRequest");

const settleEventRequestSchema = createSettlementRequestSchema
  .omit({ eventId: true })
  .openapi("SettleLedgerEventRequest");

const updateSettlementRequestSchema = z
  .object({
    allocationMode: z.enum(["equal", "weight", "manual"]).optional(),
    decidedAt: z.string().datetime().optional(),
    feeAmount: z.number().nullable().optional(),
    feeMode: z.enum(["none", "percent", "fixed", "rule"]).optional(),
    feePercent: z.number().nullable().optional(),
    feeRuleKey: z.string().trim().max(255).nullable().optional(),
    grossAmount: z.number().nonnegative().optional(),
    netAmount: z.number().nonnegative().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    payerRef: z.string().trim().max(255).nullable().optional(),
    payerType: z.enum(["character", "org_treasury", "external", "custom"]).optional(),
    participantExceptionReason: z.string().trim().max(1000).nullable().optional(),
    settlementType: z
      .enum(["sale", "bonus", "salary", "reward", "subsidy", "adjustment"])
      .optional(),
    title: z.string().trim().min(1).max(160).optional(),
    unitAssetId: z.number().int().positive().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })
  .openapi("UpdateLedgerSettlementRequest");

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
    event: eventDetailSchema,
    message: z.string(),
  })
  .openapi("LedgerEventResponse");

const settlementResponseSchema = z
  .object({
    message: z.string(),
    settlement: settlementSchema,
    participantValidation: settlementParticipantValidationSchema.nullable(),
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

const dashboardClaimStatusSchema = z
  .enum(["none", "partial", "claimed", "confirmed"])
  .openapi("LedgerDashboardClaimStatus");

const paginationSchema = z
  .object({
    hasMore: z.boolean(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .openapi("LedgerPagination");

const eventListQuerySchema = z
  .object({
    assetId: z.coerce.number().int().positive().optional(),
    createdByUserId: z.coerce.number().int().positive().optional(),
    eventType: z
      .enum(["loot", "raid", "activity", "bonus", "salary", "guild_event", "other"])
      .optional(),
    fromOccurredAt: z.string().datetime().optional(),
    holderRef: z.string().trim().min(1).max(255).optional(),
    holderType: z
      .enum(["character", "org_treasury", "market", "external", "custom"])
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    sortBy: z.enum(["occurredAt", "createdAt", "title", "updatedAt"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    status: z
      .enum([
        "open",
        "ready_for_settlement",
        "partially_settled",
        "settled",
        "cancelled",
      ])
      .optional(),
    statusGroup: z
      .enum(["unsettled", "settleable", "settled", "cancelled"])
      .optional(),
    toOccurredAt: z.string().datetime().optional(),
  })
  .openapi("LedgerEventListQuery");

const settlementListQuerySchema = z
  .object({
    createdByUserId: z.coerce.number().int().positive().optional(),
    eventId: z.coerce.number().int().positive().optional(),
    feeMode: z.enum(["none", "percent", "fixed", "rule"]).optional(),
    fromDecidedAt: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    sortBy: z
      .enum(["decidedAt", "createdAt", "grossAmount", "netAmount", "updatedAt"])
      .optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    status: z.enum(["draft", "calculated", "paying", "paid", "cancelled"]).optional(),
    settlementType: z
      .enum(["sale", "bonus", "salary", "reward", "subsidy", "adjustment"])
      .optional(),
    toDecidedAt: z.string().datetime().optional(),
    unitAssetId: z.coerce.number().int().positive().optional(),
  })
  .openapi("LedgerSettlementListQuery");

const settlementDefaultsQuerySchema = z
  .object({
    gameId: z.coerce.number().int().positive().optional(),
  })
  .openapi("LedgerSettlementDefaultsQuery");

const settlementDefaultUnitSchema = z
  .object({
    assetKey: z.string(),
    assetType: z.enum(["item", "currency", "ticket", "reward", "service", "other"]),
    id: z.number().int().positive(),
    name: z.string(),
    organizationId: z.number().int().positive().nullable(),
    scope: z.enum(["global", "organization"]),
    status: z.enum(["candidate", "org_verified", "active", "merged", "deprecated"]),
  })
  .nullable()
  .openapi("LedgerSettlementDefaultUnit");

const settlementDefaultsResponseSchema = z
  .object({
    defaults: z.object({
      defaultAllocationMode: z.enum(["equal", "weight", "manual"]),
      defaultFeeMode: z.enum(["none", "percent", "fixed", "rule"]),
      defaultSettlementUnit: settlementDefaultUnitSchema,
      supportedAllocationModes: z.array(z.enum(["equal", "weight", "manual"])),
      supportedFeeModes: z.array(z.enum(["none", "percent", "fixed", "rule"])),
    }),
    game: z
      .object({
        id: z.number().int().positive(),
        name: z.string(),
        organizationDisplayName: z.string().nullable(),
        slug: z.string(),
        source: z.enum(["internal", "steam"]),
        type: z.enum(["game", "activity"]),
      })
      .nullable(),
  })
  .openapi("LedgerSettlementDefaultsResponse");

const eventListResponseSchema = z
  .object({
    events: z.array(eventSchema),
    pagination: paginationSchema,
  })
  .openapi("LedgerEventListResponse");

const settlementListResponseSchema = z
  .object({
    pagination: paginationSchema,
    settlements: z.array(settlementSchema),
  })
  .openapi("LedgerSettlementListResponse");

const claimableUnitBreakdownSchema = z
  .object({
    allocationCount: z.number().int().nonnegative(),
    amountTotal: z.number().nonnegative(),
    unitAssetId: z.number().int().positive().nullable(),
    unitAssetName: z.string().nullable(),
  })
  .openapi("LedgerClaimableUnitBreakdown");

const claimableRecipientSummarySchema = z
  .object({
    characterId: z.number().int().positive(),
    characterName: z.string(),
    hasSiblingCharactersPending: z.boolean(),
    memberDisplayName: z.string().nullable(),
    memberUserId: z.number().int().positive().nullable(),
    pendingAllocationCount: z.number().int().nonnegative(),
    pendingClaimAmountTotal: z.number().nonnegative(),
    pendingUnitBreakdown: z.array(claimableUnitBreakdownSchema),
  })
  .openapi("LedgerClaimableRecipientSummary");

const claimableRecipientSummaryListResponseSchema = z
  .object({
    recipients: z.array(claimableRecipientSummarySchema),
  })
  .openapi("LedgerClaimableRecipientSummaryListResponse");

const claimableRecipientDetailQuerySchema = z
  .object({
    includeSiblingCharacters: z.coerce.boolean().optional(),
  })
  .openapi("LedgerClaimableRecipientDetailQuery");

const claimableRecipientDetailSchema = z
  .object({
    allocationId: z.number().int().positive(),
    amount: z.number().nonnegative(),
    eventId: z.number().int().positive().nullable(),
    eventKey: z.string().nullable(),
    eventOccurredAt: z.string().nullable(),
    eventStatus: z
      .enum([
        "open",
        "ready_for_settlement",
        "partially_settled",
        "settled",
        "cancelled",
      ])
      .nullable(),
    eventTitle: z.string().nullable(),
    eventType: z
      .enum(["loot", "raid", "activity", "bonus", "salary", "guild_event", "other"])
      .nullable(),
    ratio: z.number().nullable(),
    settlementDecidedAt: z.string(),
    settlementId: z.number().int().positive(),
    settlementKey: z.string(),
    settlementStatus: z.enum(["draft", "calculated", "paying", "paid", "cancelled"]),
    settlementTitle: z.string(),
    settlementType: z.enum(["sale", "bonus", "salary", "reward", "subsidy", "adjustment"]),
    unitAssetId: z.number().int().positive().nullable(),
    unitAssetName: z.string().nullable(),
    weight: z.number(),
  })
  .openapi("LedgerClaimableRecipientAllocation");

const claimableRecipientDetailResponseSchema = z
  .object({
    allocations: z.array(claimableRecipientDetailSchema),
    recipient: claimableRecipientSummarySchema,
    siblingCharacters: z.array(claimableRecipientSummarySchema),
    unitBreakdown: z.array(claimableUnitBreakdownSchema),
  })
  .openapi("LedgerClaimableRecipientDetailResponse");

const batchClaimItemRequestSchema = z
  .object({
    amount: z.number().nonnegative(),
    claimedByCharacterId: z.number().int().positive().nullable().optional(),
    settlementAllocationId: z.number().int().positive(),
  })
  .openapi("LedgerBatchClaimItemRequest");

const createBatchClaimsRequestSchema = z
  .object({
    claimedAt: z.string().datetime(),
    items: z.array(batchClaimItemRequestSchema).min(1).max(100),
    method: z.enum(["manual", "in_game_mail", "trade", "bank", "other"]).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .openapi("CreateLedgerBatchClaimsRequest");

const batchClaimsResponseSchema = z
  .object({
    allocationsProcessed: z.number().int().nonnegative(),
    claims: z.array(claimSchema),
    message: z.string(),
    settlementsTouched: z.number().int().nonnegative(),
  })
  .openapi("LedgerBatchClaimsResponse");

const disbursementItemRequestSchema = z
  .object({
    amount: z.number().nonnegative(),
    characterId: z.number().int().positive(),
    ratio: z.number().nonnegative().nullable().optional(),
    weight: z.number().positive().optional(),
  })
  .openapi("LedgerDisbursementItemRequest");

const createSettlementDisbursementRequestSchema = z
  .object({
    claimedAt: z.string().datetime(),
    items: z.array(disbursementItemRequestSchema).min(1).max(100),
    method: z.enum(["manual", "in_game_mail", "trade", "bank", "other"]).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .openapi("CreateSettlementDisbursementRequest");

const settlementParticipantConflictResponseSchema = z
  .object({
    code: z.literal("SETTLEMENT_PARTICIPANT_CONFIRMATION_REQUIRED"),
    error: z.string(),
    message: z.string(),
    participantValidation: settlementParticipantValidationSchema,
    requestId: z.string(),
  })
  .openapi("LedgerSettlementParticipantConflictResponse");

const settlementDisbursementResponseSchema = z
  .object({
    allocationMode: z.enum(["created", "matched"]),
    allocations: z.array(allocationSchema),
    claims: z.array(claimSchema),
    message: z.string(),
    settlement: settlementSchema,
    settlementStatusChanged: z.boolean(),
  })
  .openapi("LedgerSettlementDisbursementResponse");

const dashboardRevenueBreakdownSchema = z
  .object({
    grossAmountTotal: z.number().nonnegative(),
    netAmountTotal: z.number().nonnegative(),
    settlementCount: z.number().int().nonnegative(),
    unitAssetId: z.number().int().positive().nullable(),
    unitAssetName: z.string().nullable(),
  })
  .openapi("OrganizationLedgerDashboardRevenueBreakdown");

const organizationLedgerDashboardSummaryResponseSchema = z
  .object({
    generatedAt: z.string(),
    organization: z.object({
      id: z.number().int().positive(),
      name: z.string(),
      vanity: z.string().nullable(),
    }),
    summary: z.object({
      disbursementInProgressCount: z.number().int().nonnegative(),
      disbursementNotStartedCount: z.number().int().nonnegative(),
      revenueUnitBreakdown: z.array(dashboardRevenueBreakdownSchema),
      settlementCount: z.number().int().nonnegative(),
      unsettledEventCount: z.number().int().nonnegative(),
    }),
  })
  .openapi("OrganizationLedgerDashboardSummaryResponse");

const queryCharacterLedgerDashboardSummariesRequestSchema = z
  .object({
    characterIds: z.array(z.number().int().positive()).min(1).max(10),
  })
  .openapi("QueryCharacterLedgerDashboardSummariesRequest");

const characterLedgerDashboardSummaryItemSchema = z
  .object({
    characterId: z.number().int().positive(),
    characterName: z.string(),
    lastActivityAt: z.string().nullable(),
    payableSettlementCount: z.number().int().nonnegative(),
    payableUnitBreakdown: z.array(
      z.object({
        amountTotal: z.number().nonnegative(),
        settlementCount: z.number().int().nonnegative(),
        unitAssetId: z.number().int().positive().nullable(),
        unitAssetName: z.string().nullable(),
      }),
    ),
    pendingClaimCount: z.number().int().nonnegative(),
    receivableSettlementCount: z.number().int().nonnegative(),
    receivableUnitBreakdown: z.array(
      z.object({
        amountTotal: z.number().nonnegative(),
        settlementCount: z.number().int().nonnegative(),
        unitAssetId: z.number().int().positive().nullable(),
        unitAssetName: z.string().nullable(),
      }),
    ),
  })
  .openapi("CharacterLedgerDashboardSummaryItem");

const characterLedgerDashboardSummaryResponseSchema = z
  .object({
    generatedAt: z.string(),
    summaries: z.array(characterLedgerDashboardSummaryItemSchema),
  })
  .openapi("CharacterLedgerDashboardSummaryResponse");

const dashboardCharacterParamSchema = z
  .object({
    characterId: z.coerce.number().int().positive(),
    organization: z.string().trim().min(1),
  })
  .openapi("LedgerDashboardCharacterParam");

const dashboardDetailSettlementSchema = z
  .object({
    amount: z.number().nonnegative(),
    claimStatus: dashboardClaimStatusSchema,
    decidedAt: z.string(),
    eventId: z.number().int().positive().nullable(),
    eventTitle: z.string().nullable(),
    settlementId: z.number().int().positive(),
    settlementKey: z.string(),
    settlementStatus: z.enum(["draft", "calculated", "paying", "paid", "cancelled"]),
    settlementTitle: z.string(),
    settlementType: z.enum(["sale", "bonus", "salary", "reward", "subsidy", "adjustment"]),
    unitAssetId: z.number().int().positive().nullable(),
    unitAssetName: z.string().nullable(),
  })
  .openapi("LedgerDashboardDetailSettlement");

const dashboardDetailGroupSchema = z
  .object({
    counterpartyId: z.number().int().positive().nullable(),
    counterpartyLabel: z.string(),
    counterpartyType: z.enum(["character", "org_treasury", "external", "custom"]),
    settlements: z.array(dashboardDetailSettlementSchema),
    unitBreakdown: z.array(
      z.object({
        amountTotal: z.number().nonnegative(),
        settlementCount: z.number().int().nonnegative(),
        unitAssetId: z.number().int().positive().nullable(),
        unitAssetName: z.string().nullable(),
      }),
    ),
  })
  .openapi("LedgerDashboardDetailGroup");

const characterLedgerDashboardDetailResponseSchema = z
  .object({
    character: z.object({
      id: z.number().int().positive(),
      name: z.string(),
    }),
    generatedAt: z.string(),
    payableGroups: z.array(dashboardDetailGroupSchema),
    receivableGroups: z.array(dashboardDetailGroupSchema),
  })
  .openapi("CharacterLedgerDashboardDetailResponse");

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

export const createLedgerEventBatchRoute = createRoute({
  method: "post",
  path: "/{organization}/ledger/events/batch",
  tags: ["Ledger", "Events"],
  request: {
    params: organizationParamSchema,
    body: {
      content: { "application/json": { schema: createEventBatchRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: createEventBatchResponseSchema } },
      description: "Create a batch of ledger events.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization membership required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Organization or related record not found." },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Business rule conflict." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const listLedgerEventsRoute = createRoute({
  method: "get",
  path: "/{organization}/ledger/events",
  tags: ["Ledger", "Events"],
  request: {
    params: organizationParamSchema,
    query: eventListQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: eventListResponseSchema } },
      description: "List organization ledger events with filters.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization membership required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Organization not found." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const getLedgerEventRoute = createRoute({
  method: "get",
  path: "/{organization}/ledger/events/{eventId}",
  tags: ["Ledger", "Events"],
  request: {
    params: eventIdParamSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: eventResponseSchema } },
      description: "Get a single organization ledger event.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization membership required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Event not found." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const updateLedgerEventRoute = createRoute({
  method: "patch",
  path: "/{organization}/ledger/events/{eventId}",
  tags: ["Ledger", "Events"],
  request: {
    params: eventIdParamSchema,
    body: {
      content: { "application/json": { schema: updateEventRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: eventResponseSchema } },
      description: "Update a ledger event.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization manager access required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Event not found." },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Business rule conflict." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const getOrganizationLedgerDashboardSummaryRoute = createRoute({
  method: "get",
  path: "/{organization}/ledger/dashboard/summary",
  tags: ["Ledger", "Dashboard"],
  request: {
    params: organizationParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: organizationLedgerDashboardSummaryResponseSchema },
      },
      description: "Get organization ledger dashboard summary.",
    },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Organization not found." },
  },
});

export const queryCharacterLedgerDashboardSummariesRoute = createRoute({
  method: "post",
  path: "/{organization}/ledger/dashboard/character-summaries/query",
  tags: ["Ledger", "Dashboard"],
  request: {
    params: organizationParamSchema,
    body: {
      content: {
        "application/json": { schema: queryCharacterLedgerDashboardSummariesRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: characterLedgerDashboardSummaryResponseSchema },
      },
      description: "Query dashboard summaries for up to 10 characters.",
    },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Organization or character not found." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const getCharacterLedgerDashboardDetailRoute = createRoute({
  method: "get",
  path: "/{organization}/ledger/dashboard/characters/{characterId}",
  tags: ["Ledger", "Dashboard"],
  request: {
    params: dashboardCharacterParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: characterLedgerDashboardDetailResponseSchema },
      },
      description: "Get detailed dashboard data for one character.",
    },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Organization or character not found." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const listLedgerClaimableRecipientsRoute = createRoute({
  method: "get",
  path: "/{organization}/ledger/claimable-recipients",
  tags: ["Ledger", "Claims"],
  request: {
    params: organizationParamSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: claimableRecipientSummaryListResponseSchema } },
      description: "List claimable recipient summaries for an organization.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization membership required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Organization not found." },
  },
});

export const getLedgerClaimableRecipientRoute = createRoute({
  method: "get",
  path: "/{organization}/ledger/claimable-recipients/{characterId}",
  tags: ["Ledger", "Claims"],
  request: {
    params: allocationIdParamSchema.extend({
      characterId: z.coerce.number().int().positive(),
    }).omit({ allocationId: true }).openapi("LedgerClaimableRecipientParam"),
    query: claimableRecipientDetailQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: claimableRecipientDetailResponseSchema } },
      description: "Get claimable details for a recipient character.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization membership required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Character not found." },
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

export const settleLedgerEventRoute = createRoute({
  method: "post",
  path: "/{organization}/ledger/events/{eventId}/settle",
  tags: ["Ledger", "Events", "Settlements"],
  request: {
    params: eventIdParamSchema,
    body: {
      content: { "application/json": { schema: settleEventRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: settlementResponseSchema } },
      description: "Auto-ready an event when needed and create a draft settlement from it.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization manager access required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Event not found." },
    409: {
      content: {
        "application/json": {
          schema: z.union([errorSchema, settlementParticipantConflictResponseSchema]),
        },
      },
      description: "Business rule conflict or participant confirmation required.",
    },
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
      description: "Create a draft settlement from a ready or partially settled event.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization manager access required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Related record not found." },
    409: {
      content: {
        "application/json": {
          schema: z.union([errorSchema, settlementParticipantConflictResponseSchema]),
        },
      },
      description: "Business rule conflict or participant confirmation required.",
    },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const updateLedgerSettlementRoute = createRoute({
  method: "patch",
  path: "/{organization}/ledger/settlements/{settlementId}",
  tags: ["Ledger", "Settlements"],
  request: {
    params: settlementIdParamSchema,
    body: {
      content: { "application/json": { schema: updateSettlementRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: settlementResponseSchema } },
      description: "Update an editable draft settlement before allocations begin.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization manager access required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Settlement or related asset not found." },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Business rule conflict." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const listLedgerSettlementsRoute = createRoute({
  method: "get",
  path: "/{organization}/ledger/settlements",
  tags: ["Ledger", "Settlements"],
  request: {
    params: organizationParamSchema,
    query: settlementListQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: settlementListResponseSchema } },
      description: "List organization settlements with filters.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization membership required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Organization not found." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const getLedgerSettlementDefaultsRoute = createRoute({
  method: "get",
  path: "/{organization}/ledger/settlement-defaults",
  tags: ["Ledger", "Settlements"],
  request: {
    params: organizationParamSchema,
    query: settlementDefaultsQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: settlementDefaultsResponseSchema },
      },
      description: "Get settlement and game defaults for an organization.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization membership required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Game not found." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const createLedgerBatchClaimsRoute = createRoute({
  method: "post",
  path: "/{organization}/ledger/claims/batch",
  tags: ["Ledger", "Claims"],
  request: {
    params: organizationParamSchema,
    body: {
      content: { "application/json": { schema: createBatchClaimsRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: batchClaimsResponseSchema } },
      description: "Record multiple settlement claims in one request.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization manager access required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Allocation or character not found." },
    409: { content: { "application/json": { schema: errorSchema } }, description: "Business rule conflict." },
    422: { content: { "application/json": { schema: validationErrorSchema } }, description: "Validation failed." },
  },
});

export const createLedgerSettlementDisbursementRoute = createRoute({
  method: "post",
  path: "/{organization}/ledger/settlements/{settlementId}/disburse",
  tags: ["Ledger", "Settlements"],
  request: {
    params: settlementIdParamSchema,
    body: {
      content: {
        "application/json": { schema: createSettlementDisbursementRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": { schema: settlementDisbursementResponseSchema },
      },
      description: "Disburse a settlement by creating or matching allocations and recording claims.",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication required." },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Organization manager access required." },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Settlement or character not found." },
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
