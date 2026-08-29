import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { assertCoreBindings } from "./lib/env";
import { AppError, ensureRequestId, errorResponse } from "./lib/errors";
import { authRouter } from "./modules/auth/route";
import { adminRouter } from "./modules/admin/route";
import { adminAssetsRouter } from "./modules/assets/admin-route";
import { organizationAssetsRouter } from "./modules/assets/organization-route";
import { dashboardRouter } from "./modules/dashboard/route";
import { gamesRouter } from "./modules/games/route";
import { organizationLedgerRouter } from "./modules/ledger/route";
import { notionRouter } from "./modules/notion/route";
import { officialRouter } from "./modules/official/route";
import { organizationsRouter } from "./modules/organizations/route";
import { systemRouter } from "./modules/system/route";
import type { Env } from "./types/env";
import type { AppBindings } from "./types/hono";

export const openApiDocumentConfig = {
  openapi: "3.1.0",
  info: {
    title: "Notion Ledger API",
    version: "0.1.0",
    description:
      "Cloudflare Worker API for auth, organization metadata, cached dashboard reads, and Notion-backed ledger operations.",
  },
} as const;

const CORS_ALLOWED_ORIGINS = new Set([
  "https://raid-ledger.pages.dev",
]);

const CORS_ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const CORS_ALLOWED_HEADERS = "Content-Type, Authorization";

function getCorsHeaders(origin?: string | null): Headers | null {
  if (!origin || !CORS_ALLOWED_ORIGINS.has(origin)) {
    return null;
  }

  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  });
}

function applyCorsHeaders(context: Context, origin?: string | null) {
  const headers = getCorsHeaders(origin);
  if (!headers) {
    return;
  }

  for (const [key, value] of headers.entries()) {
    context.header(key, value);
  }
}

export function createApp() {
  const app = new OpenAPIHono<AppBindings>();

  app.use(async (c, next) => {
    assertCoreBindings(c.env);
    ensureRequestId(c);
    const origin = c.req.header("Origin");

    if (c.req.method === "OPTIONS") {
      const headers = getCorsHeaders(origin) ?? new Headers();
      headers.set("X-Request-Id", ensureRequestId(c));
      return new Response(null, {
        headers,
        status: 204,
      });
    }

    await next();
    applyCorsHeaders(c, origin);
  });

  app.doc("/openapi.json", openApiDocumentConfig);

  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  app.route("/", systemRouter);
  app.route("/auth", authRouter);
  app.route("/admin", adminRouter);
  app.route("/admin", adminAssetsRouter);
  app.route("/official", officialRouter);
  app.route("/games", gamesRouter);
  app.route("/organizations", organizationsRouter);
  app.route("/organizations", organizationAssetsRouter);
  app.route("/organizations", organizationLedgerRouter);
  app.route("/dashboard", dashboardRouter);
  app.route("/notion", notionRouter);

  app.notFound((c) =>
    c.json(
      {
        error: "Not Found",
      },
      404,
    ),
  );

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return errorResponse(
        c,
        new AppError(error.message, error.status, {
          code: "HTTP_EXCEPTION",
        }),
      );
    }

    return errorResponse(c, error);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
export type { Env };
