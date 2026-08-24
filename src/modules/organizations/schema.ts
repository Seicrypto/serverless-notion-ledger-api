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
    slug: z.string(),
    updatedAt: z.string(),
    vanity: z.string().nullable(),
  })
  .openapi("Organization");

const organizationGameSchema = z
  .object({
    displayName: z.string().nullable(),
    gameId: z.number().int().positive(),
    gameName: z.string(),
    gameSlug: z.string(),
    isPrimary: z.boolean(),
    source: z.enum(["internal", "steam"]),
    sourceId: z.string().nullable(),
    type: z.enum(["game", "activity"]),
  })
  .openapi("OrganizationGameSummary");

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
  })
  .openapi("OrganizationCharacter");

const organizationMemberSchema = z
  .object({
    approvedAt: z.string().nullable(),
    createdAt: z.string(),
    id: z.number().int().positive(),
    joinedAt: z.string(),
    organizationId: z.number().int().positive(),
    role: z.enum(["owner", "admin", "member"]),
    status: z.enum(["pending", "active"]),
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
    name: z.string(),
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
    organizations: z.array(organizationSearchItemSchema),
  })
  .openapi("OrganizationListResponse");

const organizationDetailResponseSchema = z
  .object({
    organization: organizationSearchItemSchema,
  })
  .openapi("OrganizationDetailResponse");

const organizationCharactersResponseSchema = z
  .object({
    characters: z.array(characterSchema),
  })
  .openapi("OrganizationCharactersResponse");

const organizationMembersResponseSchema = z
  .object({
    members: z.array(organizationMemberSchema),
  })
  .openapi("OrganizationMembersResponse");

const myOrganizationSchema = organizationSearchItemSchema
  .extend({
    membership: z.object({
      approvedAt: z.string().nullable(),
      joinedAt: z.string(),
      role: z.enum(["owner", "admin", "member"]),
      status: z.enum(["pending", "active"]),
    }),
  })
  .openapi("MyOrganization");

const myOrganizationsResponseSchema = z
  .object({
    organizations: z.array(myOrganizationSchema),
  })
  .openapi("MyOrganizationsResponse");

const organizationSearchQuerySchema = z
  .object({
    gameId: z.coerce.number().int().positive().optional(),
    gameSlug: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    q: z.string().trim().min(1).max(100).optional(),
  })
  .openapi("OrganizationSearchQuery");

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
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
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
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
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

const addMemberRequestSchema = z
  .object({
    characterId: z.number().int().positive(),
    role: z.enum(["admin", "member"]).optional(),
    userId: z.number().int().positive(),
  })
  .openapi("AddOrganizationMemberRequest");

const applyMemberRequestSchema = z
  .object({
    characterId: z.number().int().positive(),
  })
  .openapi("ApplyOrganizationMemberRequest");

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

const organizationMemberIdParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    memberId: z.coerce.number().int().positive(),
  })
  .openapi("OrganizationMemberIdParam");

const organizationIdParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .openapi("OrganizationIdParam");

const deleteOrganizationResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("DeleteOrganizationResponse");

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
      description: "Organization name or slug already exists.",
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
  },
});

export const organizationDetailRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Organizations"],
  request: {
    params: organizationIdParamSchema,
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
  path: "/{id}/characters",
  tags: ["Organizations"],
  request: {
    params: organizationIdParamSchema,
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

export const organizationMembersRoute = createRoute({
  method: "get",
  path: "/{id}/members",
  tags: ["Organizations"],
  request: {
    params: organizationIdParamSchema,
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

export const deleteOrganizationRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Organizations"],
  request: {
    params: organizationIdParamSchema,
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
  path: "/{id}/characters",
  tags: ["Organizations"],
  request: {
    params: organizationIdParamSchema,
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

export const addOrganizationMemberRoute = createRoute({
  method: "post",
  path: "/{id}/members",
  tags: ["Organizations"],
  request: {
    params: organizationIdParamSchema,
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
  path: "/{id}/members/apply",
  tags: ["Organizations"],
  request: {
    params: organizationIdParamSchema,
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
  path: "/{id}/members/{memberId}/approve",
  tags: ["Organizations"],
  request: {
    params: organizationMemberIdParamSchema,
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

export const updateOrganizationRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Organizations"],
  request: {
    params: organizationIdParamSchema,
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
      description: "Organization name or slug already exists.",
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
