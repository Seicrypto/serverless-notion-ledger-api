export const LOCALE_PATTERN = /^[a-z]{2}-[A-Z]{2}$/;
export const SUPPORTED_FRONTEND_LANGUAGES = ["zh-tw", "en", "ja"] as const;

export type LocaleCode = `${Lowercase<string>}${Lowercase<string>}-${Uppercase<string>}${Uppercase<string>}`;
export type SupportedFrontendLanguage =
  (typeof SUPPORTED_FRONTEND_LANGUAGES)[number];

export function isLocaleCode(value: string): value is LocaleCode {
  return LOCALE_PATTERN.test(value);
}

export function normalizeLocaleCode(value: string): LocaleCode | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const segments = trimmed.split("-");

  if (segments.length !== 2) {
    return null;
  }

  const [language, region] = segments;
  const normalized = `${language.toLowerCase()}-${region.toUpperCase()}`;

  return isLocaleCode(normalized) ? (normalized as LocaleCode) : null;
}

export function normalizeFrontendLanguage(
  value?: string | null,
): SupportedFrontendLanguage {
  const trimmed = value?.trim().toLowerCase();

  if (!trimmed) {
    return "en";
  }

  if (trimmed === "zh-tw" || trimmed.startsWith("zh")) {
    return "zh-tw";
  }

  if (trimmed === "ja" || trimmed.startsWith("ja-")) {
    return "ja";
  }

  if (trimmed === "en" || trimmed.startsWith("en-")) {
    return "en";
  }

  return "en";
}
