import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { AssetAliasesRepository } from "../../repositories/asset-aliases-repository";
import { AssetsRepository } from "../../repositories/assets-repository";
import type { AssetRecord } from "../../repositories/types";

export class AssetIdentityResolutionService {
  private readonly aliasesRepository: AssetAliasesRepository;
  private readonly assetsRepository: AssetsRepository;

  constructor(
    private readonly db: DatabaseClient,
    options: {
      aliasesRepository?: AssetAliasesRepository;
      assetsRepository?: AssetsRepository;
    } = {},
  ) {
    this.aliasesRepository =
      options.aliasesRepository ?? new AssetAliasesRepository(db);
    this.assetsRepository = options.assetsRepository ?? new AssetsRepository(db);
  }

  async mergeAsset(input: {
    mergedByUserId: number;
    sourceAssetId: number;
    targetAssetId: number;
  }): Promise<{
    sourceAsset: AssetRecord;
    targetAsset: AssetRecord;
  }> {
    if (input.sourceAssetId === input.targetAssetId) {
      throw new ConflictError("Source and target asset must be different", {
        code: "ASSET_MERGE_SELF",
      });
    }

    const source = await this.requireAsset(input.sourceAssetId);
    const target = await this.requireAsset(input.targetAssetId);

    if (source.game_id !== target.game_id) {
      throw new ConflictError("Assets from different games cannot be merged", {
        code: "ASSET_MERGE_GAME_MISMATCH",
      });
    }

    if (source.status === "merged") {
      throw new ConflictError("Source asset is already merged", {
        code: "ASSET_SOURCE_ALREADY_MERGED",
      });
    }

    if (target.status === "merged") {
      throw new ConflictError("Target asset cannot be a merged asset", {
        code: "ASSET_TARGET_MERGED",
      });
    }

    const canonicalTarget = await this.resolveCanonicalAsset(target.id);
    const mergedSource = await this.assetsRepository.update(source.id, {
      canonicalAssetId: canonicalTarget.id,
      mergedAt: new Date().toISOString(),
      mergedByUserId: input.mergedByUserId,
      status: "merged",
    });

    const sourceAliases = await this.aliasesRepository.listByAsset(source.id);
    const targetAliases = await this.aliasesRepository.listByAsset(canonicalTarget.id);
    const existingAliasKeys = new Set(
      targetAliases.map(
        (alias) =>
          `${alias.normalized_alias}:${alias.locale ?? ""}:${alias.region_code ?? ""}`,
      ),
    );

    for (const alias of sourceAliases) {
      const key = `${alias.normalized_alias}:${alias.locale ?? ""}:${alias.region_code ?? ""}`;
      if (existingAliasKeys.has(key)) {
        continue;
      }

      await this.aliasesRepository.create({
        alias: alias.alias,
        aliasType: alias.alias_type,
        assetId: canonicalTarget.id,
        isPrimary: false,
        locale: alias.locale,
        normalizedAlias: alias.normalized_alias,
        regionCode: alias.region_code,
      });
    }

    return {
      sourceAsset: mergedSource,
      targetAsset: canonicalTarget,
    };
  }

  async resolveCanonicalAsset(assetId: number): Promise<AssetRecord> {
    let current = await this.requireAsset(assetId);
    const seen = new Set<number>();

    while (current.status === "merged" && current.canonical_asset_id) {
      if (seen.has(current.id)) {
        throw new ConflictError("Asset merge chain contains a cycle", {
          code: "ASSET_MERGE_CYCLE",
        });
      }

      seen.add(current.id);
      current = await this.requireAsset(current.canonical_asset_id);
    }

    return current;
  }

  async resolveDefaultSettlementUnit(input: {
    gameId: number;
    organizationId?: number | null;
  }): Promise<AssetRecord | null> {
    const candidates = await this.assetsRepository.listByGame(input.gameId);
    const usable = candidates.filter(
      (asset) =>
        asset.asset_type === "currency" &&
        asset.status !== "merged" &&
        asset.status !== "deprecated" &&
        asset.is_default_settlement_unit === 1,
    );

    const organizationScoped = usable.find(
      (asset) =>
        asset.scope === "organization" &&
        asset.organization_id === (input.organizationId ?? null),
    );

    if (organizationScoped) {
      return organizationScoped;
    }

    return usable.find((asset) => asset.scope === "global") ?? null;
  }

  private async requireAsset(assetId: number): Promise<AssetRecord> {
    const asset = await this.assetsRepository.findById(assetId);
    if (!asset) {
      throw new NotFoundError("Asset not found");
    }

    return asset;
  }
}
