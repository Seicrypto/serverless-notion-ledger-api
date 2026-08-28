import { OpenAPIHono } from "@hono/zod-openapi";
import { D1Client } from "../../infrastructure/d1/d1-client";
import type { AssetRecord } from "../../repositories/types";
import {
  AppError,
  buildErrorResponseBody,
  ensureRequestId,
} from "../../lib/errors";
import { getSessionCookie } from "../../lib/session-cookie";
import { AssetLifecycleService } from "../../services/assets/asset-lifecycle-service";
import { SessionAuthService } from "../../services/auth/session-auth-service";
import type { AppBindings } from "../../types/hono";
import { mergeAssetRoute } from "./schema";

export const adminAssetsRouter = new OpenAPIHono<AppBindings>();

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

adminAssetsRouter.openapi(mergeAssetRoute, async (c) => {
  const paramsParsed = mergeAssetRoute.request.params.safeParse(c.req.param());
  if (!paramsParsed.success) {
    return c.json(
      validationErrorFromIssues(paramsParsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  const bodySchema = mergeAssetRoute.request.body.content["application/json"].schema;
  const bodyParsed = bodySchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json(
      validationErrorFromIssues(bodyParsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireOfficialAdmin(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const service = new AssetLifecycleService(db);
    const result = await service.mergeAsset({
      mergedByUserId: session.user.id,
      sourceAssetId: paramsParsed.data.assetId,
      targetAssetId: bodyParsed.data.targetAssetId,
    });

    return c.json(
      {
        message: "Asset merged successfully.",
        sourceAsset: toAssetResponse(result.sourceAsset),
        targetAsset: toAssetResponse(result.targetAsset),
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 400 | 401 | 403 | 404 | 409,
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
