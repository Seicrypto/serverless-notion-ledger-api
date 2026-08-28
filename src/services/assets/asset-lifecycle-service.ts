import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { NotFoundError } from "../../lib/errors";
import { AssetAliasesRepository } from "../../repositories/asset-aliases-repository";
import { AssetsRepository } from "../../repositories/assets-repository";
import { GamesRepository } from "../../repositories/games-repository";
import type { AssetAliasRecord, AssetRecord, AssetType } from "../../repositories/types";
import { AssetDuplicateDetectionService } from "./asset-duplicate-detection-service";
import { AssetIdentityResolutionService } from "./asset-identity-resolution-service";
import { AssetTrustLifecycleService } from "./asset-trust-lifecycle-service";
import type { AssetDuplicateDetectionResult } from "./types";

export interface CreateAssetLifecycleInput {
  assetType?: AssetType;
  createdByUserId?: number | null;
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
  private readonly identityResolutionService: AssetIdentityResolutionService;
  private readonly trustLifecycleService: AssetTrustLifecycleService;

  constructor(
    private readonly db: DatabaseClient,
    options: {
      aliasesRepository?: AssetAliasesRepository;
      assetsRepository?: AssetsRepository;
      duplicateDetectionService?: AssetDuplicateDetectionService;
      gamesRepository?: GamesRepository;
      identityResolutionService?: AssetIdentityResolutionService;
      trustLifecycleService?: AssetTrustLifecycleService;
    } = {},
  ) {
    this.aliasesRepository =
      options.aliasesRepository ?? new AssetAliasesRepository(db);
    this.assetsRepository = options.assetsRepository ?? new AssetsRepository(db);
    this.duplicateDetectionService =
      options.duplicateDetectionService ?? new AssetDuplicateDetectionService(db);
    this.gamesRepository = options.gamesRepository ?? new GamesRepository(db);
    this.identityResolutionService =
      options.identityResolutionService ?? new AssetIdentityResolutionService(db);
    this.trustLifecycleService =
      options.trustLifecycleService ?? new AssetTrustLifecycleService(db);
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
      createdByUserId: input.createdByUserId ?? null,
      gameId: input.gameId,
      iconUrl: input.iconUrl ?? null,
      metadataJson: input.metadataJson ?? null,
      name: input.name.trim(),
      normalizedName,
      organizationId: input.organizationId,
      rarityLabel: input.rarityLabel ?? null,
      scope: "organization",
      status: this.trustLifecycleService.resolveInitialStatus(),
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
    return this.identityResolutionService.mergeAsset(input);
  }

  async resolveCanonicalAsset(assetId: number): Promise<AssetRecord> {
    return this.identityResolutionService.resolveCanonicalAsset(assetId);
  }

  async resolveDefaultSettlementUnit(input: {
    gameId: number;
    organizationId?: number | null;
  }): Promise<AssetRecord | null> {
    return this.identityResolutionService.resolveDefaultSettlementUnit(input);
  }

  async recomputeTrust(assetId: number): Promise<AssetRecord> {
    return this.trustLifecycleService.recomputeStatus(assetId);
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

    throw new Error("Failed to allocate a unique asset key");
  }
}

function slugify(normalizedName: string): string {
  return normalizedName
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
