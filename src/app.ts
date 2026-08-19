import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { HTTPException } from "hono/http-exception";
import { NotionGateway } from "./durable-objects/notion-gateway";
import { assertCoreBindings } from "./lib/env";
import { authRouter } from "./modules/auth/route";
import { dashboardRouter } from "./modules/dashboard/route";
import { notionRouter } from "./modules/notion/route";
import { organizationsRouter } from "./modules/organizations/route";
import { systemRouter } from "./modules/system/route";
import type { Env } from "./types/env";
import type { AppBindings } from "./types/hono";

export function createApp() {
  const app = new OpenAPIHono<AppBindings>();

  app.use(async (c, next) => {
    assertCoreBindings(c.env);
    await next();
  });

  app.doc("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Notion Ledger API",
      version: "0.1.0",
      description:
        "Cloudflare Worker API for auth, organization metadata, cached dashboard reads, and Notion-backed ledger operations.",
    },
  });

  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  app.route("/", systemRouter);
  app.route("/auth", authRouter);
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
export { NotionGateway };
export type { Env };
