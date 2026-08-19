import { createRoute } from "@hono/zod-openapi";
import { healthSchema } from "../../lib/openapi";

export const healthRoute = createRoute({
  method: "get",
  path: "/healthz",
  tags: ["System"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: healthSchema,
        },
      },
      description: "Worker health payload.",
    },
  },
});
