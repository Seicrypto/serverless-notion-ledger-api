export class AssetNormalizationService {
  normalizeName(name: string): string {
    return normalizeAssetName(name);
  }
}

export function normalizeAssetName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
