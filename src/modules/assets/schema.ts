import { createRoute, z } from "@hono/zod-openapi";
import { errorSchema, validationErrorSchema } from "../../lib/openapi";

const assetSchema = z
  .object({
    assetKey: z.string(),
    assetType: z.enum(["item", "currency", "ticket", "reward", "service", "other"]),
    canonicalAssetId: z.number().int().positive().nullable(),
    createdAt: z.string(),
    gameId: z.number().int().positive(),
    iconUrl: z.string().nullable(),
    id: z.number().int().positive(),
    isDefaultSettlementUnit: z.boolean(),
    mergedAt: z.string().nullable(),
    metadataJson: z.string().nullable(),
    name: z.string(),
    normalizedName: z.string(),
    organizationId: z.number().int().positive().nullable(),
    rarityLabel: z.string().nullable(),
    scope: z.enum(["global", "organization"]),
    status: z.enum(["candidate", "org_verified", "active", "merged", "deprecated"]),
    updatedAt: z.string(),
  })
  .openapi("Asset");

const assetAliasSchema = z
  .object({
    alias: z.string(),
    aliasType: z.enum(["official", "localized", "community", "nickname", "legacy"]),
    assetId: z.number().int().positive(),
    id: z.number().int().positive(),
    isPrimary: z.boolean(),
    locale: z.string().nullable(),
    normalizedAlias: z.string(),
    regionCode: z.string().nullable(),
  })
  .openapi("AssetAlias");

const createAssetRequestSchema = z
  .object({
    assetType: z
      .enum(["item", "currency", "ticket", "reward", "service", "other"])
      .optional(),
    iconUrl: z.string().trim().url().nullable().optional(),
    metadataJson: z.string().trim().nullable().optional(),
    name: z.string().trim().min(1).max(120),
    rarityLabel: z.string().trim().max(120).nullable().optional(),
  })
  .openapi("CreateAssetRequest");

const createAssetResponseSchema = z
  .object({
    asset: assetSchema,
    message: z.string(),
    primaryAlias: assetAliasSchema.nullable(),
  })
  .openapi("CreateAssetResponse");

const duplicateCandidateSchema = z
  .object({
    alias: assetAliasSchema.nullable(),
    asset: assetSchema,
    matchedBy: z.enum(["canonical_exact", "alias_exact", "possible"]),
  })
  .openapi("AssetDuplicateCandidate");

const createAssetConflictResponseSchema = z
  .object({
    duplicate: z.object({
      exactMatch: duplicateCandidateSchema.nullable(),
      normalizedName: z.string(),
      possibleMatches: z.array(duplicateCandidateSchema),
      recommendedAction: z.enum(["use_existing", "confirm_create", "allow_create"]),
    }),
    message: z.string(),
  })
  .openapi("CreateAssetConflictResponse");

const createAssetOperationalConflictResponseSchema = errorSchema.openapi(
  "CreateAssetOperationalConflictResponse",
);

const mergeAssetRequestSchema = z
  .object({
    targetAssetId: z.number().int().positive(),
  })
  .openapi("MergeAssetRequest");

const mergeAssetResponseSchema = z
  .object({
    message: z.string(),
    sourceAsset: assetSchema,
    targetAsset: assetSchema,
  })
  .openapi("MergeAssetResponse");

const organizationParamSchema = z
  .object({
    organization: z.string().trim().min(1),
  })
  .openapi("AssetOrganizationParam");

const assetIdParamSchema = z
  .object({
    assetId: z.coerce.number().int().positive(),
  })
  .openapi("AssetIdParam");

export const createOrganizationAssetRoute = createRoute({
  method: "post",
  path: "/{organization}/assets",
  tags: ["Assets"],
  request: {
    params: organizationParamSchema,
    body: {
      content: {
        "application/json": {
          schema: createAssetRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: createAssetResponseSchema } },
      description: "Create an organization-scoped asset.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization membership required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization or game not found.",
    },
    409: {
      content: {
        "application/json": {
          schema: z.union([
            createAssetConflictResponseSchema,
            createAssetOperationalConflictResponseSchema,
          ]),
        },
      },
      description: "Duplicate asset detected.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const mergeAssetRoute = createRoute({
  method: "post",
  path: "/assets/{assetId}/merge",
  tags: ["Assets", "Admin"],
  request: {
    params: assetIdParamSchema,
    body: {
      content: {
        "application/json": {
          schema: mergeAssetRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: mergeAssetResponseSchema } },
      description: "Merge one asset into another canonical asset.",
    },
    400: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid merge request.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Official admin access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Asset not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Merge conflict.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});
