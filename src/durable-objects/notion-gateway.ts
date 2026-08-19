import { DurableObject } from "cloudflare:workers";
import { ConfigurationError } from "../lib/errors";
import type { Env } from "../types/env";
import type {
  NotionRequestEnvelope,
  NotionResponseEnvelope,
} from "../types/notion";

const MIN_INTERVAL_MS = 334;
const LAST_REQUEST_AT_KEY = "notion:last-request-at";

export class NotionGateway extends DurableObject<Env> {
  private lastRequestAtMs = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    ctx.blockConcurrencyWhile(async () => {
      this.lastRequestAtMs =
        (await ctx.storage.get<number>(LAST_REQUEST_AT_KEY)) ?? 0;
    });
  }

  async enqueueRequest(
    request: NotionRequestEnvelope,
  ): Promise<NotionResponseEnvelope> {
    return this.runExclusive(async () => {
      await this.throttle();
      return this.forwardToNotion(request);
    });
  }

  private async forwardToNotion(
    request: NotionRequestEnvelope,
  ): Promise<NotionResponseEnvelope> {
    if (!this.env.NOTION_API_TOKEN) {
      throw new ConfigurationError("NOTION_API_TOKEN is not configured");
    }

    const url = new URL(request.path, `${this.env.NOTION_API_BASE_URL}/`);
    const response = await fetch(url, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${this.env.NOTION_API_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": this.env.NOTION_API_VERSION,
        ...request.headers,
      },
      body:
        request.body === undefined || request.method === "GET"
          ? undefined
          : JSON.stringify(request.body),
    });

    const responseBody = await response.json().catch(() => null);
    const headers = Object.fromEntries(response.headers.entries());

    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "1");
      this.lastRequestAtMs = Date.now() + retryAfterSeconds * 1000;
      await this.ctx.storage.put(LAST_REQUEST_AT_KEY, this.lastRequestAtMs);
    }

    return {
      body: responseBody,
      headers,
      ok: response.ok,
      status: response.status,
    };
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;

    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, this.lastRequestAtMs + MIN_INTERVAL_MS - now);

    if (waitMs > 0) {
      await scheduler.wait(waitMs);
    }

    this.lastRequestAtMs = Date.now();
    await this.ctx.storage.put(LAST_REQUEST_AT_KEY, this.lastRequestAtMs);
  }
}
