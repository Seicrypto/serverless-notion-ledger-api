import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppBindings } from "../../types/hono";
import {
  AppError,
  buildErrorResponseBody,
  ensureRequestId,
} from "../../lib/errors";
import { D1Client } from "../../infrastructure/d1/d1-client";
import { ForgotPasswordService } from "../../services/auth/forgot-password-service";
import { LoginService } from "../../services/auth/login-service";
import {
  RegistrationConflictError,
  RegisterService,
} from "../../services/auth/register-service";
import { ResendEmailVerificationService } from "../../services/auth/resend-email-verification-service";
import { ResetPasswordService } from "../../services/auth/reset-password-service";
import { SessionAuthService } from "../../services/auth/session-auth-service";
import { UpdateDisplayNameService } from "../../services/auth/update-display-name-service";
import { VerifyEmailService } from "../../services/auth/verify-email-service";
import { UsersRepository } from "../../repositories/users-repository";
import {
  clearSessionCookie,
  getSessionCookie,
  setSessionCookie,
} from "../../lib/session-cookie";
import {
  authMeRoute,
  authUserDetailRoute,
  forgotPasswordRoute,
  loginRoute,
  logoutRoute,
  registerRoute,
  resendVerificationEmailRoute,
  resetPasswordRoute,
  updateDisplayNameRoute,
  verifyEmailRoute,
} from "./schema";

export const authRouter = new OpenAPIHono<AppBindings>();

function isNumericIdentifier(value: string): boolean {
  return /^\d+$/.test(value);
}

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

authRouter.openapi(registerRoute, async (c) => {
  const schema = registerRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "body", ensureRequestId(c)),
      422,
    );
  }

  try {
    const service = new RegisterService(c.env);
    const result = await service.execute(parsed.data);

    return c.json(
      {
        ...result,
        message: result.requiresEmailVerification
          ? "Registration created. Please verify your email."
          : "Registration approved as official staff.",
      },
      201,
    );
  } catch (error) {
    if (error instanceof RegistrationConflictError) {
      return c.json(
        {
          canResendVerification: error.registration.canResendVerification,
          code: error.code,
          email: error.registration.email,
          error: error.message,
          requestId: ensureRequestId(c),
          requiresEmailVerification: error.registration.requiresEmailVerification,
          status: error.registration.status,
        },
        409,
      );
    }

    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 500);
    }

    throw error;
  }
});

authRouter.openapi(loginRoute, async (c) => {
  const schema = loginRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "body", ensureRequestId(c)),
      422,
    );
  }

  try {
    const service = new LoginService(c.env);
    const result = await service.execute(parsed.data);

    setSessionCookie(c, result.token, c.env.APP_ENV === "production");

    return c.json(
      {
        email: result.email,
        message: "Login successful.",
        userId: result.userId,
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

authRouter.openapi(logoutRoute, async (c) => {
  clearSessionCookie(c);

  return c.json(
    {
      message: "Logout successful.",
    },
    200,
  );
});

authRouter.openapi(authMeRoute, async (c) => {
  try {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));

    return c.json(
      {
        user: {
          displayName: session.user.display_name,
          email: session.user.email,
          emailVerifiedAt: session.user.email_verified_at,
          id: session.user.id,
          isStaff: session.staff !== null,
          staffRole: session.staff?.role ?? null,
          status: session.user.status,
          vanity: session.user.vanity,
        },
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

authRouter.openapi(authUserDetailRoute, async (c) => {
  const parsed = authUserDetailRoute.request.params.safeParse(c.req.param());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    await sessionAuth.requireActiveUser(getSessionCookie(c));

    const db = new D1Client(c.env.APP_DB);
    const usersRepository = new UsersRepository(db);
    const user = isNumericIdentifier(parsed.data.user)
      ? await usersRepository.findById(Number(parsed.data.user))
      : await usersRepository.findByVanity(parsed.data.user);

    if (!user) {
      throw new AppError("User not found", 404, {
        code: "USER_NOT_FOUND",
      });
    }

    return c.json(
      {
        user: {
          createdAt: user.created_at,
          displayName: user.display_name,
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

authRouter.openapi(updateDisplayNameRoute, async (c) => {
  const schema = updateDisplayNameRoute.request.body.content["application/json"].schema;
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
    const service = new UpdateDisplayNameService(c.env);
    const result = await service.execute({
      displayName: parsed.data.displayName,
      userId: session.user.id,
    });

    return c.json(
      {
        email: result.email,
        message: "Display name updated successfully.",
        user: {
          displayName: result.displayName,
          id: result.userId,
        },
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

authRouter.openapi(verifyEmailRoute, async (c) => {
  const parsed = verifyEmailRoute.request.query.safeParse(c.req.query());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "query", ensureRequestId(c)),
      422,
    );
  }

  try {
    const service = new VerifyEmailService(c.env);
    const result = await service.execute(parsed.data);

    return c.json(
      {
        ...result,
        message:
          result.status === "active"
            ? "Email verified. Your account is active."
            : "Email verified. Your account is pending approval.",
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 400 | 403 | 404,
      );
    }

    throw error;
  }
});

authRouter.openapi(resendVerificationEmailRoute, async (c) => {
  const schema =
    resendVerificationEmailRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "body", ensureRequestId(c)),
      422,
    );
  }

  try {
    const service = new ResendEmailVerificationService(c.env);
    const result = await service.execute(parsed.data);

    return c.json(
      {
        email: result.email,
        message: result.resent
          ? "A new verification email has been sent."
          : "If the email belongs to a pending verification account, a new verification email has been sent.",
        resent: result.resent,
        status: result.status,
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 429 | 500);
    }

    throw error;
  }
});

authRouter.openapi(forgotPasswordRoute, async (c) => {
  const schema = forgotPasswordRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "body", ensureRequestId(c)),
      422,
    );
  }

  const service = new ForgotPasswordService(c.env);
  await service.execute(parsed.data);

  return c.json(
    {
      message:
        "If the email belongs to an active account, a password reset link has been sent.",
    },
    200,
  );
});

authRouter.openapi(resetPasswordRoute, async (c) => {
  const schema = resetPasswordRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "body", ensureRequestId(c)),
      422,
    );
  }

  try {
    const service = new ResetPasswordService(c.env);
    const result = await service.execute(parsed.data);

    return c.json(
      {
        ...result,
        message: "Password reset successfully.",
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 400 | 403 | 404,
      );
    }

    throw error;
  }
});
