import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppBindings } from "../../types/hono";
import { currentUserDashboardRoute } from "./schema";

export const dashboardRouter = new OpenAPIHono<AppBindings>();

dashboardRouter.openapi(currentUserDashboardRoute, (c) =>
  c.json(
    {
      message: "Dashboard route placeholder.",
    },
    501,
  ),
);
