import { createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import {
  errorSchema,
  messageSchema,
  validationErrorSchema,
} from "../../lib/openapi";

const registerRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(50).optional(),
    email: z.string().trim().email(),
    password: z.string().min(8).max(128),
  })
  .openapi("RegisterRequest");

const registerResponseSchema = z
  .object({
    email: z.string().email(),
    message: z.string(),
    requiresEmailVerification: z.boolean(),
    status: z.enum([
      "pending_verification",
      "pending_approval",
      "active",
      "disabled",
    ]),
    userId: z.number().int().positive(),
  })
  .openapi("RegisterResponse");

export const registerRoute = createRoute({
  method: "post",
  path: "/register",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: registerRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: registerResponseSchema,
        },
      },
      description: "User registered successfully.",
    },
    409: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Email already exists.",
    },
    422: {
      content: {
        "application/json": {
          schema: validationErrorSchema,
        },
      },
      description: "Validation failed.",
    },
    500: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Registration failed.",
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
