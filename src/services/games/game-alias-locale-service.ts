import { AppError } from "../../lib/errors";
import type { GameAliasType } from "../../repositories/types";
import type { LocaleCode } from "../../types/locale";
import { normalizeLocaleCode } from "../../types/locale";

export interface ValidateGameAliasLocaleInput {
  aliasType: GameAliasType;
  locale?: string | null;
}

export function validateGameAliasLocale(
  input: ValidateGameAliasLocaleInput,
): LocaleCode | null {
  if (input.locale == null) {
    if (input.aliasType === "localized") {
      throw new AppError("Localized aliases must include a locale", 422, {
        code: "LOCALE_REQUIRED",
      });
    }

    return null;
  }

  const normalized = normalizeLocaleCode(input.locale);

  if (!normalized) {
    throw new AppError("Locale must use ll-RR format", 422, {
      code: "INVALID_LOCALE",
    });
  }

  return normalized;
}
