const INITIAL_VANITY_RANDOM_LENGTH = 12;

function randomToken(length: number): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, length);
}

function normalizeVanitySeed(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  if (!normalized) {
    return fallback;
  }

  if (/^[a-z]/.test(normalized)) {
    return normalized;
  }

  return `${fallback}-${normalized}`.slice(0, 24).replace(/-+$/g, "");
}

function generateSeededVanity(value: string | null | undefined, fallback: string): string {
  return `${normalizeVanitySeed(value, fallback)}-${randomToken(
    INITIAL_VANITY_RANDOM_LENGTH,
  )}`;
}

export function generateInitialOrganizationVanity(name?: string | null): string {
  return generateSeededVanity(name, "org");
}

export function generateInitialUserVanity(displayName?: string | null): string {
  return generateSeededVanity(displayName, "user");
}

export function generateInitialCharacterVanity(name?: string | null): string {
  return generateSeededVanity(name, "char");
}
