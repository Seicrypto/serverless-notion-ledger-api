import { createRoute } from "@hono/zod-openapi";
import { messageSchema } from "../../lib/openapi";

export const currentOrganizationRoute = createRoute({
  method: "get",
  path: "/current",
  tags: ["Organizations"],
  responses: {
    501: {
      content: {
        "application/json": {
          schema: messageSchema,
        },
      },
      description: "Organization profile placeholder.",
    },
  },
});

export const currentOrganizationMembersRoute = createRoute({
  method: "get",
  path: "/current/members",
  tags: ["Organizations"],
  responses: {
    501: {
      content: {
        "application/json": {
          schema: messageSchema,
        },
      },
      description: "Organization members placeholder.",
    },
  },
});
