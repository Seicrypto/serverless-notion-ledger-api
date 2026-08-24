export const LOCALE_PATTERN = /^[a-z]{2}-[A-Z]{2}$/;

export type LocaleCode = `${Lowercase<string>}${Lowercase<string>}-${Uppercase<string>}${Uppercase<string>}`;

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
