import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { assertCoreBindings } from "./lib/env";
import { authRouter } from "./modules/auth/route";
import { adminRouter } from "./modules/admin/route";
import { dashboardRouter } from "./modules/dashboard/route";
import { notionRouter } from "./modules/notion/route";
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

function applyCorsHeaders(context: Context, origin?: string | null) {
  if (!origin || !CORS_ALLOWED_ORIGINS.has(origin)) {
    return;
  }

  context.header("Access-Control-Allow-Origin", origin);
  context.header("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS);
  context.header("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS);
  context.header("Access-Control-Allow-Credentials", "true");
  context.header("Vary", "Origin");
}

export function createApp() {
  const app = new OpenAPIHono<AppBindings>();

  app.use(async (c, next) => {
    assertCoreBindings(c.env);
    const origin = c.req.header("Origin");

    if (c.req.method === "OPTIONS") {
      applyCorsHeaders(c, origin);
      return new Response(null, {
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
  app.route("/organizations", organizationsRouter);
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
      return c.json({ error: error.message }, error.status);
    }

    console.error(error);
    return c.json({ error: "Internal Server Error" }, 500);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
export type { Env };
