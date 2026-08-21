export function nowIso(): string {
  return new Date().toISOString();
}

export function toSqliteBoolean(value: boolean | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value ? 1 : 0;
}
