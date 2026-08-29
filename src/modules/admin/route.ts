import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppBindings } from "../../types/hono";
import {
  AppError,
  buildErrorResponseBody,
  ConflictError,
  ensureRequestId,
  NotFoundError,
} from "../../lib/errors";
import { getSessionCookie } from "../../lib/session-cookie";
import { ManageUserStatusService } from "../../services/admin/manage-user-status-service";
import { SessionAuthService } from "../../services/auth/session-auth-service";
import { D1Client } from "../../infrastructure/d1/d1-client";
import { OrganizationsRepository } from "../../repositories/organizations-repository";
import { UsersRepository } from "../../repositories/users-repository";
import {
  adminUserDetailRoute,
  approveUserRoute,
  disableUserRoute,
  enableUserRoute,
  listDisabledUsersRoute,
  listPendingUsersRoute,
  updateOrganizationVanityRoute,
  updateUserVanityRoute,
} from "./schema";

export const adminRouter = new OpenAPIHono<AppBindings>();

function isNumericIdentifier(value: string): boolean {
  return /^\d+$/.test(value);
}

async function requireOrganizationByIdentifier(
  organizations: OrganizationsRepository,
  identifier: string,
) {
  const organization = isNumericIdentifier(identifier)
    ? await organizations.findById(Number(identifier))
    : await organizations.findByVanity(identifier);

  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

  return organization;
}

async function requireUserByIdentifier(
  users: UsersRepository,
  identifier: string,
) {
  const user = isNumericIdentifier(identifier)
    ? await users.findById(Number(identifier))
    : await users.findByVanity(identifier);

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return user;
}

function validationErrorFromIssues(
  issues: Array<{ message: string; path: PropertyKey[] }>,
  requestId: string,
) {
  return {
    code: "VALIDATION_ERROR",
    error: "Validation failed",
    issues: issues.map((issue) => {
      const path = issue.path.map(String).join(".") || "params";
      return `${path}: ${issue.message}`;
    }),
    requestId,
  };
}

adminRouter.openapi(listPendingUsersRoute, async (c) => {
  try {
    const sessionAuth = new SessionAuthService(c.env);
    await sessionAuth.requireOfficialAdmin(getSessionCookie(c));

    const service = new ManageUserStatusService(c.env);
    const users = await service.listPendingApprovalUsers();

    return c.json(
      {
        users: users.map((user) => ({
          displayName: user.display_name,
          email: user.email,
          emailVerifiedAt: user.email_verified_at,
          id: user.id,
          status: user.status,
          vanity: user.vanity,
        })),
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403);
    }

    throw error;
  }
});

adminRouter.openapi(listDisabledUsersRoute, async (c) => {
  const parsed = listDisabledUsersRoute.request.query.safeParse(c.req.query());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    await sessionAuth.requireOfficialAdmin(getSessionCookie(c));

    const service = new ManageUserStatusService(c.env);
    const limit = parsed.data.limit ?? 10;
    const offset = parsed.data.offset ?? 0;
    const result = await service.listDisabledUsers({
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      limit,
      offset,
    });

    return c.json(
      {
        pagination: {
          hasMore: result.hasMore,
          limit,
          offset,
        },
        users: result.users.map((user) => ({
          displayName: user.display_name,
          email: user.email,
          emailVerifiedAt: user.email_verified_at,
          id: user.id,
          status: user.status,
          vanity: user.vanity,
        })),
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 403);
    }

    throw error;
  }
});

