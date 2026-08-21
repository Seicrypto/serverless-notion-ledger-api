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
    error: z.string().openapi({
      example: "Internal Server Error",
    }),
  })
  .openapi("ErrorResponse");

export const validationErrorSchema = z
  .object({
    error: z.string().openapi({
      example: "Validation failed",
    }),
    issues: z.array(z.string()).openapi({
      example: ["email: Invalid email"],
    }),
  })
  .openapi("ValidationErrorResponse");
