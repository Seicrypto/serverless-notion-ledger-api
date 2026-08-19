import { createRoute } from "@hono/zod-openapi";
import { messageSchema } from "../../lib/openapi";

export const registerRoute = createRoute({
  method: "post",
  path: "/register",
  tags: ["Auth"],
  responses: {
    501: {
      content: {
        "application/json": {
          schema: messageSchema,
        },
      },
      description: "Registration flow placeholder.",
    },
  },
});

export const loginRoute = createRoute({
  method: "post",
  path: "/login",
  tags: ["Auth"],
  responses: {
    501: {
      content: {
        "application/json": {
          schema: messageSchema,
        },
      },
      description: "Login flow placeholder.",
    },
  },
});

export const forgotPasswordRoute = createRoute({
  method: "post",
  path: "/forgot-password",
  tags: ["Auth"],
  responses: {
    501: {
      content: {
        "application/json": {
          schema: messageSchema,
        },
      },
      description: "Password reset flow placeholder.",
    },
  },
});
