import { OpenAPIHono } from "@hono/zod-openapi";
import { D1Client } from "../../infrastructure/d1/d1-client";
import {
  AppError,
  NotFoundError,
  buildErrorResponseBody,
  ensureRequestId,
} from "../../lib/errors";
import { getSessionCookie } from "../../lib/session-cookie";
import { GamesRepository } from "../../repositories/games-repository";
import { SessionAuthService } from "../../services/auth/session-auth-service";
import type { AppBindings } from "../../types/hono";
import { updateGameMetadataRoute } from "./schema";

export const officialRouter = new OpenAPIHono<AppBindings>();

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

officialRouter.openapi(updateGameMetadataRoute, async (c) => {
  const params = updateGameMetadataRoute.request.params.safeParse(c.req.param());
  const schema =
    updateGameMetadataRoute.request.body.content["application/json"].schema;
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
    const games = new GamesRepository(db);
    const game = await games.findById(params.data.gameId);

    if (!game) {
      throw new NotFoundError("Game not found");
    }

    const updated = await games.update(game.id, {
      iconUrl: body.data.iconUrl,
      metadataSource: "official",
      officialSiteUrl: body.data.officialSiteUrl,
    });

    return c.json(
      {
        game: {
          iconUrl: updated.icon_url,
          id: updated.id,
          metadataSource: updated.metadata_source,
          name: updated.name,
          officialSiteUrl: updated.official_site_url,
        },
        message: "Game metadata updated successfully.",
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
