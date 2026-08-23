import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppBindings } from "../../types/hono";
import {
  AppError,
  buildErrorResponseBody,
  ensureRequestId,
} from "../../lib/errors";
import { getSessionCookie } from "../../lib/session-cookie";
import { ManageUserStatusService } from "../../services/admin/manage-user-status-service";
import { SessionAuthService } from "../../services/auth/session-auth-service";
import {
  approveUserRoute,
  disableUserRoute,
  enableUserRoute,
  listPendingUsersRoute,
} from "./schema";

export const adminRouter = new OpenAPIHono<AppBindings>();

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
          email: user.email,
          emailVerifiedAt: user.email_verified_at,
          id: user.id,
          status: user.status,
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
            email: user.email,
            emailVerifiedAt: user.email_verified_at,
            id: user.id,
            status: user.status,
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
