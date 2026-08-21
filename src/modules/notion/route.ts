import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppBindings } from "../../types/hono";
import { notionMutateRoute, notionQueryRoute } from "./schema";

export const notionRouter = new OpenAPIHono<AppBindings>();

notionRouter.openapi(notionQueryRoute, (c) =>
  c.json(
    {
      message: "Notion query route placeholder.",
    },
    501,
  ),
);

notionRouter.openapi(notionMutateRoute, (c) =>
  c.json(
    {
      message: "Notion mutation route placeholder.",
    },
    501,
  ),
);
