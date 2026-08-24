import { createRoute, z } from "@hono/zod-openapi";
import {
  errorSchema,
  messageSchema,
  validationErrorSchema,
} from "../../lib/openapi";

const organizationSchema = z
  .object({
    createdAt: z.string(),
    createdByUserId: z.number().int().positive(),
    description: z.string().nullable(),
    iconUrl: z.string().nullable(),
    id: z.number().int().positive(),
    name: z.string(),
    slug: z.string(),
    updatedAt: z.string(),
    vanity: z.string().nullable(),
  })
  .openapi("Organization");

const createOrganizationRequestSchema = z
  .object({
    description: z.string().trim().max(500).nullable().optional(),
    iconUrl: z.string().trim().url().nullable().optional(),
    name: z.string().trim().min(1).max(100),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .openapi("CreateOrganizationRequest");

const createOrganizationResponseSchema = z
  .object({
    message: z.string(),
    organization: organizationSchema,
  })
  .openapi("CreateOrganizationResponse");

const organizationIdParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .openapi("OrganizationIdParam");

const deleteOrganizationResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("DeleteOrganizationResponse");

export const createOrganizationRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Organizations"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createOrganizationRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: createOrganizationResponseSchema,
        },
      },
      description: "Organization created successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to create organizations.",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization name or slug already exists.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

export const deleteOrganizationRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Organizations"],
  request: {
    params: organizationIdParamSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: deleteOrganizationResponseSchema,
        },
      },
      description: "Organization deleted successfully.",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "User is not allowed to delete this organization.",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Organization not found.",
    },
    422: {
      content: { "application/json": { schema: validationErrorSchema } },
      description: "Validation failed.",
    },
  },
});

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
