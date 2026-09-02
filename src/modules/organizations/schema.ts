import { createRoute, z } from "@hono/zod-openapi";
import {
  errorSchema,
  messageSchema,
  validationErrorSchema,
} from "../../lib/openapi";

const organizationSchema = z
  .object({
    createdAt: z.string(),
    createdByUserId: z.number().int().positive(),
    description: z.string().nullable(),
    iconUrl: z.string().nullable(),
    id: z.number().int().positive(),
    name: z.string(),
    updatedAt: z.string(),
    vanity: z.string().nullable(),
  })
  .openapi("Organization");

const organizationGameSchema = z
  .object({
    displayName: z.string().nullable(),
    gameId: z.number().int().positive(),
    iconUrl: z.string().nullable(),
    gameName: z.string(),
    gameSlug: z.string(),
    isPrimary: z.boolean(),
    metadataSource: z.enum(["inherited", "official"]),
    officialSiteUrl: z.string().nullable(),
    resolvedIconUrl: z.string().nullable(),
    sortOrder: z.number().int(),
    source: z.enum(["internal", "steam"]),
    sourceId: z.string().nullable(),
    type: z.enum(["game", "activity"]),
  })
  .openapi("OrganizationGameSummary");

const organizationCardGameSchema = z
  .object({
    iconUrl: z.string().nullable(),
    name: z.string(),
    primary: z.boolean(),
  })
  .openapi("OrganizationCardGame");

const organizationCardMembershipSchema = z
  .object({
    role: z.enum(["owner", "admin", "member"]).nullable(),
    status: z.enum(["pending", "active"]).nullable(),
  })
  .nullable()
  .openapi("OrganizationCardMembership");

const organizationCardStatsSchema = z
  .object({
    characterCount: z.number().int().nonnegative(),
    memberCount: z.number().int().nonnegative(),
  })
  .openapi("OrganizationCardStats");

const organizationCardDisplaySchema = z
  .object({
    isSupportedOrg: z.boolean(),
    maxVisibleGames: z.number().int().positive(),
    maxVisibleTags: z.number().int().positive(),
  })
  .openapi("OrganizationCardDisplay");

const organizationCardSchema = z
  .object({
    description: z.string().nullable(),
    display: organizationCardDisplaySchema,
    games: z.array(organizationCardGameSchema),
    iconUrl: z.string().nullable(),
    id: z.number().int().positive(),
    membership: organizationCardMembershipSchema,
    name: z.string(),
    stats: organizationCardStatsSchema,
    tags: z.array(z.string()),
    vanity: z.string().nullable(),
  })
  .openapi("OrganizationCard");

