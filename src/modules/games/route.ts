import { OpenAPIHono } from "@hono/zod-openapi";
import { D1Client } from "../../infrastructure/d1/d1-client";
import {
  AppError,
  NotFoundError,
  buildErrorResponseBody,
  ensureRequestId,
} from "../../lib/errors";
import { GamesRepository } from "../../repositories/games-repository";
import type { AppBindings } from "../../types/hono";
import { gameDetailRoute, listGamesRoute, searchGamesRoute } from "./schema";

export const gamesRouter = new OpenAPIHono<AppBindings>();

function validationErrorFromIssues(
  issues: Array<{ message: string; path: PropertyKey[] }>,
  defaultPath: "query" | "params",
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

function resolveGameIconUrl(
  iconUrl: string | null,
  officialSiteUrl: string | null,
): string | null {
  if (iconUrl) {
    return iconUrl;
  }

  if (!officialSiteUrl) {
    return null;
  }

  try {
    return new URL("/favicon.ico", officialSiteUrl).toString();
  } catch {
    return null;
  }
}

function toGameResponse(game: Awaited<ReturnType<GamesRepository["create"]>>) {
  return {
    description: game.description,
    iconUrl: game.icon_url,
    id: game.id,
    isActive: game.is_active === 1,
    metadataSource: game.metadata_source,
    name: game.name,
    officialSiteUrl: game.official_site_url,
    resolvedIconUrl: resolveGameIconUrl(game.icon_url, game.official_site_url),
    slug: game.slug,
    source: game.source,
    sourceId: game.source_id,
    type: game.type,
  };
}

gamesRouter.openapi(listGamesRoute, async (c) => {
  const parsed = listGamesRoute.request.query.safeParse(c.req.query());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "query", ensureRequestId(c)),
      422,
    );
  }

  const db = new D1Client(c.env.APP_DB);
  const games = new GamesRepository(db);
  const records = await games.list();

  return c.json(
    {
      games: records
        .filter((record) => parsed.data.includeInactive || record.is_active === 1)
        .map(toGameResponse),
    },
    200,
  );
});

gamesRouter.openapi(searchGamesRoute, async (c) => {
  const parsed = searchGamesRoute.request.query.safeParse(c.req.query());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "query", ensureRequestId(c)),
      422,
    );
  }

  const db = new D1Client(c.env.APP_DB);
  const games = new GamesRepository(db);
  const limit = parsed.data.limit ?? 10;
  const offset = parsed.data.offset ?? 0;
  const results = await games.searchByName(parsed.data.name, {
    limit: limit + 1,
    offset,
  });
  const hasMore = results.length > limit;
  const visibleRows = hasMore ? results.slice(0, limit) : results;

  return c.json(
    {
      games: visibleRows.map((game) => ({
        iconUrl: game.icon_url,
        id: game.id,
        name: game.name,
        officialSiteUrl: game.official_site_url,
      })),
      pagination: {
        hasMore,
        limit,
        offset,
      },
    },
    200,
  );
});

gamesRouter.openapi(gameDetailRoute, async (c) => {
  const parsed = gameDetailRoute.request.params.safeParse(c.req.param());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const db = new D1Client(c.env.APP_DB);
    const games = new GamesRepository(db);
    const game = await games.findById(parsed.data.gameId);

    if (!game) {
      throw new NotFoundError("Game not found");
    }

    return c.json(
      {
        game: toGameResponse(game),
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 404);
    }

    throw error;
  }
});
