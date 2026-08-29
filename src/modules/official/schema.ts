import { createRoute, z } from "@hono/zod-openapi";
import { errorSchema, validationErrorSchema } from "../../lib/openapi";

const gameIdParamSchema = z
  .object({
    gameId: z.coerce.number().int().positive(),
  })
  .openapi("OfficialGameIdParam");

const managedGameSchema = z
  .object({
    iconUrl: z.string().nullable(),
    id: z.number().int().positive(),
    metadataSource: z.enum(["inherited", "official"]),
    name: z.string(),
    officialSiteUrl: z.string().nullable(),
  })
  .openapi("OfficialManagedGame");

const managedGameResponseSchema = z
  .object({
    game: managedGameSchema,
    message: z.string(),
  })
  .openapi("OfficialManagedGameResponse");

const updateGameMetadataRequestSchema = z
  .object({
    iconUrl: z.string().trim().url().nullable().optional(),
    officialSiteUrl: z.string().trim().url().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })
  .openapi("OfficialUpdateGameMetadataRequest");

export const updateGameMetadataRoute = createRoute({
  method: "patch",
  path: "/games/{gameId}",
  tags: ["Official"],
  request: {
    params: gameIdParamSchema,
    body: {
      content: {
        "application/json": {
          schema: updateGameMetadataRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: managedGameResponseSchema,
        },
      },
      description: "Game metadata updated successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Official staff access required.",
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
