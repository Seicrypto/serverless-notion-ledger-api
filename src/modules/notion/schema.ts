import { createRoute } from "@hono/zod-openapi";
import { messageSchema } from "../../lib/openapi";

export const notionQueryRoute = createRoute({
  method: "post",
  path: "/query",
  tags: ["Notion"],
  responses: {
    501: {
      content: {
        "application/json": {
          schema: messageSchema,
        },
      },
      description: "Notion query placeholder.",
    },
  },
});

export const notionMutateRoute = createRoute({
  method: "post",
  path: "/mutate",
  tags: ["Notion"],
  responses: {
    501: {
      content: {
        "application/json": {
          schema: messageSchema,
        },
      },
      description: "Notion mutation placeholder.",
    },
  },
});
