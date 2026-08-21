import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppBindings } from "../../types/hono";
import { AppError } from "../../lib/errors";
import { ForgotPasswordService } from "../../services/auth/forgot-password-service";
import { LoginService } from "../../services/auth/login-service";
import { RegisterService } from "../../services/auth/register-service";
import { ResetPasswordService } from "../../services/auth/reset-password-service";
import { VerifyEmailService } from "../../services/auth/verify-email-service";
import { clearSessionCookie, setSessionCookie } from "../../lib/session-cookie";
import {
  forgotPasswordRoute,
  loginRoute,
  logoutRoute,
  registerRoute,
  resetPasswordRoute,
  verifyEmailRoute,
} from "./schema";

export const authRouter = new OpenAPIHono<AppBindings>();

authRouter.openapi(registerRoute, async (c) => {
  const schema = registerRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return c.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((issue) => {
          const path = issue.path.join(".") || "body";
          return `${path}: ${issue.message}`;
        }),
      },
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
    if (error instanceof AppError) {
      return c.json({ error: error.message }, error.status as 409 | 500);
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
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((issue) => {
          const path = issue.path.join(".") || "body";
          return `${path}: ${issue.message}`;
        }),
      },
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
      return c.json({ error: error.message }, error.status as 401 | 403);
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

authRouter.openapi(verifyEmailRoute, async (c) => {
  const parsed = verifyEmailRoute.request.query.safeParse(c.req.query());

  if (!parsed.success) {
    return c.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((issue) => {
          const path = issue.path.join(".") || "query";
          return `${path}: ${issue.message}`;
        }),
      },
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
      return c.json({ error: error.message }, error.status as 400 | 403 | 404);
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
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((issue) => {
          const path = issue.path.join(".") || "body";
          return `${path}: ${issue.message}`;
        }),
      },
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
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((issue) => {
          const path = issue.path.join(".") || "body";
          return `${path}: ${issue.message}`;
        }),
      },
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
      return c.json({ error: error.message }, error.status as 400 | 403 | 404);
    }

    throw error;
  }
});
