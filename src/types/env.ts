import type { NotionGateway } from "../durable-objects/notion-gateway";

export interface Env {
  APP_DB: D1Database;
  APP_ENV: string;
  JWT_SECRET: string;
  NOTION_API_BASE_URL: string;
  NOTION_API_TOKEN: string;
  NOTION_API_VERSION: string;
  NOTION_GATEWAY: DurableObjectNamespace<NotionGateway>;
  PASSWORD_PEPPER?: string;
  RESEND_API_KEY?: string;
  SNAPSHOT_CACHE: KVNamespace;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}
