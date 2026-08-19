import { ConfigurationError } from "./errors";
import type { Env } from "../types/env";

export function requireBinding<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined || value === "") {
    throw new ConfigurationError(`Missing required binding or secret: ${name}`);
  }

  return value;
}

export function assertCoreBindings(env: Env): void {
  requireBinding(env.APP_DB, "APP_DB");
  requireBinding(env.NOTION_GATEWAY, "NOTION_GATEWAY");
  requireBinding(env.SNAPSHOT_CACHE, "SNAPSHOT_CACHE");
}
