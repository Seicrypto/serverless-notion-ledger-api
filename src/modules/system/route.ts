import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppBindings } from "../../types/hono";
import { healthRoute } from "./schema";

export const systemRouter = new OpenAPIHono<AppBindings>();

systemRouter.openapi(healthRoute, (c) =>
  c.json({
    appEnv: c.env.APP_ENV,
    ok: true,
    service: "notion-ledger-api",
  }),
);
