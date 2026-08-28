import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { AssetAliasesRepository } from "../../repositories/asset-aliases-repository";
import { AssetsRepository } from "../../repositories/assets-repository";
import type { AssetRecord } from "../../repositories/types";
import { AssetNormalizationService } from "./asset-normalization-service";
import { AssetTrustLifecycleService } from "./asset-trust-lifecycle-service";
import type {
  AssetDuplicateCandidate,
  AssetDuplicateDetectionInput,
  AssetDuplicateDetectionResult,
} from "./types";

export class AssetDuplicateDetectionService {
  private readonly aliasesRepository: AssetAliasesRepository;
  private readonly assetsRepository: AssetsRepository;
  private readonly normalizationService: AssetNormalizationService;
  private readonly trustLifecycleService: AssetTrustLifecycleService;

  constructor(
    private readonly db: DatabaseClient,
    options: {
      aliasesRepository?: AssetAliasesRepository;
      assetsRepository?: AssetsRepository;
      normalizationService?: AssetNormalizationService;
      trustLifecycleService?: AssetTrustLifecycleService;
    } = {},
  ) {
    this.aliasesRepository =
      options.aliasesRepository ?? new AssetAliasesRepository(db);
    this.assetsRepository = options.assetsRepository ?? new AssetsRepository(db);
    this.normalizationService =
      options.normalizationService ?? new AssetNormalizationService();
    this.trustLifecycleService =
      options.trustLifecycleService ?? new AssetTrustLifecycleService(db);
  }

  async detect(
    input: AssetDuplicateDetectionInput,
  ): Promise<AssetDuplicateDetectionResult> {
    const normalizedName =
      input.normalizedName ?? this.normalizationService.normalizeName(input.name);

    const exactAsset = await this.findExactCanonicalMatch(
      input.gameId,
      normalizedName,
      input.organizationId,
    );

    if (exactAsset) {
      return {
        exactMatch: {
          alias: null,
          asset: exactAsset,
          matchedBy: "canonical_exact",
        },
        normalizedName,
        possibleMatches: [],
        recommendedAction: "use_existing",
      };
    }

    const exactAliasMatches = await this.aliasesRepository.listByNormalizedAlias(
      normalizedName,
    );

    for (const alias of exactAliasMatches) {
      const asset = await this.assetsRepository.findById(alias.asset_id);
      if (
        !asset ||
        !this.isDirectlyUsableAsset(asset, input.gameId, input.organizationId)
      ) {
        continue;
      }

      return {
        exactMatch: {
          alias,
          asset,
          matchedBy: "alias_exact",
        },
        normalizedName,
        possibleMatches: [],
        recommendedAction: "use_existing",
      };
    }

    const possibleMatches = await this.findPossibleMatches(
      input.gameId,
      normalizedName,
      input.organizationId,
    );

    return {
      exactMatch: null,
      normalizedName,
      possibleMatches,
      recommendedAction:
        possibleMatches.length > 0 ? "confirm_create" : "allow_create",
    };
  }

  private async findExactCanonicalMatch(
    gameId: number,
    normalizedName: string,
    organizationId?: number | null,
  ): Promise<AssetRecord | null> {
    const candidates = await this.assetsRepository.listByGame(gameId);

    return (
      candidates.find(
        (asset) =>
          asset.normalized_name === normalizedName &&
          this.isDirectlyUsableAsset(asset, gameId, organizationId),
      ) ?? null
    );
  }

  private async findPossibleMatches(
    gameId: number,
    normalizedName: string,
    organizationId?: number | null,
  ): Promise<AssetDuplicateCandidate[]> {
    const assets = await this.assetsRepository.listByGame(gameId);
    const suggestibleAssets = assets.filter((asset) =>
      this.isSuggestibleAsset(asset, gameId, organizationId),
    );
    const results = new Map<number, AssetDuplicateCandidate>();
    const queryTokens = tokenize(normalizedName);

    for (const asset of suggestibleAssets) {
      if (asset.normalized_name === normalizedName) {
        continue;
      }

      if (isPossibleMatch(normalizedName, asset.normalized_name, queryTokens)) {
        results.set(asset.id, {
          alias: null,
          asset,
          matchedBy: "possible",
        });
      }
    }

    const aliasCandidates =
      await this.aliasesRepository.searchByNormalizedAliasPrefix(normalizedName);

    for (const alias of aliasCandidates) {
      const asset = suggestibleAssets.find((candidate) => candidate.id === alias.asset_id);
      if (!asset) {
        continue;
      }

      if (!isPossibleMatch(normalizedName, alias.normalized_alias, queryTokens)) {
        continue;
      }

      results.set(asset.id, {
        alias,
        asset,
        matchedBy: "possible",
      });
    }

    return [...results.values()].slice(0, 10);
  }

  private isDirectlyUsableAsset(
    asset: AssetRecord,
    gameId: number,
    organizationId?: number | null,
  ): boolean {
    if (asset.game_id !== gameId) {
      return false;
    }

    return this.trustLifecycleService.isVisibleForOrganization(
      asset,
      organizationId,
    );
  }

  private isSuggestibleAsset(
    asset: AssetRecord,
    gameId: number,
    organizationId?: number | null,
  ): boolean {
    if (asset.game_id !== gameId) {
      return false;
    }

    return this.trustLifecycleService.isSuggestibleForOrganization(
      asset,
      organizationId,
    );
  }
}

function tokenize(normalizedName: string): string[] {
  return normalizedName.split(" ").filter(Boolean);
}

function isPossibleMatch(
  input: string,
  candidate: string,
  queryTokens: string[],
): boolean {
  if (!input || !candidate) {
    return false;
  }

  if (candidate.includes(input) || input.includes(candidate)) {
    return true;
  }

  const candidateTokens = tokenize(candidate);
  const sharedTokens = queryTokens.filter((token) => candidateTokens.includes(token));

  return sharedTokens.length > 0 && sharedTokens.length >= Math.min(2, queryTokens.length);
}
