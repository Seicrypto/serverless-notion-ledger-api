import { createRoute, z } from "@hono/zod-openapi";
import { errorSchema, validationErrorSchema } from "../../lib/openapi";

const managedUserSchema = z
  .object({
    email: z.string().email(),
    emailVerifiedAt: z.string().nullable(),
    id: z.number().int().positive(),
    status: z.enum([
      "pending_verification",
      "pending_approval",
      "active",
      "disabled",
    ]),
  })
  .openapi("ManagedUser");

const managedUserResponseSchema = z
  .object({
    message: z.string(),
    user: managedUserSchema,
  })
  .openapi("ManagedUserResponse");

const pendingUsersResponseSchema = z
  .object({
    users: z.array(managedUserSchema),
  })
  .openapi("PendingUsersResponse");

const userIdParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .openapi("AdminUserIdParam");

export const listPendingUsersRoute = createRoute({
  method: "get",
  path: "/users/pending",
  tags: ["Admin"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: pendingUsersResponseSchema,
        },
      },
      description: "List users pending approval.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Admin access required.",
    },
  },
});

function createManageUserRoute(path: string, description: string) {
  return createRoute({
    method: "post",
    path,
    tags: ["Admin"],
    request: {
      params: userIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: managedUserResponseSchema,
          },
        },
        description,
      },
      400: {
        content: { "application/json": { schema: errorSchema } },
        description: "Invalid state transition.",
      },
      401: {
        content: { "application/json": { schema: errorSchema } },
        description: "Authentication required.",
      },
      403: {
        content: { "application/json": { schema: errorSchema } },
        description: "Admin access required.",
      },
      404: {
        content: { "application/json": { schema: errorSchema } },
        description: "User not found.",
      },
      422: {
        content: { "application/json": { schema: validationErrorSchema } },
        description: "Validation failed.",
      },
    },
  });
}

export const approveUserRoute = createManageUserRoute(
  "/users/{id}/approve",
  "Approve a pending user.",
);

export const disableUserRoute = createManageUserRoute(
  "/users/{id}/disable",
  "Disable a user.",
);

export const enableUserRoute = createManageUserRoute(
  "/users/{id}/enable",
  "Enable a user.",
);
