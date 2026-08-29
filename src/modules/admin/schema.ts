import { createRoute, z } from "@hono/zod-openapi";
import { errorSchema, validationErrorSchema } from "../../lib/openapi";

const managedUserSchema = z
  .object({
    displayName: z.string().nullable(),
    email: z.string().email(),
    emailVerifiedAt: z.string().nullable(),
    id: z.number().int().positive(),
    status: z.enum([
      "pending_verification",
      "pending_approval",
      "active",
      "disabled",
    ]),
    vanity: z.string().nullable(),
  })
  .openapi("ManagedUser");

const offsetPaginationSchema = z
  .object({
    hasMore: z.boolean(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .openapi("AdminOffsetPagination");

const managedUserResponseSchema = z
  .object({
    message: z.string(),
    user: managedUserSchema,
  })
  .openapi("ManagedUserResponse");

const managedOrganizationSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    vanity: z.string().nullable(),
  })
  .openapi("ManagedOrganization");

const managedOrganizationResponseSchema = z
  .object({
    message: z.string(),
    organization: managedOrganizationSchema,
  })
  .openapi("ManagedOrganizationResponse");

const pendingUsersResponseSchema = z
  .object({
    users: z.array(managedUserSchema),
  })
  .openapi("PendingUsersResponse");

const disabledUsersQuerySchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .openapi("DisabledUsersQuery");

const disabledUsersResponseSchema = z
  .object({
    pagination: offsetPaginationSchema,
    users: z.array(managedUserSchema),
  })
  .openapi("DisabledUsersResponse");

const userIdParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .openapi("AdminUserIdParam");

const organizationIdentifierParamSchema = z
  .object({
    organization: z.string().trim().min(1).max(120),
  })
  .openapi("AdminOrganizationIdentifierParam");

const updateOrganizationVanityRequestSchema = z
  .object({
    vanity: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  })
  .openapi("UpdateOrganizationVanityRequest");

const userIdentifierParamSchema = z
  .object({
    user: z.string().trim().min(1).max(120),
  })
  .openapi("AdminUserIdentifierParam");

const updateUserVanityRequestSchema = z
  .object({
    vanity: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  })
  .openapi("UpdateUserVanityRequest");

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

export const listDisabledUsersRoute = createRoute({
  method: "get",
  path: "/users/disabled",
  tags: ["Admin"],
  request: {
    query: disabledUsersQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: disabledUsersResponseSchema,
        },
      },
      description: "List disabled users.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Admin access required.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const updateOrganizationVanityRoute = createRoute({
  method: "patch",
  path: "/organizations/{organization}/vanity",
  tags: ["Admin"],
  request: {
    params: organizationIdentifierParamSchema,
    body: {
      content: {
        "application/json": {
          schema: updateOrganizationVanityRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: managedOrganizationResponseSchema,
        },
      },
      description: "Organization vanity updated successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Official staff access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization vanity already exists.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const updateUserVanityRoute = createRoute({
  method: "patch",
  path: "/users/{user}/vanity",
  tags: ["Admin"],
  request: {
    params: userIdentifierParamSchema,
    body: {
      content: {
        "application/json": {
          schema: updateUserVanityRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: managedUserResponseSchema,
        },
      },
      description: "User vanity updated successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Official staff access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "User not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "User vanity already exists.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const adminUserDetailRoute = createRoute({
  method: "get",
  path: "/users/{user}",
  tags: ["Admin"],
  request: {
    params: userIdentifierParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: managedUserResponseSchema,
        },
      },
      description: "Single user detail for official staff.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Official staff access required.",
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

export const deleteUserRoute = createRoute({
  method: "delete",
  path: "/users/{user}",
  tags: ["Admin"],
  request: {
    params: userIdentifierParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: managedUserResponseSchema,
        },
      },
      description: "User deleted successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Official admin access required.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "User not found.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "User cannot be deleted because dependent records still exist.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
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
