import type { Context } from "hono";

export interface ErrorResponseBody {
  code: string;
  error: string;
  requestId: string;
}

export class AppError extends Error {
  readonly code: string;
  readonly expose: boolean;
  readonly status: number;

  constructor(
    message: string,
    status = 400,
    options: {
      code?: string;
      expose?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = options.code ?? "APP_ERROR";
    this.expose = options.expose ?? status < 500;
    this.status = status;
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, 500, {
      code: "CONFIGURATION_ERROR",
      expose: false,
    });
    this.name = "ConfigurationError";
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string,
    options: {
      code?: string;
    } = {},
  ) {
    super(message, 409, {
      code: options.code ?? "CONFLICT",
    });
    this.name = "ConflictError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 401, {
      code: "UNAUTHORIZED",
    });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message: string,
    options: {
      code?: string;
    } = {},
  ) {
    super(message, 403, {
      code: options.code ?? "FORBIDDEN",
    });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, {
      code: "NOT_FOUND",
    });
    this.name = "NotFoundError";
  }
}

export function ensureRequestId(context: Context): string {
  const existing = context.get("requestId");
  if (existing) {
    context.header("X-Request-Id", existing);
    return existing;
  }

  const requestId =
    context.req.header("cf-ray") ??
    context.req.header("x-request-id") ??
    crypto.randomUUID();
  context.set("requestId", requestId);
  context.header("X-Request-Id", requestId);
  return requestId;
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    if (error.message.includes("D1_ERROR: no such table:")) {
      return new AppError("Service is temporarily unavailable", 503, {
        code: "DB_SCHEMA_MISSING",
        expose: true,
      });
    }

    if (error.message.includes("D1_ERROR:")) {
      return new AppError("Database request failed", 503, {
        code: "DATABASE_ERROR",
        expose: true,
      });
    }
  }

  return new AppError("Internal Server Error", 500, {
    code: "INTERNAL_SERVER_ERROR",
    expose: true,
  });
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    value: error,
  };
}

export function buildErrorResponseBody(
  context: Context,
  error: unknown,
): ErrorResponseBody {
  const normalized = normalizeError(error);
  const requestId = ensureRequestId(context);

  return {
    code: normalized.code,
    error: normalized.expose ? normalized.message : "Internal Server Error",
    requestId,
  };
}

export function errorResponse(context: Context, error: unknown): Response {
  const normalized = normalizeError(error);
  const body = buildErrorResponseBody(context, error);

  if (!(error instanceof AppError) || normalized.status >= 500) {
    console.error(
      JSON.stringify({
        code: normalized.code,
        error: serializeError(error),
        method: context.req.method,
        path: new URL(context.req.url).pathname,
        requestId: body.requestId,
        status: normalized.status,
      }),
    );
  }

  return context.json(body, normalized.status as never);
}
