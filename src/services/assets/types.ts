import type { AssetAliasRecord, AssetRecord } from "../../repositories/types";

export interface AssetDuplicateDetectionInput {
  gameId: number;
  name: string;
  normalizedName?: string;
  organizationId?: number | null;
}

export interface AssetDuplicateCandidate {
  alias: AssetAliasRecord | null;
  asset: AssetRecord;
  matchedBy: "alias_exact" | "canonical_exact" | "possible";
}

export interface AssetDuplicateDetectionResult {
  exactMatch: AssetDuplicateCandidate | null;
  normalizedName: string;
  possibleMatches: AssetDuplicateCandidate[];
  recommendedAction: "allow_create" | "confirm_create" | "use_existing";
}
