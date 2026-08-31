import { OpenAPIHono } from "@hono/zod-openapi";
import { D1Client } from "../../infrastructure/d1/d1-client";
import { AssetDuplicateDetectionService } from "../../services/assets/asset-duplicate-detection-service";
import { OrganizationGamesRepository } from "../../repositories/organization-games-repository";
import type { AssetAliasRecord, AssetRecord } from "../../repositories/types";
import {
  AppError,
  buildErrorResponseBody,
  ensureRequestId,
  NotFoundError,
} from "../../lib/errors";
import {
  requireTargetOrganizationManager,
  requireTargetOrganizationMember,
} from "../organizations/middleware";
import type { AppBindings } from "../../types/hono";
import { AssetLifecycleService } from "../../services/assets/asset-lifecycle-service";
import { AssetsRepository } from "../../repositories/assets-repository";
import { GamesRepository } from "../../repositories/games-repository";
import { normalizeAssetName } from "../../services/assets/asset-normalization-service";
import { createOrganizationAssetRoute, getOrganizationAssetRoute, listOrganizationAssetsRoute, resolveOrganizationAssetsRoute, searchOrganizationAssetsRoute, updateOrganizationAssetRoute } from "./schema";

export const organizationAssetsRouter = new OpenAPIHono<AppBindings>();

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

async function listOrganizationAssets(
  db: D1Client,
  organizationId: number,
  query: {
    assetType?: "item" | "currency" | "ticket" | "reward" | "service" | "other";
    gameId?: number;
    limit?: number;
    offset?: number;
    q?: string;
    status?: "candidate" | "org_verified" | "active" | "merged" | "deprecated";
  },
) {
  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;
  const rows = await new AssetsRepository(db).queryByOrganization({
    assetType: query.assetType,
    gameId: query.gameId,
    limit,
    offset,
    organizationId,
    q: query.q,
    status: query.status,
  });
  const hasMore = rows.length > limit;

  return {
    assets: (hasMore ? rows.slice(0, limit) : rows).map(toAssetResponse),
    pagination: { hasMore, limit, offset },
  };
}

export function normalizeAssetSearchQuery(q?: string): string | undefined {
  const trimmedQuery = q?.trim();
  return trimmedQuery && trimmedQuery.length >= 2
    ? normalizeAssetName(trimmedQuery)
    : undefined;
}

organizationAssetsRouter.use("/:organization/assets", requireTargetOrganizationMember);
organizationAssetsRouter.use("/:organization/assets/*", requireTargetOrganizationMember);
organizationAssetsRouter.use("/:organization/assets/:assetId", async (c, next) => {
  if (c.req.method === "PATCH") {
    return requireTargetOrganizationManager(c, next);
  }
  await next();
});

