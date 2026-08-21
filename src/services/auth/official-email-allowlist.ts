export function isOfficialAdminEmail(
  email: string,
  rawAllowlist?: string,
): boolean {
  if (!rawAllowlist) {
    return false;
  }

  const normalized = email.trim().toLowerCase();
  const allowlist = rawAllowlist
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(normalized);
}
