import { OpenAPIHono } from "@hono/zod-openapi";
import { D1Client } from "../../infrastructure/d1/d1-client";
import { OrganizationGamesRepository } from "../../repositories/organization-games-repository";
import type { AssetAliasRecord, AssetRecord } from "../../repositories/types";
import {
  AppError,
  buildErrorResponseBody,
  ensureRequestId,
} from "../../lib/errors";
import { requireTargetOrganizationMember } from "../organizations/middleware";
import type { AppBindings } from "../../types/hono";
import { AssetLifecycleService } from "../../services/assets/asset-lifecycle-service";
import { createOrganizationAssetRoute } from "./schema";

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

organizationAssetsRouter.use("/{organization}/assets", requireTargetOrganizationMember);

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
    const organization = c.get("organization");
    const session = c.get("session");
    const db = new D1Client(c.env.APP_DB);
    const service = new AssetLifecycleService(db);
    const gameId = organization
      ? (await new OrganizationGamesRepository(db).listByOrganization(organization.id)).find(
          (game) => game.is_primary === 1,
        )?.game_id
      : null;

    if (!organization || !gameId) {
      throw new AppError("Organization primary game is required to create assets", 409, {
        code: "ORGANIZATION_PRIMARY_GAME_REQUIRED",
      });
    }

    const result = await service.createAsset({
      assetType: parsed.data.assetType,
      createdByUserId: session?.user.id ?? null,
      gameId,
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