organizationAssetsRouter.openapi(createOrganizationAssetRoute, async (c) => {
  const schema =
    createOrganizationAssetRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = c.get("organization")!;
    const session = c.get("session");
    const db = new D1Client(c.env.APP_DB);
    const service = new AssetLifecycleService(db);
    const organizationGame = await new OrganizationGamesRepository(db).findByOrganizationAndGame(
      organization.id,
      parsed.data.gameId,
    );

    if (!organizationGame) {
      throw new AppError("Organization must be linked to the selected game", 409, {
        code: "ORGANIZATION_GAME_NOT_LINKED",
      });
    }

    const result = await service.createAsset({
      assetType: parsed.data.assetType,
      createdByUserId: session?.user.id ?? null,
      gameId: parsed.data.gameId,
      iconUrl: parsed.data.iconUrl,
      metadataJson: parsed.data.metadataJson,
      name: parsed.data.name,
      organizationId: organization.id,
      rarityLabel: parsed.data.rarityLabel,
    });

    if (result.kind === "duplicate") {
      return c.json(
        {
          duplicate: toDuplicateResponse(result.duplicate),
          message:
            result.duplicate.exactMatch !== null
              ? "A matching asset already exists."
              : "Possible duplicate assets were found. Please review before creating.",
        },
        409,
      );
    }

    return c.json(
      {
        asset: toAssetResponse(result.asset),
        message: "Asset created successfully.",
        primaryAlias: result.primaryAlias ? toAssetAliasResponse(result.primaryAlias) : null,
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

organizationAssetsRouter.openapi(listOrganizationAssetsRoute, async (c) => {
  const parsed = listOrganizationAssetsRoute.request.query.safeParse(c.req.query());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = c.get("organization")!;
    const db = new D1Client(c.env.APP_DB);
    return c.json(await listOrganizationAssets(db, organization.id, parsed.data), 200);
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404);
    }
    throw error;
  }
});

organizationAssetsRouter.openapi(searchOrganizationAssetsRoute, async (c) => {
  const parsed = searchOrganizationAssetsRoute.request.query.safeParse(c.req.query());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = c.get("organization")!;
    const db = new D1Client(c.env.APP_DB);
    const result = await listOrganizationAssets(db, organization.id, {
      ...parsed.data,
      q: normalizeAssetSearchQuery(parsed.data.q),
    });

    return c.json(
      {
        assets: result.assets.map(toAssetSearchResponse),
        pagination: result.pagination,
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

organizationAssetsRouter.openapi(getOrganizationAssetRoute, async (c) => {
  const parsed = getOrganizationAssetRoute.request.params.safeParse(c.req.param());
  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = c.get("organization")!;
    const asset = await new AssetsRepository(new D1Client(c.env.APP_DB)).findById(
      parsed.data.assetId,
    );

    if (!asset || asset.organization_id !== organization.id) {
      throw new NotFoundError("Asset not found");
    }

    return c.json({ asset: toAssetDetailResponse(asset) }, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403 | 404);
    }
    throw error;
  }
});

organizationAssetsRouter.openapi(updateOrganizationAssetRoute, async (c) => {
  const params = updateOrganizationAssetRoute.request.params.safeParse(c.req.param());
  const schema =
    updateOrganizationAssetRoute.request.body.content["application/json"].schema;
  const body = schema.safeParse(await c.req.json());

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, ensureRequestId(c)),
      422,
    );
  }

  if (!body.success) {
    return c.json(
      validationErrorFromIssues(body.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = c.get("organization")!;
    const db = new D1Client(c.env.APP_DB);
    const assets = new AssetsRepository(db);
    const asset = await assets.findById(params.data.assetId);

    if (!asset || asset.organization_id !== organization.id) {
      throw new NotFoundError("Asset not found");
    }

    if (body.data.gameId !== undefined) {
      const game = await new GamesRepository(db).findById(body.data.gameId);
      if (!game) {
        throw new NotFoundError("Game not found");
      }
    }

    const updated = await assets.update(asset.id, {
      assetType: body.data.assetType,
      gameId: body.data.gameId,
      iconUrl: body.data.iconUrl,
      metadataJson: body.data.metadataJson,
      name: body.data.name,
      normalizedName: body.data.name
        ? body.data.name.trim().normalize("NFKC").toLowerCase()
        : undefined,
      rarityLabel: body.data.rarityLabel,
      status: body.data.status,
    });

    return c.json(
      {
        asset: toAssetResponse(updated),
        message: "Asset updated successfully.",
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

organizationAssetsRouter.openapi(resolveOrganizationAssetsRoute, async (c) => {
  const schema =
    resolveOrganizationAssetsRoute.request.body.content["application/json"].schema;
  const body = schema.safeParse(await c.req.json());

  if (!body.success) {
    return c.json(
      validationErrorFromIssues(body.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const organization = c.get("organization")!;
    const duplicate = await new AssetDuplicateDetectionService(
      new D1Client(c.env.APP_DB),
    ).detect({
      gameId: body.data.gameId,
      name: body.data.name,
      organizationId: organization.id,
    });

    return c.json(
      {
        duplicate: toDuplicateResponse(duplicate),
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

function toAssetResponse(asset: AssetRecord) {
  return {
    assetKey: asset.asset_key,
    assetType: asset.asset_type,
    canonicalAssetId: asset.canonical_asset_id,
    createdAt: asset.created_at,
    gameId: asset.game_id,
    iconUrl: asset.icon_url,
    id: asset.id,
    isDefaultSettlementUnit: asset.is_default_settlement_unit === 1,
    mergedAt: asset.merged_at,
    metadataJson: asset.metadata_json,
    name: asset.name,
    normalizedName: asset.normalized_name,
    organizationId: asset.organization_id,
    rarityLabel: asset.rarity_label,
    scope: asset.scope,
    status: asset.status,
    updatedAt: asset.updated_at,
  };
}

function toAssetAliasResponse(alias: AssetAliasRecord) {
  return {
    alias: alias.alias,
    aliasType: alias.alias_type,
    assetId: alias.asset_id,
    id: alias.id,
    isPrimary: alias.is_primary === 1,
    locale: alias.locale,
    normalizedAlias: alias.normalized_alias,
    regionCode: alias.region_code,
  };
}

function toAssetSearchResponse(asset: ReturnType<typeof toAssetResponse>) {
  return {
    assetType: asset.assetType,
    gameId: asset.gameId,
    iconUrl: asset.iconUrl,
    id: asset.id,
    name: asset.name,
    status: asset.status,
  };
}

function toAssetDetailResponse(asset: AssetRecord) {
  return {
    assetType: asset.asset_type,
    createdAt: asset.created_at,
    gameId: asset.game_id,
    iconUrl: asset.icon_url,
    id: asset.id,
    metadataJson: asset.metadata_json,
    name: asset.name,
    rarityLabel: asset.rarity_label,
    status: asset.status,
    updatedAt: asset.updated_at,
  };
}

function toDuplicateResponse(
  duplicate: import("../../services/assets/types").AssetDuplicateDetectionResult,
) {
  return {
    exactMatch: duplicate.exactMatch
      ? {
          alias: duplicate.exactMatch.alias
            ? toAssetAliasResponse(duplicate.exactMatch.alias)
            : null,
          asset: toAssetResponse(duplicate.exactMatch.asset),
          matchedBy: duplicate.exactMatch.matchedBy,
        }
      : null,
    normalizedName: duplicate.normalizedName,
    possibleMatches: duplicate.possibleMatches.map((candidate) => ({
      alias: candidate.alias ? toAssetAliasResponse(candidate.alias) : null,
      asset: toAssetResponse(candidate.asset),
      matchedBy: candidate.matchedBy,
    })),
    recommendedAction: duplicate.recommendedAction,
  };
}
