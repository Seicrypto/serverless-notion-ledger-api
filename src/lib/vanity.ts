const INITIAL_VANITY_RANDOM_LENGTH = 12;

function randomToken(length: number): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, length);
}

export function generateInitialOrganizationVanity(): string {
  return `g-${randomToken(INITIAL_VANITY_RANDOM_LENGTH)}`;
}

export function generateInitialUserVanity(): string {
  return `u-${randomToken(INITIAL_VANITY_RANDOM_LENGTH)}`;
}
