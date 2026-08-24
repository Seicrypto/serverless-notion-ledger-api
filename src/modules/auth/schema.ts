import { createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import {
  errorSchema,
  messageSchema,
  validationErrorSchema,
} from "../../lib/openapi";

const registerRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(50).optional(),
    email: z.string().trim().email(),
    password: z.string().min(8).max(128),
  })
  .openapi("RegisterRequest");

const registerResponseSchema = z
  .object({
    email: z.string().email(),
    message: z.string(),
    requiresEmailVerification: z.boolean(),
    status: z.enum([
      "pending_verification",
      "pending_approval",
      "active",
      "disabled",
    ]),
    userId: z.number().int().positive(),
  })
  .openapi("RegisterResponse");

const verifyEmailQuerySchema = z
  .object({
    key: z.string().min(1),
    token: z.string().min(1),
  })
  .openapi("VerifyEmailQuery");

const verifyEmailResponseSchema = z
  .object({
    email: z.string().email(),
    message: z.string(),
    status: z.enum(["pending_approval", "active"]),
    userId: z.number().int().positive(),
  })
  .openapi("VerifyEmailResponse");

const forgotPasswordRequestSchema = z
  .object({
    email: z.string().trim().email(),
  })
  .openapi("ForgotPasswordRequest");

const resendVerificationEmailRequestSchema = z
  .object({
    email: z.string().trim().email(),
  })
  .openapi("ResendVerificationEmailRequest");

const resendVerificationEmailResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("ResendVerificationEmailResponse");

const forgotPasswordResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("ForgotPasswordResponse");

const resetPasswordRequestSchema = z
  .object({
    key: z.string().min(1),
    password: z.string().min(8).max(128),
    token: z.string().min(1),
  })
  .openapi("ResetPasswordRequest");

const resetPasswordResponseSchema = z
  .object({
    email: z.string().email(),
    message: z.string(),
    userId: z.number().int().positive(),
  })
  .openapi("ResetPasswordResponse");

const loginRequestSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(128),
  })
  .openapi("LoginRequest");

const loginResponseSchema = z
  .object({
    email: z.string().email(),
    message: z.string(),
    userId: z.number().int().positive(),
  })
  .openapi("LoginResponse");

const logoutResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("LogoutResponse");

const authMeResponseSchema = z
  .object({
    user: z.object({
      displayName: z.string().nullable(),
      email: z.string().email(),
      emailVerifiedAt: z.string().nullable(),
      id: z.number().int().positive(),
      isStaff: z.boolean(),
      staffRole: z.enum(["admin", "staff"]).nullable(),
      status: z.enum([
        "pending_verification",
        "pending_approval",
        "active",
        "disabled",
      ]),
      vanity: z.string().nullable(),
    }),
  })
  .openapi("AuthMeResponse");

const updateDisplayNameRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(50),
  })
  .openapi("UpdateDisplayNameRequest");

const updateDisplayNameResponseSchema = z
  .object({
    email: z.string().email(),
    message: z.string(),
    user: z.object({
      displayName: z.string(),
      id: z.number().int().positive(),
    }),
  })
  .openapi("UpdateDisplayNameResponse");

export const registerRoute = createRoute({
  method: "post",
  path: "/register",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: registerRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: registerResponseSchema,
        },
      },
      description: "User registered successfully.",
    },
    409: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Email already exists.",
    },
    422: {
      content: {
        "application/json": {
          schema: validationErrorSchema,
        },
      },
      description: "Validation failed.",
    },
    500: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Registration failed.",
    },
  },
});

export const loginRoute = createRoute({
  method: "post",
  path: "/login",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: loginRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: loginResponseSchema,
        },
      },
      description: "Login succeeded.",
    },
    401: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Invalid credentials.",
    },
    403: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Account is not allowed to log in.",
    },
    422: {
      content: {
        "application/json": {
          schema: validationErrorSchema,
        },
      },
      description: "Validation failed.",
    },
  },
});

export const logoutRoute = createRoute({
  method: "post",
  path: "/logout",
  tags: ["Auth"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: logoutResponseSchema,
        },
      },
      description: "Logout succeeded.",
    },
  },
});

export const authMeRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Auth"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: authMeResponseSchema,
        },
      },
      description: "Current authenticated user.",
    },
    401: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Authentication required.",
    },
    403: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Authenticated account is not active.",
    },
  },
});

export const updateDisplayNameRoute = createRoute({
  method: "patch",
  path: "/me",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: updateDisplayNameRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: updateDisplayNameResponseSchema,
        },
      },
      description: "Display name updated successfully.",
    },
    401: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Authentication required.",
    },
    403: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Authenticated account is not active.",
    },
    422: {
      content: {
        "application/json": {
          schema: validationErrorSchema,
        },
      },
      description: "Validation failed.",
    },
  },
});

export const verifyEmailRoute = createRoute({
  method: "get",
  path: "/verify-email",
  tags: ["Auth"],
  request: {
    query: verifyEmailQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: verifyEmailResponseSchema,
        },
      },
      description: "Email verified successfully.",
    },
    400: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Verification token is invalid or expired.",
    },
    403: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "User cannot verify email.",
    },
    404: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "User not found.",
    },
    422: {
      content: {
        "application/json": {
          schema: validationErrorSchema,
        },
      },
      description: "Validation failed.",
    },
  },
});

export const resendVerificationEmailRoute = createRoute({
  method: "post",
  path: "/resend-verification-email",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: resendVerificationEmailRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: resendVerificationEmailResponseSchema,
        },
      },
      description: "Verification email resend flow accepted.",
    },
    422: {
      content: {
        "application/json": {
          schema: validationErrorSchema,
        },
      },
      description: "Validation failed.",
    },
    500: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Resend verification email failed.",
    },
  },
});

export const forgotPasswordRoute = createRoute({
  method: "post",
  path: "/forgot-password",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: forgotPasswordRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: forgotPasswordResponseSchema,
        },
      },
      description: "Password reset flow accepted.",
    },
    422: {
      content: {
        "application/json": {
          schema: validationErrorSchema,
        },
      },
      description: "Validation failed.",
    },
  },
});

export const resetPasswordRoute = createRoute({
  method: "post",
  path: "/reset-password",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: resetPasswordRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: resetPasswordResponseSchema,
        },
      },
      description: "Password updated successfully.",
    },
    400: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "Reset token is invalid or expired.",
    },
    403: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "User cannot reset password.",
    },
    404: {
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
      description: "User not found.",
    },
    422: {
      content: {
        "application/json": {
          schema: validationErrorSchema,
        },
      },
      description: "Validation failed.",
    },
  },
});
