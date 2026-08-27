import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { AssetAliasesRepository } from "../../repositories/asset-aliases-repository";
import { AssetsRepository } from "../../repositories/assets-repository";
import { GamesRepository } from "../../repositories/games-repository";
import type {
  AssetAliasRecord,
  AssetRecord,
  AssetScope,
  AssetType,
} from "../../repositories/types";
import { AssetDuplicateDetectionService } from "./asset-duplicate-detection-service";
import { AssetNormalizationService } from "./asset-normalization-service";
import type { AssetDuplicateDetectionResult } from "./types";

export interface CreateAssetLifecycleInput {
  assetType?: AssetType;
  gameId: number;
  iconUrl?: string | null;
  metadataJson?: string | null;
  name: string;
  organizationId: number;
  rarityLabel?: string | null;
}

export type CreateAssetLifecycleResult =
  | {
      asset: AssetRecord;
      kind: "created";
      primaryAlias: AssetAliasRecord | null;
    }
  | {
      duplicate: AssetDuplicateDetectionResult;
      kind: "duplicate";
    };

export class AssetLifecycleService {
  private readonly aliasesRepository: AssetAliasesRepository;
  private readonly assetsRepository: AssetsRepository;
  private readonly duplicateDetectionService: AssetDuplicateDetectionService;
  private readonly gamesRepository: GamesRepository;
  private readonly normalizationService: AssetNormalizationService;

  constructor(
    private readonly db: DatabaseClient,
    options: {
      aliasesRepository?: AssetAliasesRepository;
      assetsRepository?: AssetsRepository;
      duplicateDetectionService?: AssetDuplicateDetectionService;
      gamesRepository?: GamesRepository;
      normalizationService?: AssetNormalizationService;
    } = {},
  ) {
    this.aliasesRepository =
      options.aliasesRepository ?? new AssetAliasesRepository(db);
    this.assetsRepository = options.assetsRepository ?? new AssetsRepository(db);
    this.duplicateDetectionService =
      options.duplicateDetectionService ?? new AssetDuplicateDetectionService(db);
    this.gamesRepository = options.gamesRepository ?? new GamesRepository(db);
    this.normalizationService =
      options.normalizationService ?? new AssetNormalizationService();
  }

  async createAsset(input: CreateAssetLifecycleInput): Promise<CreateAssetLifecycleResult> {
    const game = await this.gamesRepository.findById(input.gameId);
    if (!game) {
      throw new NotFoundError("Game not found");
    }

    const duplicate = await this.duplicateDetectionService.detect({
      gameId: input.gameId,
      name: input.name,
      organizationId: input.organizationId,
    });

    if (duplicate.exactMatch || duplicate.possibleMatches.length > 0) {
      return {
        duplicate,
        kind: "duplicate",
      };
    }

    const normalizedName = duplicate.normalizedName;
    const asset = await this.assetsRepository.create({
      assetKey: await this.allocateAssetKey(game.slug, normalizedName),
      assetType: input.assetType ?? "item",
      gameId: input.gameId,
      iconUrl: input.iconUrl ?? null,
      metadataJson: input.metadataJson ?? null,
      name: input.name.trim(),
      normalizedName,
      organizationId: input.organizationId,
      rarityLabel: input.rarityLabel ?? null,
      scope: "organization",
    });

    const primaryAlias = await this.aliasesRepository.create({
      alias: input.name.trim(),
      assetId: asset.id,
      aliasType: "community",
      isPrimary: true,
      normalizedAlias: normalizedName,
    });

    return {
      asset,
      kind: "created",
      primaryAlias,
    };
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
      targetAliases.map((alias) =>
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

  private async allocateAssetKey(gameSlug: string, normalizedName: string): Promise<string> {
    const base = `${gameSlug}-${slugify(normalizedName)}`.slice(0, 80) || `${gameSlug}-asset`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${base}-${randomUUID().slice(0, 8)}`;
      const existing = await this.assetsRepository.findByAssetKey(candidate);

      if (!existing) {
        return candidate;
      }
    }

    throw new ConflictError("Failed to allocate a unique asset key", {
      code: "ASSET_KEY_ALLOCATION_FAILED",
    });
  }

  private async requireAsset(assetId: number): Promise<AssetRecord> {
    const asset = await this.assetsRepository.findById(assetId);
    if (!asset) {
      throw new NotFoundError("Asset not found");
    }

    return asset;
  }
}

function slugify(normalizedName: string): string {
  return normalizedName
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/gu, "")
    .replace(/\-+/g, "-")
    .replace(/^\-|\-$/g, "");
}
