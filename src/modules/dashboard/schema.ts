import { createRoute } from "@hono/zod-openapi";
import { messageSchema } from "../../lib/openapi";

export const currentUserDashboardRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Dashboard"],
  responses: {
    501: {
      content: {
        "application/json": {
          schema: messageSchema,
        },
      },
      description: "Current user dashboard placeholder.",
    },
  },
});
