import { OpenAPIHono } from "@hono/zod-openapi";
import { D1Client } from "../../infrastructure/d1/d1-client";
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  buildErrorResponseBody,
  ensureRequestId,
} from "../../lib/errors";
import { getSessionCookie } from "../../lib/session-cookie";
import { generateInitialOrganizationVanity } from "../../lib/vanity";
import { SessionAuthService } from "../../services/auth/session-auth-service";
import { OrganizationMembersRepository } from "../../repositories/organization-members-repository";
import { OrganizationsRepository } from "../../repositories/organizations-repository";
import type { AppBindings } from "../../types/hono";
import {
  createOrganizationRoute,
  currentOrganizationMembersRoute,
  currentOrganizationRoute,
  deleteOrganizationRoute,
} from "./schema";

export const organizationsRouter = new OpenAPIHono<AppBindings>();

function validationErrorFromIssues(
  issues: Array<{ message: string; path: PropertyKey[] }>,
  defaultPath: "body" | "query" | "params",
  requestId: string,
) {
  return {
    code: "VALIDATION_ERROR",
    error: "Validation failed",
    issues: issues.map((issue) => {
      const path = issue.path.map(String).join(".") || defaultPath;
      return `${path}: ${issue.message}`;
    }),
    requestId,
  };
}

function mapOrganizationConflict(error: unknown): AppError | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (!error.message.includes("UNIQUE constraint failed:")) {
    return null;
  }

  if (error.message.includes("organizations.name")) {
    return new AppError("Organization name already exists", 409, {
      code: "ORGANIZATION_NAME_EXISTS",
    });
  }

  if (error.message.includes("organizations.slug")) {
    return new AppError("Organization slug already exists", 409, {
      code: "ORGANIZATION_SLUG_EXISTS",
    });
  }

  if (error.message.includes("organizations.vanity")) {
    return new AppError("Organization vanity already exists", 409, {
      code: "ORGANIZATION_VANITY_EXISTS",
    });
  }

  return null;
}

function toOrganizationResponse(
  organization: Awaited<ReturnType<OrganizationsRepository["create"]>>,
) {
  return {
    createdAt: organization.created_at,
    createdByUserId: organization.created_by_user_id,
    description: organization.description,
    iconUrl: organization.icon_url,
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    updatedAt: organization.updated_at,
    vanity: organization.vanity,
  };
}

function generateInitialVanity(): string {
  return generateInitialOrganizationVanity();
}

async function reserveInitialVanity(
  organizations: OrganizationsRepository,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const vanity = generateInitialVanity();
    const existing = await organizations.findByVanity(vanity);

    if (!existing) {
      return vanity;
    }
  }

  throw new AppError("Failed to allocate organization vanity", 503, {
    code: "ORGANIZATION_VANITY_ALLOCATION_FAILED",
  });
}

organizationsRouter.openapi(createOrganizationRoute, async (c) => {
  const schema =
    createOrganizationRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "body", ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const vanity = await reserveInitialVanity(organizations);

    const organization = await organizations.create({
      createdByUserId: session.user.id,
      description: parsed.data.description,
      iconUrl: parsed.data.iconUrl,
      name: parsed.data.name,
      slug: parsed.data.slug,
      vanity,
    });

    await members.create({
      organizationId: organization.id,
      role: "owner",
      userId: session.user.id,
    });

    return c.json(
      {
        message: "Organization created successfully.",
        organization: toOrganizationResponse(organization),
      },
      201,
    );
  } catch (error) {
    const conflict = mapOrganizationConflict(error);

    if (conflict) {
      return c.json(buildErrorResponseBody(c, conflict), 409);
    }

    if (error instanceof AppError) {
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 409,
      );
    }

    throw error;
  }
});

organizationsRouter.openapi(deleteOrganizationRoute, async (c) => {
  const parsed = deleteOrganizationRoute.request.params.safeParse(c.req.param());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const organization = await organizations.findById(parsed.data.id);

    if (!organization) {
      throw new NotFoundError("Organization not found");
    }

    if (organization.created_by_user_id !== session.user.id) {
      throw new ForbiddenError("Only the organization creator can delete it", {
        code: "ORGANIZATION_DELETE_FORBIDDEN",
      });
    }

    await organizations.delete(organization.id);

    return c.json(
      {
        message: "Organization deleted successfully.",
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404,
      );
    }

    throw error;
  }
});

organizationsRouter.openapi(currentOrganizationRoute, (c) =>
  c.json(
    {
      message: "Organization profile route placeholder.",
    },
    501,
  ),
);

organizationsRouter.openapi(currentOrganizationMembersRoute, (c) =>
  c.json(
    {
      message: "Organization members route placeholder.",
    },
    501,
  ),
);
