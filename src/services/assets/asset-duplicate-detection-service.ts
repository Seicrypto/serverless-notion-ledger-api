import { AssetAliasesRepository } from "../../repositories/asset-aliases-repository";
import { AssetsRepository } from "../../repositories/assets-repository";
import type { DatabaseClient } from "../../infrastructure/database/database-client";
import type { AssetRecord } from "../../repositories/types";
import type {
  AssetDuplicateCandidate,
  AssetDuplicateDetectionInput,
  AssetDuplicateDetectionResult,
} from "./types";
import { AssetNormalizationService } from "./asset-normalization-service";

export class AssetDuplicateDetectionService {
  private readonly aliasesRepository: AssetAliasesRepository;
  private readonly assetsRepository: AssetsRepository;
  private readonly normalizationService: AssetNormalizationService;

  constructor(
    private readonly db: DatabaseClient,
    options: {
      aliasesRepository?: AssetAliasesRepository;
      assetsRepository?: AssetsRepository;
      normalizationService?: AssetNormalizationService;
    } = {},
  ) {
    this.aliasesRepository =
      options.aliasesRepository ?? new AssetAliasesRepository(db);
    this.assetsRepository = options.assetsRepository ?? new AssetsRepository(db);
    this.normalizationService =
      options.normalizationService ?? new AssetNormalizationService();
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
      if (!asset || !this.isUsableAsset(asset, input.gameId, input.organizationId)) {
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
        possibleMatches.length > 0 ? "confirm_create" : "block_create",
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
          this.isUsableAsset(asset, gameId, organizationId),
      ) ?? null
    );
  }

  private async findPossibleMatches(
    gameId: number,
    normalizedName: string,
    organizationId?: number | null,
  ): Promise<AssetDuplicateCandidate[]> {
    const assets = await this.assetsRepository.listByGame(gameId);
    const usableAssets = assets.filter((asset) =>
      this.isUsableAsset(asset, gameId, organizationId),
    );
    const results = new Map<number, AssetDuplicateCandidate>();
    const queryTokens = tokenize(normalizedName);

    for (const asset of usableAssets) {
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
      const asset = usableAssets.find((candidate) => candidate.id === alias.asset_id);
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

  private isUsableAsset(
    asset: AssetRecord,
    gameId: number,
    organizationId?: number | null,
  ): boolean {
    if (asset.game_id !== gameId) {
      return false;
    }

    if (asset.status === "merged") {
      return false;
    }

    if (asset.scope === "organization") {
      return asset.organization_id === (organizationId ?? null);
    }

    return true;
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