adminRouter.openapi(adminUserDetailRoute, async (c) => {
  const params = adminUserDetailRoute.request.params.safeParse(c.req.param());

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    await sessionAuth.requireOfficialStaff(getSessionCookie(c));

    const db = new D1Client(c.env.APP_DB);
    const users = new UsersRepository(db);
    const user = await requireUserByIdentifier(users, params.data.user);

    return c.json(
      {
        message: "User detail retrieved successfully.",
        user: {
          displayName: user.display_name,
          email: user.email,
          emailVerifiedAt: user.email_verified_at,
          id: user.id,
          status: user.status,
          vanity: user.vanity,
        },
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

adminRouter.openapi(updateOrganizationVanityRoute, async (c) => {
  const params = updateOrganizationVanityRoute.request.params.safeParse(c.req.param());
  const schema =
    updateOrganizationVanityRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const body = schema.safeParse(payload);

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, ensureRequestId(c)),
      422,
    );
  }

  if (!body.success) {
    return c.json(
      validationErrorFromIssues(body.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    await sessionAuth.requireOfficialStaff(getSessionCookie(c));

    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    const existingVanity = await organizations.findByVanity(body.data.vanity);

    if (existingVanity && existingVanity.id !== organization.id) {
      throw new ConflictError("Organization vanity already exists", {
        code: "ORGANIZATION_VANITY_EXISTS",
      });
    }

    const updated = await organizations.update(organization.id, {
      vanity: body.data.vanity,
    });

    return c.json(
      {
        message: "Organization vanity updated successfully.",
        organization: {
          id: updated.id,
          name: updated.name,
          vanity: updated.vanity,
        },
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
      );
    }

    throw error;
  }
});

adminRouter.openapi(updateUserVanityRoute, async (c) => {
  const params = updateUserVanityRoute.request.params.safeParse(c.req.param());
  const schema =
    updateUserVanityRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const body = schema.safeParse(payload);

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, ensureRequestId(c)),
      422,
    );
  }

  if (!body.success) {
    return c.json(
      validationErrorFromIssues(body.error.issues, ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    await sessionAuth.requireOfficialStaff(getSessionCookie(c));

    const db = new D1Client(c.env.APP_DB);
    const users = new UsersRepository(db);
    const user = await requireUserByIdentifier(users, params.data.user);
    const existingVanity = await users.findByVanity(body.data.vanity);

    if (existingVanity && existingVanity.id !== user.id) {
      throw new ConflictError("User vanity already exists", {
        code: "USER_VANITY_EXISTS",
      });
    }

    const updated = await users.update(user.id, {
      vanity: body.data.vanity,
    });

    return c.json(
      {
        message: "User vanity updated successfully.",
        user: {
          displayName: updated.display_name,
          email: updated.email,
          emailVerifiedAt: updated.email_verified_at,
          id: updated.id,
          status: updated.status,
          vanity: updated.vanity,
        },
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
      );
    }

    throw error;
  }
});

function registerManagedUserAction(
  route: typeof approveUserRoute,
  action: "active" | "disabled",
  message: string,
) {
  adminRouter.openapi(route, async (c) => {
    const parsed = route.request.params.safeParse(c.req.param());

    if (!parsed.success) {
      return c.json(
        validationErrorFromIssues(parsed.error.issues, ensureRequestId(c)),
        422,
      );
    }

    try {
      const sessionAuth = new SessionAuthService(c.env);
      await sessionAuth.requireOfficialAdmin(getSessionCookie(c));

      const service = new ManageUserStatusService(c.env);
      const user = await service.setStatus(parsed.data.id, action);

      return c.json(
        {
          message,
          user: {
            displayName: user.display_name,
            email: user.email,
            emailVerifiedAt: user.email_verified_at,
            id: user.id,
            status: user.status,
            vanity: user.vanity,
          },
        },
        200,
      );
    } catch (error) {
      if (error instanceof AppError) {
        return c.json(
          buildErrorResponseBody(c, error),
          error.status as 400 | 401 | 403 | 404,
        );
      }

      throw error;
    }
  });
}

registerManagedUserAction(
  approveUserRoute,
  "active",
  "User approved successfully.",
);
registerManagedUserAction(
  disableUserRoute,
  "disabled",
  "User disabled successfully.",
);
registerManagedUserAction(
  enableUserRoute,
  "active",
  "User enabled successfully.",
);
