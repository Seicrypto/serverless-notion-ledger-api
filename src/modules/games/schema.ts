import { createRoute, z } from "@hono/zod-openapi";
import { errorSchema, validationErrorSchema } from "../../lib/openapi";

const paginationSchema = z
  .object({
    hasMore: z.boolean(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .openapi("GamesOffsetPagination");

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
  .openapi("PublicGame");

const gameSearchItemSchema = z
  .object({
    iconUrl: z.string().nullable(),
    id: z.number().int().positive(),
    name: z.string(),
    officialSiteUrl: z.string().nullable(),
  })
  .openapi("PublicGameSearchItem");

const gameListQuerySchema = z
  .object({
    includeInactive: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  })
  .openapi("PublicGameListQuery");

const gameSearchQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    name: z.string().trim().min(1).max(100),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .openapi("PublicGameSearchQuery");

const gameIdParamSchema = z
  .object({
    gameId: z.coerce.number().int().positive(),
  })
  .openapi("PublicGameIdParam");

const gameListResponseSchema = z
  .object({
    games: z.array(gameSchema),
  })
  .openapi("PublicGameListResponse");

const gameDetailResponseSchema = z
  .object({
    game: gameSchema,
  })
  .openapi("PublicGameDetailResponse");

const gameSearchResponseSchema = z
  .object({
    games: z.array(gameSearchItemSchema),
    pagination: paginationSchema,
  })
  .openapi("PublicGameSearchResponse");

export const listGamesRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Games"],
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

export const searchGamesRoute = createRoute({
  method: "get",
  path: "/search",
  tags: ["Games"],
  request: {
    query: gameSearchQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: gameSearchResponseSchema,
        },
      },
      description: "Search games by name.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const gameDetailRoute = createRoute({
  method: "get",
  path: "/{gameId}",
  tags: ["Games"],
  request: {
    params: gameIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: gameDetailResponseSchema,
        },
      },
      description: "Game detail.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Game not found.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});