const paginationSchema = z
  .object({
    hasMore: z.boolean(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .openapi("OffsetPagination");

const characterSchema = z
  .object({
    claimedByUserId: z.number().int().positive().nullable(),
    createdAt: z.string(),
    gameId: z.number().int().positive().nullable(),
    id: z.number().int().positive(),
    isActive: z.boolean(),
    name: z.string(),
    notes: z.string().nullable(),
    organizationId: z.number().int().positive(),
    slug: z.string().nullable(),
    updatedAt: z.string(),
    vanity: z.string().nullable(),
  })
  .openapi("OrganizationCharacter");

const characterGameSchema = organizationGameSchema
  .nullable()
  .openapi("OrganizationCharacterGame");

const organizationCharacterWithGameSchema = characterSchema
  .extend({
    game: characterGameSchema,
  })
  .openapi("OrganizationCharacterWithGame");

const organizationMemberSchema = z
  .object({
    approvedAt: z.string().nullable(),
    createdAt: z.string(),
    id: z.number().int().positive(),
    joinedAt: z.string(),
    organizationId: z.number().int().positive(),
    role: z.enum(["owner", "admin", "member"]),
    status: z.enum(["pending", "active", "left", "removed"]),
    userId: z.number().int().positive(),
  })
  .openapi("OrganizationMember");

const organizationSearchItemSchema = organizationSchema
  .extend({
    activeCharacterCount: z.number().int().nonnegative(),
    activeMemberCount: z.number().int().nonnegative(),
    games: z.array(organizationGameSchema),
  })
  .openapi("OrganizationSearchItem");

const gameSchema = z
  .object({
    description: z.string().nullable(),
    iconUrl: z.string().nullable(),
    id: z.number().int().positive(),
    isActive: z.boolean(),
    metadataSource: z.enum(["inherited", "official"]),
    name: z.string(),
    officialSiteUrl: z.string().nullable(),
    resolvedIconUrl: z.string().nullable(),
    slug: z.string(),
    source: z.enum(["internal", "steam"]),
    sourceId: z.string().nullable(),
    type: z.enum(["game", "activity"]),
  })
  .openapi("Game");

const gameListResponseSchema = z
  .object({
    games: z.array(gameSchema),
  })
  .openapi("GameListResponse");

const organizationListResponseSchema = z
  .object({
    organizations: z.array(organizationCardSchema),
    pagination: paginationSchema,
  })
  .openapi("OrganizationListResponse");

const organizationDetailResponseSchema = z
  .object({
    organization: organizationSearchItemSchema,
  })
  .openapi("OrganizationDetailResponse");

const organizationCharactersResponseSchema = z
  .object({
    characters: z.array(organizationCharacterWithGameSchema),
  })
  .openapi("OrganizationCharactersResponse");

const organizationMembersResponseSchema = z
  .object({
    members: z.array(organizationMemberSchema),
  })
  .openapi("OrganizationMembersResponse");

const myOrganizationsResponseSchema = z
  .object({
    organizations: z.array(organizationCardSchema),
    pagination: paginationSchema,
  })
  .openapi("MyOrganizationsResponse");

const organizationSearchQuerySchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    gameId: z.coerce.number().int().positive().optional(),
    gameSlug: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    q: z.string().trim().min(1).max(100).optional(),
  })
  .openapi("OrganizationSearchQuery");

const myOrganizationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .openapi("MyOrganizationsQuery");

const gameListQuerySchema = z
  .object({
    includeInactive: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  })
  .openapi("GameListQuery");

const initialCharacterSchema = z
  .object({
    gameId: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
    notes: z.string().trim().max(1000).nullable().optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .nullable()
      .optional(),
  })
  .openapi("InitialCharacterRequest");

const createOrganizationRequestSchema = z
  .object({
    description: z.string().trim().max(500).nullable().optional(),
    iconUrl: z.string().trim().url().nullable().optional(),
    initialCharacter: initialCharacterSchema,
    name: z.string().trim().min(1).max(100),
  })
  .openapi("CreateOrganizationRequest");

const createOrganizationResponseSchema = z
  .object({
    character: characterSchema,
    message: z.string(),
    membership: organizationMemberSchema,
    organization: organizationSchema,
  })
  .openapi("CreateOrganizationResponse");

const updateOrganizationRequestSchema = z
  .object({
    description: z.string().trim().max(500).nullable().optional(),
    iconUrl: z.string().trim().url().nullable().optional(),
    name: z.string().trim().min(1).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })
  .openapi("UpdateOrganizationRequest");

const updateOrganizationResponseSchema = z
  .object({
    message: z.string(),
    organization: organizationSchema,
  })
  .openapi("UpdateOrganizationResponse");

const createCharacterRequestSchema = z
  .object({
    gameId: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
    notes: z.string().trim().max(1000).nullable().optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .nullable()
      .optional(),
  })
  .openapi("CreateCharacterRequest");

const createCharacterResponseSchema = z
  .object({
    character: characterSchema,
    message: z.string(),
  })
  .openapi("CreateCharacterResponse");

const memberAssignmentCharacterSchema = z
  .object({
    characterId: z.number().int().positive().nullable(),
    description: z.string().nullable(),
    game: characterGameSchema,
    name: z.string(),
    slug: z.string().nullable(),
    vanity: z.string().nullable(),
  })
  .openapi("OrganizationMemberAssignmentCharacter");

const organizationManagementCharacterSchema = z
  .object({
    claimedBy: z
      .object({
        displayName: z.string().nullable(),
        userId: z.number().int().positive(),
        vanity: z.string().nullable(),
      })
      .nullable(),
    description: z.string().nullable(),
    displayName: z.string(),
    game: characterGameSchema,
    id: z.number().int().positive(),
    isClaimed: z.boolean(),
    slug: z.string().nullable(),
    vanity: z.string().nullable(),
  })
  .openapi("OrganizationManagementCharacter");

const organizationManagementCharactersResponseSchema = z
  .object({
    characters: z.array(organizationManagementCharacterSchema),
  })
  .openapi("OrganizationManagementCharactersResponse");

const organizationActiveMemberSchema = z
  .object({
    displayName: z.string().nullable(),
    memberId: z.number().int().positive(),
    role: z.enum(["owner", "admin", "member"]),
    userId: z.number().int().positive(),
    vanity: z.string().nullable(),
  })
  .openapi("OrganizationActiveMember");

const organizationActiveMembersResponseSchema = z
  .object({
    members: z.array(organizationActiveMemberSchema),
  })
  .openapi("OrganizationActiveMembersResponse");

const organizationPendingMemberSchema = z
  .object({
    displayName: z.string().nullable(),
    invitedByUserId: z.number().int().positive().nullable(),
    memberId: z.number().int().positive(),
    pendingCharacter: memberAssignmentCharacterSchema.nullable(),
    pendingKind: z.enum(["apply", "invite"]),
    role: z.enum(["owner", "admin", "member"]),
    status: z.literal("pending"),
    userId: z.number().int().positive(),
    userVanity: z.string().nullable(),
  })
  .openapi("OrganizationPendingMember");

const organizationPendingMembersResponseSchema = z
  .object({
    members: z.array(organizationPendingMemberSchema),
  })
  .openapi("OrganizationPendingMembersResponse");

const organizationAvailableCharactersResponseSchema = z
  .object({
    characters: z.array(memberAssignmentCharacterSchema),
  })
  .openapi("OrganizationAvailableCharactersResponse");

const characterAssignmentRequestSchema = z
  .object({
    characterId: z.number().int().positive().optional(),
    newCharacter: createCharacterRequestSchema.optional(),
  })
  .refine(
    (value) =>
      (value.characterId !== undefined && value.newCharacter === undefined) ||
      (value.characterId === undefined && value.newCharacter !== undefined),
    {
      message: "Provide either characterId or newCharacter",
      path: ["characterId"],
    },
  )
  .openapi("CharacterAssignmentRequest");

const addMemberRequestSchema = z
  .object({
    characterId: z.number().int().positive(),
    role: z.enum(["admin", "member"]).optional(),
    userId: z.number().int().positive(),
  })
  .openapi("AddOrganizationMemberRequest");

const applyMemberRequestSchema = characterAssignmentRequestSchema.openapi(
  "ApplyOrganizationMemberRequest",
);

const inviteOrganizationMemberRequestSchema = z
  .object({
    role: z.enum(["admin", "member"]).optional(),
    userId: z.number().int().positive().optional(),
    userVanity: z.string().trim().min(1).max(120).optional(),
  })
  .merge(characterAssignmentRequestSchema)
  .refine(
    (value) =>
      (value.userId !== undefined && value.userVanity === undefined) ||
      (value.userId === undefined && value.userVanity !== undefined),
    {
      message: "Provide either userId or userVanity",
      path: ["userId"],
    },
  )
  .openapi("InviteOrganizationMemberRequest");

const organizationMemberResponseSchema = z
  .object({
    member: organizationMemberSchema,
    message: z.string(),
  })
  .openapi("OrganizationMemberResponse");

const organizationMemberWithCharacterResponseSchema = z
  .object({
    character: characterSchema,
    member: organizationMemberSchema,
    message: z.string(),
  })
  .openapi("OrganizationMemberWithCharacterResponse");

const organizationIdentifierParamSchema = z
  .object({
    organization: z.string().trim().min(1).max(120),
  })
  .openapi("OrganizationIdentifierParam");

const organizationIdentifierMemberIdParamSchema = z
  .object({
    memberId: z.coerce.number().int().positive(),
    organization: z.string().trim().min(1).max(120),
  })
  .openapi("OrganizationIdentifierMemberIdParam");

const organizationClaimRequestIdParamSchema = z
  .object({
    organization: z.string().trim().min(1).max(120),
    requestId: z.coerce.number().int().positive(),
  })
  .openapi("OrganizationClaimRequestIdParam");

const deleteOrganizationResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("DeleteOrganizationResponse");

const organizationCharacterDetailResponseSchema = z
  .object({
    character: organizationCharacterWithGameSchema,
  })
  .openapi("OrganizationCharacterDetailResponse");

const updateCharacterRequestSchema = z
  .object({
    description: z.string().trim().max(1000).nullable().optional(),
    gameId: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
    name: z.string().trim().min(1).max(100).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .nullable()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })
  .openapi("UpdateOrganizationCharacterRequest");

const updateCharacterResponseSchema = z
  .object({
    character: organizationCharacterWithGameSchema,
    message: z.string(),
  })
  .openapi("UpdateOrganizationCharacterResponse");

const deleteCharacterResponseSchema = z
  .object({
    character: characterSchema,
    message: z.string(),
  })
  .openapi("DeleteOrganizationCharacterResponse");

const characterSearchQuerySchema = z
  .object({
    isActive: z.enum(["true", "false"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    q: z.string().trim().min(1).max(100),
  })
  .openapi("OrganizationCharacterSearchQuery");

const characterSearchResponseSchema = z
  .object({
    characters: z.array(organizationCharacterWithGameSchema),
    pagination: paginationSchema,
  })
  .openapi("OrganizationCharacterSearchResponse");

const organizationCharacterParamSchema = z
  .object({
    characterId: z.coerce.number().int().positive(),
    organization: z.string().trim().min(1).max(120),
  })
  .openapi("OrganizationCharacterParam");

const organizationGameParamSchema = z
  .object({
    gameId: z.coerce.number().int().positive(),
    organization: z.string().trim().min(1).max(120),
  })
  .openapi("OrganizationGameParam");

const claimRequestSchema = z
  .object({
    memberId: z.number().int().positive().optional(),
    mode: z.enum(["assign", "transfer", "unassign"]).optional(),
    status: z.enum(["claimed", "pending_confirmation"]).optional(),
    userId: z.number().int().positive().optional(),
  })
  .refine(
    (value) =>
      value.mode === "unassign" ||
      value.userId !== undefined ||
      value.memberId !== undefined,
    {
      message: "Provide either userId or memberId",
      path: ["userId"],
    },
  )
  .openapi("OrganizationCharacterClaimRequest");

const assignCharacterRequestSchema = z
  .object({
    memberId: z.number().int().positive().optional(),
    userId: z.number().int().positive().optional(),
  })
  .refine((value) => value.userId !== undefined || value.memberId !== undefined, {
    message: "Provide either userId or memberId",
    path: ["userId"],
  })
  .openapi("AssignOrganizationCharacterRequest");

const characterClaimRequestSchema = z
  .object({
    characterId: z.number().int().positive(),
    createdAt: z.string(),
    id: z.number().int().positive(),
    organizationId: z.number().int().positive(),
    requestedByUserId: z.number().int().positive(),
    status: z.enum([
      "pending_confirmation",
      "accepted",
      "declined",
      "cancelled",
    ]),
    targetMemberId: z.number().int().positive().nullable(),
    targetUserId: z.number().int().positive(),
    updatedAt: z.string(),
  })
  .openapi("CharacterClaimRequest");

const characterClaimResponseSchema = z
  .object({
    character: organizationCharacterWithGameSchema,
    claimRequest: characterClaimRequestSchema.nullable(),
    message: z.string(),
  })
  .openapi("OrganizationCharacterClaimResponse");

const createCharacterClaimRequestSchema = z
  .object({
    memberId: z.number().int().positive().optional(),
    userId: z.number().int().positive().optional(),
  })
  .refine((value) => value.userId !== undefined || value.memberId !== undefined, {
    message: "Provide either userId or memberId",
    path: ["userId"],
  })
  .openapi("CreateCharacterClaimRequest");

const createCharacterClaimRequestResponseSchema = z
  .object({
    character: organizationCharacterWithGameSchema,
    claimRequest: characterClaimRequestSchema,
    message: z.string(),
  })
  .openapi("CreateCharacterClaimRequestResponse");

const createOrganizationGameRequestSchema = z
  .object({
    displayName: z.string().trim().max(100).nullable().optional(),
    gameId: z.number().int().positive(),
    isPrimary: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .openapi("CreateOrganizationGameRequest");

const updateOrganizationGameRequestSchema = z
  .object({
    displayName: z.string().trim().max(100).nullable().optional(),
    isPrimary: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })
  .openapi("UpdateOrganizationGameRequest");

const setPrimaryOrganizationGameRequestSchema = z
  .object({})
  .openapi("SetPrimaryOrganizationGameRequest");

const organizationGameResponseSchema = z
  .object({
    game: organizationGameSchema,
    message: z.string(),
  })
  .openapi("OrganizationGameResponse");

export const createOrganizationRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Organizations"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createOrganizationRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: createOrganizationResponseSchema,
        },
      },
      description: "Organization created successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to create organizations.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization name or vanity already exists.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const listGamesRoute = createRoute({
  method: "get",
  path: "/games",
  tags: ["Organizations"],
  request: {
    query: gameListQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: gameListResponseSchema,
        },
      },
      description: "List available games.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const listOrganizationsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Organizations"],
  request: {
    query: organizationSearchQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationListResponseSchema,
        },
      },
      description: "Search organizations.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const myOrganizationsRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Organizations"],
  request: {
    query: myOrganizationsQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: myOrganizationsResponseSchema,
        },
      },
      description: "List organizations for the authenticated user.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to access organizations.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const organizationDetailRoute = createRoute({
  method: "get",
  path: "/{organization}",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationDetailResponseSchema,
        },
      },
      description: "Organization detail.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const organizationCharactersRoute = createRoute({
  method: "get",
  path: "/{organization}/characters",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationCharactersResponseSchema,
        },
      },
      description: "List organization characters.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const searchOrganizationCharactersRoute = createRoute({
  method: "get",
  path: "/{organization}/characters/search",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
    query: characterSearchQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: characterSearchResponseSchema,
        },
      },
      description: "Search organization characters.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const organizationCharacterDetailRoute = createRoute({
  method: "get",
  path: "/{organization}/characters/{characterId}",
  tags: ["Organizations"],
  request: {
    params: organizationCharacterParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationCharacterDetailResponseSchema,
        },
      },
      description: "Get an organization character.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or character not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Character cannot be deleted in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const updateOrganizationCharacterRoute = createRoute({
  method: "patch",
  path: "/{organization}/characters/{characterId}",
  tags: ["Organizations"],
  request: {
    params: organizationCharacterParamSchema,
    body: {
      content: {
        "application/json": {
          schema: updateCharacterRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: updateCharacterResponseSchema,
        },
      },
      description: "Character updated successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or character not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Character update conflicts with current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const deleteOrganizationCharacterRoute = createRoute({
  method: "delete",
  path: "/{organization}/characters/{characterId}",
  tags: ["Organizations"],
  request: {
    params: organizationCharacterParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: deleteCharacterResponseSchema,
        },
      },
      description: "Character deleted successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or character not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Character cannot be deleted in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const claimOrganizationCharacterRoute = createRoute({
  method: "patch",
  path: "/{organization}/characters/{characterId}/claim",
  tags: ["Organizations"],
  request: {
    params: organizationCharacterParamSchema,
    body: {
      content: {
        "application/json": {
          schema: claimRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: characterClaimResponseSchema,
        },
      },
      description: "Character claim updated successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization, character, member, or user not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Character claim conflicts with current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const createOrganizationCharacterClaimRequestRoute = createRoute({
  method: "post",
  path: "/{organization}/characters/{characterId}/claim-request",
  tags: ["Organizations"],
  request: {
    params: organizationCharacterParamSchema,
    body: {
      content: {
        "application/json": {
          schema: createCharacterClaimRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: createCharacterClaimRequestResponseSchema,
        },
      },
      description: "Character claim request created successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization, character, member, or user not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Character claim request conflicts with current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const assignOrganizationCharacterRoute = createRoute({
  method: "post",
  path: "/{organization}/characters/{characterId}/assign",
  tags: ["Organizations"],
  request: {
    params: organizationCharacterParamSchema,
    body: {
      content: {
        "application/json": {
          schema: assignCharacterRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: characterClaimResponseSchema,
        },
      },
      description: "Character assigned successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization, character, member, or user not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Character assignment conflicts with current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const unclaimOrganizationCharacterRoute = createRoute({
  method: "post",
  path: "/{organization}/characters/{characterId}/unclaim",
  tags: ["Organizations"],
  request: {
    params: organizationCharacterParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: characterClaimResponseSchema,
        },
      },
      description: "Character unclaimed successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or character not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Character cannot be unclaimed in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const unassignOrganizationCharacterRoute = createRoute({
  method: "post",
  path: "/{organization}/characters/{characterId}/unassign",
  tags: ["Organizations"],
  request: {
    params: organizationCharacterParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: characterClaimResponseSchema,
        },
      },
      description: "Character unassigned successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or character not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Character cannot be unassigned in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const organizationMembersRoute = createRoute({
  method: "get",
  path: "/{organization}/members",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationMembersResponseSchema,
        },
      },
      description: "List active organization members.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const organizationManagementCharactersRoute = createRoute({
  method: "get",
  path: "/{organization}/management/characters",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationManagementCharactersResponseSchema,
        },
      },
      description: "List characters for organization management.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const organizationActiveMembersRoute = createRoute({
  method: "get",
  path: "/{organization}/management/members/active",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationActiveMembersResponseSchema,
        },
      },
      description: "List active members for organization management.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const organizationPendingMembersRoute = createRoute({
  method: "get",
  path: "/{organization}/management/members/pending",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationPendingMembersResponseSchema,
        },
      },
      description: "List pending members for organization management.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const organizationAvailableCharactersRoute = createRoute({
  method: "get",
  path: "/{organization}/characters/available",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationAvailableCharactersResponseSchema,
        },
      },
      description: "List available organization characters.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const inviteOrganizationMemberRoute = createRoute({
  method: "post",
  path: "/{organization}/members/invite",
  tags: ["Organizations"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: inviteOrganizationMemberRequestSchema,
        },
      },
      required: true,
    },
    params: organizationIdentifierParamSchema,
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: organizationMemberResponseSchema,
        },
      },
      description: "Invitation created successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization, user, or character not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invitation conflicts with current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const deleteOrganizationRoute = createRoute({
  method: "delete",
  path: "/{organization}",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: deleteOrganizationResponseSchema,
        },
      },
      description: "Organization deleted successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to delete this organization.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const createOrganizationCharacterRoute = createRoute({
  method: "post",
  path: "/{organization}/characters",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
    body: {
      content: {
        "application/json": {
          schema: createCharacterRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: createCharacterResponseSchema,
        },
      },
      description: "Character created successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Character name or slug already exists.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const createOrganizationGameRoute = createRoute({
  method: "post",
  path: "/{organization}/games",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
    body: {
      content: {
        "application/json": {
          schema: createOrganizationGameRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: organizationGameResponseSchema,
        },
      },
      description: "Organization game created successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or game not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization game conflicts with current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const updateOrganizationGameRoute = createRoute({
  method: "patch",
  path: "/{organization}/games/{gameId}",
  tags: ["Organizations"],
  request: {
    params: organizationGameParamSchema,
    body: {
      content: {
        "application/json": {
          schema: updateOrganizationGameRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationGameResponseSchema,
        },
      },
      description: "Organization game updated successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or game not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization game conflicts with current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const deleteOrganizationGameRoute = createRoute({
  method: "delete",
  path: "/{organization}/games/{gameId}",
  tags: ["Organizations"],
  request: {
    params: organizationGameParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationGameResponseSchema,
        },
      },
      description: "Organization game deleted successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or game not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization game cannot be removed in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const setPrimaryOrganizationGameRoute = createRoute({
  method: "patch",
  path: "/{organization}/games/{gameId}/primary",
  tags: ["Organizations"],
  request: {
    params: organizationGameParamSchema,
    body: {
      content: {
        "application/json": {
          schema: setPrimaryOrganizationGameRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationGameResponseSchema,
        },
      },
      description: "Organization primary game updated successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or game not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization game conflicts with current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const addOrganizationMemberRoute = createRoute({
  method: "post",
  path: "/{organization}/members",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
    body: {
      content: {
        "application/json": {
          schema: addMemberRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: organizationMemberWithCharacterResponseSchema,
        },
      },
      description: "Member added successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization, user, or character not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Membership or character assignment conflicts with current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const applyOrganizationMemberRoute = createRoute({
  method: "post",
  path: "/{organization}/members/apply",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
    body: {
      content: {
        "application/json": {
          schema: applyMemberRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: organizationMemberWithCharacterResponseSchema,
        },
      },
      description: "Membership application submitted successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or character not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Membership or character assignment conflicts with current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const approveOrganizationMemberRoute = createRoute({
  method: "post",
  path: "/{organization}/members/{memberId}/approve",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierMemberIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationMemberResponseSchema,
        },
      },
      description: "Membership approved successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or membership not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Membership cannot be approved in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const rejectOrganizationMemberRoute = createRoute({
  method: "post",
  path: "/{organization}/members/{memberId}/reject",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierMemberIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationMemberResponseSchema,
        },
      },
      description: "Pending membership rejected successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or membership not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Membership cannot be rejected in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const cancelOrganizationMemberRoute = createRoute({
  method: "post",
  path: "/{organization}/members/{memberId}/cancel",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierMemberIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationMemberResponseSchema,
        },
      },
      description: "Pending membership cancelled successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to cancel this pending membership.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or membership not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Pending membership cannot be cancelled in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const leaveOrganizationMemberRoute = createRoute({
  method: "post",
  path: "/{organization}/members/{memberId}/leave",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierMemberIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationMemberResponseSchema,
        },
      },
      description: "Member left the organization successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to leave for another member.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or membership not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Membership cannot leave in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const removeOrganizationMemberRoute = createRoute({
  method: "post",
  path: "/{organization}/members/{memberId}/remove",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierMemberIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationMemberResponseSchema,
        },
      },
      description: "Member removed successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization manager access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or membership not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Membership cannot be removed in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const appointOrganizationAdminRoute = createRoute({
  method: "post",
  path: "/{organization}/members/{memberId}/appoint-admin",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierMemberIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationMemberResponseSchema,
        },
      },
      description: "Organization admin appointed successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization owner access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or membership not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Membership cannot be promoted in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const removeOrganizationAdminRoute = createRoute({
  method: "post",
  path: "/{organization}/members/{memberId}/remove-admin",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierMemberIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationMemberResponseSchema,
        },
      },
      description: "Organization admin removed successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization owner access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or membership not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Membership cannot be demoted in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const acceptOrganizationInviteRoute = createRoute({
  method: "post",
  path: "/{organization}/members/{memberId}/accept-invite",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierMemberIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationMemberResponseSchema,
        },
      },
      description: "Invitation accepted successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to accept this invitation.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or membership not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invitation cannot be accepted in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const declineOrganizationInviteRoute = createRoute({
  method: "post",
  path: "/{organization}/members/{memberId}/decline-invite",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierMemberIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: organizationMemberResponseSchema,
        },
      },
      description: "Invitation declined successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to decline this invitation.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or membership not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invitation cannot be declined in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const acceptOrganizationCharacterClaimRequestRoute = createRoute({
  method: "post",
  path: "/{organization}/character-claim-requests/{requestId}/accept",
  tags: ["Organizations"],
  request: {
    params: organizationClaimRequestIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: characterClaimResponseSchema,
        },
      },
      description: "Character claim request accepted successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to accept this claim request.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or claim request not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Claim request cannot be accepted in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const declineOrganizationCharacterClaimRequestRoute = createRoute({
  method: "post",
  path: "/{organization}/character-claim-requests/{requestId}/decline",
  tags: ["Organizations"],
  request: {
    params: organizationClaimRequestIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: characterClaimResponseSchema,
        },
      },
      description: "Character claim request declined successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to decline this claim request.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or claim request not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Claim request cannot be declined in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const cancelOrganizationCharacterClaimRequestRoute = createRoute({
  method: "post",
  path: "/{organization}/character-claim-requests/{requestId}/cancel",
  tags: ["Organizations"],
  request: {
    params: organizationClaimRequestIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: characterClaimResponseSchema,
        },
      },
      description: "Character claim request cancelled successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to cancel this claim request.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or claim request not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Claim request cannot be cancelled in its current state.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const updateOrganizationRoute = createRoute({
  method: "patch",
  path: "/{organization}",
  tags: ["Organizations"],
  request: {
    params: organizationIdentifierParamSchema,
    body: {
      content: {
        "application/json": {
          schema: updateOrganizationRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: updateOrganizationResponseSchema,
        },
      },
      description: "Organization updated successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to update this organization.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization name or vanity already exists.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const currentOrganizationRoute = createRoute({
  method: "get",
  path: "/current",
  tags: ["Organizations"],
  responses: {
    501: {
      content: {
        "application/json": {
          schema: messageSchema,
        },
      },
      description: "Organization profile placeholder.",
    },
  },
});

export const currentOrganizationMembersRoute = createRoute({
  method: "get",
  path: "/current/members",
  tags: ["Organizations"],
  responses: {
    501: {
      content: {
        "application/json": {
          schema: messageSchema,
        },
      },
      description: "Organization members placeholder.",
    },
  },
});
