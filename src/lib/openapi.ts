import { z } from "@hono/zod-openapi";

export const messageSchema = z
  .object({
    message: z.string().openapi({
      example: "Not implemented yet.",
    }),
  })
  .openapi("MessageResponse");

export const healthSchema = z
  .object({
    appEnv: z.string().openapi({
      example: "production",
    }),
    ok: z.boolean().openapi({
      example: true,
    }),
    service: z.string().openapi({
      example: "notion-ledger-api",
    }),
  })
  .openapi("HealthResponse");

export const errorSchema = z
  .object({
    code: z.string().openapi({
      example: "INTERNAL_SERVER_ERROR",
    }),
    error: z.string().openapi({
      example: "Internal Server Error",
    }),
    requestId: z.string().openapi({
      example: "6d7c5b45f4ae4c01",
    }),
  })
  .openapi("ErrorResponse");

export const validationErrorSchema = z
  .object({
    code: z.string().openapi({
      example: "VALIDATION_ERROR",
    }),
    error: z.string().openapi({
      example: "Validation failed",
    }),
    issues: z.array(z.string()).openapi({
      example: ["email: Invalid email"],
    }),
    requestId: z.string().openapi({
      example: "6d7c5b45f4ae4c01",
    }),
  })
  .openapi("ValidationErrorResponse");
