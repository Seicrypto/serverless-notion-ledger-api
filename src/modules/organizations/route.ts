import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { D1Client } from "../../infrastructure/d1/d1-client";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  buildErrorResponseBody,
  ensureRequestId,
} from "../../lib/errors";
import { getSessionCookie } from "../../lib/session-cookie";
import {
  generateInitialCharacterVanity,
  generateInitialOrganizationVanity,
} from "../../lib/vanity";
import { CharactersRepository } from "../../repositories/characters-repository";
import { GamesRepository } from "../../repositories/games-repository";
import { OrganizationMemberPendingActionsRepository } from "../../repositories/organization-member-pending-actions-repository";
import { SessionAuthService } from "../../services/auth/session-auth-service";
import { OrganizationMembersRepository } from "../../repositories/organization-members-repository";
import { OrganizationsRepository } from "../../repositories/organizations-repository";
import { UsersRepository } from "../../repositories/users-repository";
import type { AppBindings } from "../../types/hono";
import {
  requireTargetOrganizationManager,
  requireTargetOrganizationOwner,
} from "./middleware";
import {
  addOrganizationMemberRoute,
  acceptOrganizationInviteRoute,
  applyOrganizationMemberRoute,
  appointOrganizationAdminRoute,
  approveOrganizationMemberRoute,
  createOrganizationRoute,
  createOrganizationCharacterRoute,
  currentOrganizationMembersRoute,
  currentOrganizationRoute,
  deleteOrganizationRoute,
  declineOrganizationInviteRoute,
  inviteOrganizationMemberRoute,
  listGamesRoute,
  listOrganizationsRoute,
  myOrganizationsRoute,
  organizationActiveMembersRoute,
  organizationAvailableCharactersRoute,
  organizationCharactersRoute,
  organizationDetailRoute,
  organizationManagementCharactersRoute,
  organizationMembersRoute,
  organizationPendingMembersRoute,
  removeOrganizationAdminRoute,
  rejectOrganizationMemberRoute,
  updateOrganizationRoute,
} from "./schema";

export const organizationsRouter = new OpenAPIHono<AppBindings>();

organizationsRouter.use(
  "/:organization/management/*",
  requireTargetOrganizationManager,
);
organizationsRouter.use(
  "/:organization/members/invite",
  requireTargetOrganizationManager,
);
organizationsRouter.use(
  "/:organization/members/:memberId/approve",
  requireTargetOrganizationManager,
);
organizationsRouter.use(
  "/:organization/members/:memberId/reject",
  requireTargetOrganizationManager,
);
organizationsRouter.use(
  "/:organization/members/:memberId/appoint-admin",
  requireTargetOrganizationOwner,
);
organizationsRouter.use(
  "/:organization/members/:memberId/remove-admin",
  requireTargetOrganizationOwner,
);

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

function mapCharacterConflict(error: unknown): AppError | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (!error.message.includes("UNIQUE constraint failed:")) {
    return null;
  }

  if (error.message.includes("characters.organization_id, characters.name")) {
    return new AppError("Character name already exists in this organization", 409, {
      code: "CHARACTER_NAME_EXISTS",
    });
  }

  if (error.message.includes("characters.organization_id, characters.slug")) {
    return new AppError("Character slug already exists in this organization", 409, {
      code: "CHARACTER_SLUG_EXISTS",
    });
  }

  if (error.message.includes("characters.vanity")) {
    return new AppError("Character vanity already exists", 409, {
      code: "CHARACTER_VANITY_EXISTS",
    });
  }

  return null;
}

function toOrganizationResponse(
  organization:
    | Awaited<ReturnType<OrganizationsRepository["create"]>>
    | Awaited<ReturnType<OrganizationsRepository["update"]>>,
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

function toGameResponse(game: Awaited<ReturnType<GamesRepository["create"]>>) {
  return {
    description: game.description,
    iconUrl: game.icon_url,
    id: game.id,
    isActive: game.is_active === 1,
    name: game.name,
    slug: game.slug,
    source: game.source,
    sourceId: game.source_id,
    type: game.type,
  };
}

function toCharacterResponse(
  character:
    | Awaited<ReturnType<CharactersRepository["create"]>>
    | Awaited<ReturnType<CharactersRepository["update"]>>,
) {
  return {
    claimedByUserId: character.claimed_by_user_id,
    createdAt: character.created_at,
    gameId: character.game_id,
    id: character.id,
    isActive: character.is_active === 1,
    name: character.name,
    notes: character.notes,
    organizationId: character.organization_id,
    slug: character.slug,
    updatedAt: character.updated_at,
    vanity: character.vanity,
  };
}

function toOrganizationMemberResponse(
  member:
    | Awaited<ReturnType<OrganizationMembersRepository["create"]>>
    | Awaited<ReturnType<OrganizationMembersRepository["updateRole"]>>
    | Awaited<ReturnType<OrganizationMembersRepository["updateStatus"]>>,
) {
  return {
    approvedAt: member.approved_at,
    createdAt: member.created_at,
    id: member.id,
    joinedAt: member.joined_at,
    organizationId: member.organization_id,
    role: member.role,
    status: member.status,
    userId: member.user_id,
  };
}

function toOrganizationWorkflowMemberResponse(
  member:
    | Awaited<ReturnType<OrganizationMembersRepository["create"]>>
    | Awaited<ReturnType<OrganizationMembersRepository["createOrReactivate"]>>
    | Awaited<ReturnType<OrganizationMembersRepository["updateStatus"]>>,
): {
  approvedAt: string | null;
  createdAt: string;
  id: number;
  joinedAt: string;
  organizationId: number;
  role: "owner" | "admin" | "member";
  status: "active" | "pending";
  userId: number;
} {
  return {
    approvedAt: member.approved_at,
    createdAt: member.created_at,
    id: member.id,
    joinedAt: member.joined_at,
    organizationId: member.organization_id,
    role: member.role,
    status: member.status === "active" ? "active" : "pending",
    userId: member.user_id,
  };
}

function getRouteOrganization(c: Context<AppBindings>) {
  const organization = c.get("organization");

  if (!organization) {
    throw new Error("Organization middleware context is missing");
  }

  return organization;
}

function getRouteSession(c: Context<AppBindings>) {
  const session = c.get("session");

  if (!session) {
    throw new Error("Session middleware context is missing");
  }

  return session;
}

function isNumericIdentifier(value: string): boolean {
  return /^\d+$/.test(value);
}

async function reserveInitialVanity(
  organizations: OrganizationsRepository,
  organizationName?: string | null,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const vanity = generateInitialOrganizationVanity(organizationName);
    const existing = await organizations.findByVanity(vanity);

    if (!existing) {
      return vanity;
    }
  }

  throw new AppError("Failed to allocate organization vanity", 503, {
    code: "ORGANIZATION_VANITY_ALLOCATION_FAILED",
  });
}

async function reserveCharacterVanity(
  characters: CharactersRepository,
  characterName?: string | null,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const vanity = generateInitialCharacterVanity(characterName);
    const existing = await characters.findByVanity(vanity);

    if (!existing) {
      return vanity;
    }
  }

  throw new AppError("Failed to allocate character vanity", 503, {
    code: "CHARACTER_VANITY_ALLOCATION_FAILED",
  });
}

async function requireOrganizationById(
  organizations: OrganizationsRepository,
  organizationId: number,
) {
  const organization = await organizations.findById(organizationId);

  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

  return organization;
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
  input: {
    userId?: number;
    userVanity?: string;
  },
) {
  const user =
    input.userId !== undefined
      ? await users.findById(input.userId)
      : await users.findByVanity(input.userVanity!);

  if (!user) {
    throw new NotFoundError("Target user not found");
  }

  return user;
}

async function requireOrganizationManager(
  members: OrganizationMembersRepository,
  organizationId: number,
  userId: number,
) {
  const membership = await members.findByOrganizationAndUser(organizationId, userId);

  if (!membership || membership.status !== "active") {
    throw new ForbiddenError("Organization manager access is required", {
      code: "ORGANIZATION_MANAGER_REQUIRED",
    });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new ForbiddenError("Organization manager access is required", {
      code: "ORGANIZATION_MANAGER_REQUIRED",
    });
  }

  return membership;
}

async function requireAvailableCharacter(
  characters: CharactersRepository,
  pendingActions: OrganizationMemberPendingActionsRepository,
  organizationId: number,
  characterId: number,
) {
  const character = await characters.findById(characterId);

  if (!character || character.organization_id !== organizationId) {
    throw new NotFoundError("Character not found");
  }

  if (character.claimed_by_user_id !== null) {
    throw new ConflictError("Character is already claimed", {
      code: "CHARACTER_ALREADY_CLAIMED",
    });
  }

  if (character.deleted_at !== null || character.is_active !== 1) {
    throw new ConflictError("Character is not available for assignment", {
      code: "CHARACTER_NOT_AVAILABLE",
    });
  }

  const pendingReservation = await pendingActions.findByCharacterId(character.id);
  if (pendingReservation) {
    throw new ConflictError("Character is reserved by a pending membership", {
      code: "CHARACTER_PENDING_RESERVED",
    });
  }

  return character;
}

function pendingActionExpiresAt(days = 30): string {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt.toISOString();
}

async function createPendingCharacterFromDraft(
  characters: CharactersRepository,
  organizationId: number,
  draft: {
    gameId: number;
    name: string;
    notes?: string | null;
    slug?: string | null;
  },
) {
  return characters.create({
    gameId: draft.gameId,
    name: draft.name,
    notes: draft.notes ?? null,
    organizationId,
    slug: draft.slug ?? null,
    vanity: await reserveCharacterVanity(characters, draft.name),
  });
}

async function buildOrganizationSearchItems(
  db: D1Client,
  organizations: Array<Awaited<ReturnType<OrganizationsRepository["create"]>>>,
) {
  if (organizations.length === 0) {
    return [];
  }

  const organizationIds = organizations.map((organization) => organization.id);
  const placeholders = organizationIds.map(() => "?").join(", ");

  const games = await db.all<{
    display_name: string | null;
    game_id: number;
    game_name: string;
    game_slug: string;
    is_primary: number;
    organization_id: number;
    source: "internal" | "steam";
    source_id: string | null;
    type: "game" | "activity";
  }>(
    `SELECT
       og.organization_id,
       og.game_id,
       og.display_name,
       og.is_primary,
       g.name AS game_name,
       g.slug AS game_slug,
       g.source,
       g.source_id,
       g.type
     FROM organization_games og
     INNER JOIN games g ON g.id = og.game_id
     WHERE og.organization_id IN (${placeholders})
     ORDER BY og.sort_order ASC, og.id ASC`,
    ...organizationIds,
  );

  const memberCounts = await db.all<{
    active_member_count: number;
    organization_id: number;
  }>(
    `SELECT organization_id, COUNT(*) AS active_member_count
     FROM organization_members
     WHERE organization_id IN (${placeholders}) AND status = 'active'
     GROUP BY organization_id`,
    ...organizationIds,
  );

  const characterCounts = await db.all<{
    active_character_count: number;
    organization_id: number;
  }>(
    `SELECT organization_id, COUNT(*) AS active_character_count
     FROM characters
     WHERE organization_id IN (${placeholders})
       AND deleted_at IS NULL
       AND is_active = 1
     GROUP BY organization_id`,
    ...organizationIds,
  );

  const gamesByOrganization = new Map<number, typeof games>();
  for (const game of games) {
    const existing = gamesByOrganization.get(game.organization_id) ?? [];
    existing.push(game);
    gamesByOrganization.set(game.organization_id, existing);
  }

  const memberCountByOrganization = new Map(
    memberCounts.map((row) => [row.organization_id, row.active_member_count]),
  );
  const characterCountByOrganization = new Map(
    characterCounts.map((row) => [row.organization_id, row.active_character_count]),
  );

  return organizations.map((organization) => ({
    ...toOrganizationResponse(organization),
    activeCharacterCount: characterCountByOrganization.get(organization.id) ?? 0,
    activeMemberCount: memberCountByOrganization.get(organization.id) ?? 0,
    games: (gamesByOrganization.get(organization.id) ?? []).map((game) => ({
      displayName: game.display_name,
      gameId: game.game_id,
      gameName: game.game_name,
      gameSlug: game.game_slug,
      isPrimary: game.is_primary === 1,
      source: game.source,
      sourceId: game.source_id,
      type: game.type,
    })),
  }));
}

const ORGANIZATION_CARD_MAX_VISIBLE_GAMES = 3;
const ORGANIZATION_CARD_MAX_VISIBLE_TAGS = 3;

function toOrganizationCard(
  organization: Awaited<ReturnType<typeof buildOrganizationSearchItems>>[number],
  membership: {
    role: "owner" | "admin" | "member" | null;
    status: "pending" | "active" | null;
  } | null,
) {
  return {
    description: organization.description,
    display: {
      isSupportedOrg: true,
      maxVisibleGames: ORGANIZATION_CARD_MAX_VISIBLE_GAMES,
      maxVisibleTags: ORGANIZATION_CARD_MAX_VISIBLE_TAGS,
    },
    games: organization.games.map((game) => ({
      iconUrl: null,
      name: game.displayName ?? game.gameName,
      primary: game.isPrimary,
    })),
    iconUrl: organization.iconUrl,
    id: organization.id,
    membership,
    name: organization.name,
    slug: organization.slug,
    stats: {
      characterCount: organization.activeCharacterCount,
      memberCount: organization.activeMemberCount,
    },
    tags: [],
  };
}

organizationsRouter.openapi(listGamesRoute, async (c) => {
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

organizationsRouter.openapi(listOrganizationsRoute, async (c) => {
  const parsed = listOrganizationsRoute.request.query.safeParse(c.req.query());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "query", ensureRequestId(c)),
      422,
    );
  }

  const db = new D1Client(c.env.APP_DB);
  const bindings: unknown[] = [];
  const whereClauses: string[] = [];

  if (parsed.data.q) {
    whereClauses.push(
      `(o.name LIKE ? OR o.slug LIKE ? OR o.vanity LIKE ? OR g.name LIKE ? OR g.slug LIKE ?)`,
    );
    const pattern = `%${parsed.data.q}%`;
    bindings.push(pattern, pattern, pattern, pattern, pattern);
  }

  if (parsed.data.gameId) {
    whereClauses.push(`og.game_id = ?`);
    bindings.push(parsed.data.gameId);
  }

  if (parsed.data.gameSlug) {
    whereClauses.push(`g.slug = ?`);
    bindings.push(parsed.data.gameSlug);
  }

  const limit = parsed.data.limit ?? 10;
  const offset = parsed.data.offset ?? 0;
  bindings.push(limit + 1, offset);

  const rows = await db.all<{
    created_at: string;
    created_by_user_id: number;
    description: string | null;
    icon_url: string | null;
    id: number;
    name: string;
    slug: string;
    updated_at: string;
    vanity: string | null;
  }>(
    `SELECT DISTINCT
       o.*
     FROM organizations o
     LEFT JOIN organization_games og ON og.organization_id = o.id
     LEFT JOIN games g ON g.id = og.game_id
     ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ""}
     ORDER BY o.id ASC
     LIMIT ?
     OFFSET ?`,
    ...bindings,
  );

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const organizations = await buildOrganizationSearchItems(db, pageRows);

  return c.json(
    {
      organizations: organizations.map((organization) =>
        toOrganizationCard(organization, null),
      ),
      pagination: {
        hasMore,
        limit,
        offset,
      },
    },
    200,
  );
});

organizationsRouter.openapi(myOrganizationsRoute, async (c) => {
  const parsed = myOrganizationsRoute.request.query.safeParse(c.req.query());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "query", ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const limit = parsed.data.limit ?? 10;
    const offset = parsed.data.offset ?? 0;

    const rows = await db.all<{
      approved_at: string | null;
      created_at: string;
      created_by_user_id: number;
      description: string | null;
      icon_url: string | null;
      id: number;
      joined_at: string;
      membership_role: "owner" | "admin" | "member";
      membership_status: "pending" | "active";
      name: string;
      slug: string;
      updated_at: string;
      vanity: string | null;
    }>(
      `SELECT
         o.*,
         m.role AS membership_role,
         m.status AS membership_status,
         m.joined_at,
         m.approved_at
       FROM organization_members m
       INNER JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = ?
         AND m.status IN ('pending', 'active')
       ORDER BY o.id ASC`,
      session.user.id,
    );

    const pagedRows = rows.slice(offset, offset + limit + 1);
    const hasMore = pagedRows.length > limit;
    const visibleRows = hasMore ? pagedRows.slice(0, limit) : pagedRows;

    const organizations = await buildOrganizationSearchItems(
      db,
      visibleRows.map((row) => ({
        created_at: row.created_at,
        created_by_user_id: row.created_by_user_id,
        description: row.description,
        icon_url: row.icon_url,
        id: row.id,
        name: row.name,
        slug: row.slug,
        updated_at: row.updated_at,
        vanity: row.vanity,
      })),
    );

    const membershipById = new Map(
      visibleRows.map((row) => [
        row.id,
        {
          role: row.membership_role,
          status: row.membership_status,
        },
      ]),
    );

    return c.json(
      {
        organizations: organizations.map((organization) =>
          toOrganizationCard(organization, membershipById.get(organization.id) ?? null),
        ),
        pagination: {
          hasMore,
          limit,
          offset,
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

organizationsRouter.openapi(organizationDetailRoute, async (c) => {
  const parsed = organizationDetailRoute.request.params.safeParse(c.req.param());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      parsed.data.organization,
    );
    const [detail] = await buildOrganizationSearchItems(db, [organization]);

    return c.json({ organization: detail }, 200);
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 404);
    }
    throw error;
  }
});

organizationsRouter.openapi(organizationCharactersRoute, async (c) => {
  const parsed = organizationCharactersRoute.request.params.safeParse(c.req.param());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const characters = new CharactersRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      parsed.data.organization,
    );

    return c.json(
      {
        characters: (await characters.listByOrganization(organization.id)).map(
          toCharacterResponse,
        ),
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

organizationsRouter.openapi(organizationMembersRoute, async (c) => {
  const parsed = organizationMembersRoute.request.params.safeParse(c.req.param());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      parsed.data.organization,
    );

    return c.json(
      {
        members: (await members.listByOrganization(organization.id, "active")).map(
          toOrganizationWorkflowMemberResponse,
        ),
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

organizationsRouter.openapi(organizationManagementCharactersRoute, async (c) => {
  const parsed = organizationManagementCharactersRoute.request.params.safeParse(
    c.req.param(),
  );

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const db = new D1Client(c.env.APP_DB);
    const organization = getRouteOrganization(c);

    const characters = await db.all<{
      claimed_by_user_id: number | null;
      claimed_display_name: string | null;
      claimed_vanity: string | null;
      id: number;
      name: string;
      notes: string | null;
      slug: string | null;
      vanity: string | null;
    }>(
      `SELECT
         c.id,
         c.name,
         c.slug,
         c.vanity,
         c.notes,
         c.claimed_by_user_id,
         u.display_name AS claimed_display_name,
         u.vanity AS claimed_vanity
       FROM characters c
       LEFT JOIN users u ON u.id = c.claimed_by_user_id
       WHERE c.organization_id = ?
         AND c.deleted_at IS NULL
       ORDER BY c.id ASC`,
      organization.id,
    );

    return c.json(
      {
        characters: characters.map((character) => ({
          claimedBy:
            character.claimed_by_user_id === null
              ? null
              : {
                  displayName: character.claimed_display_name,
                  userId: character.claimed_by_user_id,
                  vanity: character.claimed_vanity,
                },
          description: character.notes,
          displayName: character.name,
          id: character.id,
          isClaimed: character.claimed_by_user_id !== null,
          slug: character.slug,
          vanity: character.vanity,
        })),
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

organizationsRouter.openapi(organizationActiveMembersRoute, async (c) => {
  const parsed = organizationActiveMembersRoute.request.params.safeParse(
    c.req.param(),
  );

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const db = new D1Client(c.env.APP_DB);
    const organization = getRouteOrganization(c);

    const activeMembers = await db.all<{
      display_name: string | null;
      member_id: number;
      role: "owner" | "admin" | "member";
      user_id: number;
      vanity: string | null;
    }>(
      `SELECT
         m.id AS member_id,
         m.user_id,
         m.role,
         u.display_name,
         u.vanity
       FROM organization_members m
       INNER JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ?
         AND m.status = 'active'
       ORDER BY m.id ASC`,
      organization.id,
    );

    return c.json(
      {
        members: activeMembers.map((member) => ({
          displayName: member.display_name,
          memberId: member.member_id,
          role: member.role,
          userId: member.user_id,
          vanity: member.vanity,
        })),
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

organizationsRouter.openapi(organizationPendingMembersRoute, async (c) => {
  const parsed = organizationPendingMembersRoute.request.params.safeParse(
    c.req.param(),
  );

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const db = new D1Client(c.env.APP_DB);
    const organization = getRouteOrganization(c);

    const pendingMembers = await db.all<{
      character_id: number | null;
      character_name: string | null;
      character_notes: string | null;
      character_slug: string | null;
      character_vanity: string | null;
      display_name: string | null;
      invited_by_user_id: number | null;
      kind: "apply" | "invite";
      member_id: number;
      role: "owner" | "admin" | "member";
      status: "pending";
      user_id: number;
      user_vanity: string | null;
    }>(
      `SELECT
         m.id AS member_id,
         m.user_id,
         m.role,
         m.status,
         u.display_name,
         u.vanity AS user_vanity,
         p.kind,
         p.invited_by_user_id,
         c.id AS character_id,
         c.name AS character_name,
         c.slug AS character_slug,
         c.vanity AS character_vanity,
         c.notes AS character_notes
       FROM organization_members m
       INNER JOIN users u ON u.id = m.user_id
       INNER JOIN organization_member_pending_actions p ON p.member_id = m.id
       LEFT JOIN characters c ON c.id = p.character_id
       WHERE m.organization_id = ?
         AND m.status = 'pending'
       ORDER BY m.id ASC`,
      organization.id,
    );

    return c.json(
      {
        members: pendingMembers.map((member) => ({
          displayName: member.display_name,
          invitedByUserId: member.invited_by_user_id,
          memberId: member.member_id,
          pendingCharacter:
            member.character_name === null
              ? null
              : {
                  characterId: member.character_id,
                  description: member.character_notes,
                  name: member.character_name,
                  slug: member.character_slug,
                  vanity: member.character_vanity,
                },
          pendingKind: member.kind,
          role: member.role,
          status: member.status,
          userId: member.user_id,
          userVanity: member.user_vanity,
        })),
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

organizationsRouter.openapi(organizationAvailableCharactersRoute, async (c) => {
  const parsed = organizationAvailableCharactersRoute.request.params.safeParse(
    c.req.param(),
  );

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
    const organizations = new OrganizationsRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      parsed.data.organization,
    );

    const characters = await db.all<{
      id: number;
      name: string;
      notes: string | null;
      slug: string | null;
      vanity: string | null;
    }>(
      `SELECT
         c.id,
         c.name,
         c.slug,
         c.vanity,
         c.notes
       FROM characters c
       LEFT JOIN organization_member_pending_actions p ON p.character_id = c.id
       WHERE c.organization_id = ?
         AND c.deleted_at IS NULL
         AND c.is_active = 1
         AND c.claimed_by_user_id IS NULL
         AND p.id IS NULL
       ORDER BY c.id ASC`,
      organization.id,
    );

    return c.json(
      {
        characters: characters.map((character) => ({
          characterId: character.id,
          description: character.notes,
          name: character.name,
          slug: character.slug,
          vanity: character.vanity,
        })),
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(buildErrorResponseBody(c, error), error.status as 401 | 404);
    }
    throw error;
  }
});

organizationsRouter.openapi(inviteOrganizationMemberRoute, async (c) => {
  const params = inviteOrganizationMemberRoute.request.params.safeParse(c.req.param());
  const schema =
    inviteOrganizationMemberRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const body = schema.safeParse(payload);

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  if (!body.success) {
    return c.json(
      validationErrorFromIssues(body.error.issues, "body", ensureRequestId(c)),
      422,
    );
  }

  try {
    const session = getRouteSession(c);
    const db = new D1Client(c.env.APP_DB);
    const organization = getRouteOrganization(c);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(db);
    const users = new UsersRepository(db);

    const targetUser = await requireUserByIdentifier(users, {
      userId: body.data.userId,
      userVanity: body.data.userVanity,
    });
    if (targetUser.status !== "active") {
      throw new NotFoundError("Target user not found");
    }

    const existingMembership = await members.findByOrganizationAndUser(
      organization.id,
      targetUser.id,
    );
    if (
      existingMembership &&
      (existingMembership.status === "active" || existingMembership.status === "pending")
    ) {
      throw new ConflictError("User is already attached to this organization", {
        code: "ORGANIZATION_MEMBER_EXISTS",
      });
    }

    const reservedCharacter =
      body.data.characterId !== undefined
        ? await requireAvailableCharacter(
            characters,
            pendingActions,
            organization.id,
            body.data.characterId,
          )
        : await createPendingCharacterFromDraft(characters, organization.id, {
            gameId: body.data.newCharacter!.gameId,
            name: body.data.newCharacter!.name,
            notes: body.data.newCharacter!.notes ?? null,
            slug: body.data.newCharacter!.slug ?? null,
          });

    const member = await members.createOrReactivate({
      organizationId: organization.id,
      role: body.data.role ?? "member",
      status: "pending",
      userId: targetUser.id,
    });
    await pendingActions.create({
      characterId: reservedCharacter.id,
      expiresAt: pendingActionExpiresAt(),
      invitedByUserId: session.user.id,
      kind: "invite",
      memberId: member.id,
      requestedCharacterName: body.data.newCharacter?.name ?? null,
      requestedCharacterNotes: body.data.newCharacter?.notes ?? null,
      requestedCharacterSlug: body.data.newCharacter?.slug ?? null,
      requestedGameId: body.data.newCharacter?.gameId ?? null,
    });

    return c.json(
      {
        member: toOrganizationWorkflowMemberResponse(member),
        message: "Invitation created successfully.",
      },
      201,
    );
  } catch (error) {
    const characterConflict = mapCharacterConflict(error);
    if (characterConflict) {
      return c.json(buildErrorResponseBody(c, characterConflict), 409);
    }

    if (error instanceof AppError) {
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
      );
    }
    throw error;
  }
});

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
    const characters = new CharactersRepository(db);
    const vanity = await reserveInitialVanity(organizations, parsed.data.name);

    const organization = await organizations.create({
      createdByUserId: session.user.id,
      description: parsed.data.description,
      iconUrl: parsed.data.iconUrl,
      name: parsed.data.name,
      slug: parsed.data.slug,
      vanity,
    });

    const membership = await members.create({
      organizationId: organization.id,
      role: "owner",
      status: "active",
      userId: session.user.id,
    });

    const character = await characters.create({
      claimedByUserId: session.user.id,
      gameId: parsed.data.initialCharacter.gameId,
      name: parsed.data.initialCharacter.name,
      notes: parsed.data.initialCharacter.notes,
      organizationId: organization.id,
      slug: parsed.data.initialCharacter.slug,
      vanity: await reserveCharacterVanity(
        characters,
        parsed.data.initialCharacter.name,
      ),
    });

    return c.json(
      {
        character: toCharacterResponse(character),
        message: "Organization created successfully.",
        membership: toOrganizationWorkflowMemberResponse(membership),
        organization: toOrganizationResponse(organization),
      },
      201,
    );
  } catch (error) {
    const conflict = mapOrganizationConflict(error);
    const characterConflict = mapCharacterConflict(error);

    if (conflict) {
      return c.json(buildErrorResponseBody(c, conflict), 409);
    }

    if (characterConflict) {
      return c.json(buildErrorResponseBody(c, characterConflict), 409);
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

organizationsRouter.openapi(createOrganizationCharacterRoute, async (c) => {
  const params = createOrganizationCharacterRoute.request.params.safeParse(
    c.req.param(),
  );
  const schema =
    createOrganizationCharacterRoute.request.body.content["application/json"]
      .schema;
  const payload = await c.req.json();
  const body = schema.safeParse(payload);

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  if (!body.success) {
    return c.json(
      validationErrorFromIssues(body.error.issues, "body", ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);

    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    await requireOrganizationManager(members, organization.id, session.user.id);

    const character = await characters.create({
      gameId: body.data.gameId,
      name: body.data.name,
      notes: body.data.notes,
      organizationId: organization.id,
      slug: body.data.slug,
      vanity: await reserveCharacterVanity(characters, body.data.name),
    });

    return c.json(
      {
        character: toCharacterResponse(character),
        message: "Character created successfully.",
      },
      201,
    );
  } catch (error) {
    const conflict = mapCharacterConflict(error);

    if (conflict) {
      return c.json(buildErrorResponseBody(c, conflict), 409);
    }

    if (error instanceof AppError) {
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
      );
    }

    throw error;
  }
});

organizationsRouter.openapi(addOrganizationMemberRoute, async (c) => {
  const params = addOrganizationMemberRoute.request.params.safeParse(c.req.param());
  const schema =
    addOrganizationMemberRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const body = schema.safeParse(payload);

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  if (!body.success) {
    return c.json(
      validationErrorFromIssues(body.error.issues, "body", ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(db);
    const users = new UsersRepository(db);

    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    await requireOrganizationManager(members, organization.id, session.user.id);

    const targetUser = await users.findById(body.data.userId);
    if (!targetUser || targetUser.status !== "active") {
      throw new NotFoundError("Target user not found");
    }

    const existingMembership = await members.findByOrganizationAndUser(
      organization.id,
      body.data.userId,
    );
    if (
      existingMembership &&
      (existingMembership.status === "active" ||
        existingMembership.status === "pending")
    ) {
      throw new ConflictError("User is already attached to this organization", {
        code: "ORGANIZATION_MEMBER_EXISTS",
      });
    }

    const existingCharacterClaims = await characters.listByOrganizationAndUser(
      organization.id,
      body.data.userId,
    );
    if (existingCharacterClaims.length > 0) {
      throw new ConflictError(
        "User already has a claimed character in this organization",
        {
          code: "USER_ALREADY_HAS_ORGANIZATION_CHARACTER",
        },
      );
    }

    const character = await requireAvailableCharacter(
      characters,
      pendingActions,
      organization.id,
      body.data.characterId,
    );
    const claimedCharacter = await characters.update(character.id, {
      claimedByUserId: body.data.userId,
    });
    const member = await members.createOrReactivate({
      organizationId: organization.id,
      role: body.data.role ?? "member",
      status: "active",
      userId: body.data.userId,
    });

    return c.json(
      {
        character: toCharacterResponse(claimedCharacter),
        member: toOrganizationWorkflowMemberResponse(member),
        message: "Member added successfully.",
      },
      201,
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

organizationsRouter.openapi(applyOrganizationMemberRoute, async (c) => {
  const params = applyOrganizationMemberRoute.request.params.safeParse(c.req.param());
  const schema =
    applyOrganizationMemberRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const body = schema.safeParse(payload);

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  if (!body.success) {
    return c.json(
      validationErrorFromIssues(body.error.issues, "body", ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(db);

    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );

    const existingMembership = await members.findByOrganizationAndUser(
      organization.id,
      session.user.id,
    );
    if (
      existingMembership &&
      (existingMembership.status === "active" ||
        existingMembership.status === "pending")
    ) {
      throw new ConflictError("You are already attached to this organization", {
        code: "ORGANIZATION_MEMBER_EXISTS",
      });
    }

    const existingCharacterClaims = await characters.listByOrganizationAndUser(
      organization.id,
      session.user.id,
    );
    if (existingCharacterClaims.length > 0) {
      throw new ConflictError(
        "You already have a claimed character in this organization",
        {
          code: "USER_ALREADY_HAS_ORGANIZATION_CHARACTER",
        },
      );
    }

    const pendingCharacter =
      body.data.characterId !== undefined
        ? await requireAvailableCharacter(
            characters,
            pendingActions,
            organization.id,
            body.data.characterId,
          )
        : await createPendingCharacterFromDraft(characters, organization.id, {
            gameId: body.data.newCharacter!.gameId,
            name: body.data.newCharacter!.name,
            notes: body.data.newCharacter!.notes ?? null,
            slug: body.data.newCharacter!.slug ?? null,
          });
    const member = await members.createOrReactivate({
      organizationId: organization.id,
      role: "member",
      status: "pending",
      userId: session.user.id,
    });
    await pendingActions.create({
      characterId: pendingCharacter.id,
      expiresAt: pendingActionExpiresAt(),
      kind: "apply",
      memberId: member.id,
      requestedCharacterName:
        body.data.newCharacter?.name ?? null,
      requestedCharacterNotes:
        body.data.newCharacter?.notes ?? null,
      requestedCharacterSlug:
        body.data.newCharacter?.slug ?? null,
      requestedGameId: body.data.newCharacter?.gameId ?? null,
    });

    return c.json(
      {
        character: toCharacterResponse(pendingCharacter),
        member: toOrganizationWorkflowMemberResponse(member),
        message: "Membership application submitted successfully.",
      },
      201,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 404 | 409,
      );
    }

    throw error;
  }
});

organizationsRouter.openapi(approveOrganizationMemberRoute, async (c) => {
  const params = approveOrganizationMemberRoute.request.params.safeParse(c.req.param());

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const db = new D1Client(c.env.APP_DB);
    const organization = getRouteOrganization(c);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(db);

    const member = await members.findById(params.data.memberId);
    if (!member || member.organization_id !== organization.id) {
      throw new NotFoundError("Organization membership not found");
    }

    if (member.status !== "pending") {
      throw new ConflictError("Membership is not pending approval", {
        code: "ORGANIZATION_MEMBER_NOT_PENDING",
      });
    }

    const pendingAction = await pendingActions.findByMemberId(member.id);
    if (!pendingAction || pendingAction.kind !== "apply" || !pendingAction.character_id) {
      throw new ConflictError(
        "Pending membership is missing its reserved character",
        {
          code: "ORGANIZATION_MEMBER_CHARACTER_REQUIRED",
        },
      );
    }

    const character = await characters.findById(pendingAction.character_id);
    if (!character || character.organization_id !== organization.id) {
      throw new ConflictError("Pending membership character is no longer available", {
        code: "ORGANIZATION_MEMBER_CHARACTER_REQUIRED",
      });
    }

    if (
      character.claimed_by_user_id !== null &&
      character.claimed_by_user_id !== member.user_id
    ) {
      throw new ConflictError("Pending membership character is already claimed", {
        code: "CHARACTER_ALREADY_CLAIMED",
      });
    }

    if (character.claimed_by_user_id !== member.user_id) {
      await characters.update(character.id, {
        claimedByUserId: member.user_id,
      });
    }

    const updated = await members.updateStatus(member.id, "active");
    await pendingActions.deleteByMemberId(member.id);

    return c.json(
      {
        member: toOrganizationWorkflowMemberResponse(updated),
        message: "Membership approved successfully.",
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

organizationsRouter.openapi(rejectOrganizationMemberRoute, async (c) => {
  const params = rejectOrganizationMemberRoute.request.params.safeParse(c.req.param());

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const session = getRouteSession(c);
    const db = new D1Client(c.env.APP_DB);
    const organization = getRouteOrganization(c);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(db);

    const member = await members.findById(params.data.memberId);
    if (!member || member.organization_id !== organization.id) {
      throw new NotFoundError("Organization membership not found");
    }

    if (member.status !== "pending") {
      throw new ConflictError("Membership is not pending approval", {
        code: "ORGANIZATION_MEMBER_NOT_PENDING",
      });
    }

    const pendingAction = await pendingActions.findByMemberId(member.id);
    if (!pendingAction) {
      throw new ConflictError("Pending membership details were not found", {
        code: "ORGANIZATION_MEMBER_PENDING_DETAILS_MISSING",
      });
    }

    if (pendingAction.character_id && pendingAction.requested_character_name) {
      await characters.delete(pendingAction.character_id, {
        deletedByUserId: session.user.id,
      });
    }

    await pendingActions.deleteByMemberId(member.id);
    const updated = await members.softRemove(member.id);

    return c.json(
      {
        member: toOrganizationMemberResponse(updated),
        message: "Pending membership rejected successfully.",
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

organizationsRouter.openapi(appointOrganizationAdminRoute, async (c) => {
  const params = appointOrganizationAdminRoute.request.params.safeParse(c.req.param());

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const session = getRouteSession(c);
    const db = new D1Client(c.env.APP_DB);
    const organization = getRouteOrganization(c);
    const members = new OrganizationMembersRepository(db);

    const member = await members.findById(params.data.memberId);
    if (!member || member.organization_id !== organization.id) {
      throw new NotFoundError("Organization membership not found");
    }

    if (member.status !== "active") {
      throw new ConflictError("Only active members can be promoted to admin", {
        code: "ORGANIZATION_MEMBER_NOT_ACTIVE",
      });
    }

    if (member.role === "owner") {
      throw new ConflictError("Organization owner is already the highest role", {
        code: "ORGANIZATION_OWNER_ROLE_IMMUTABLE",
      });
    }

    if (member.role === "admin") {
      throw new ConflictError("Member is already an admin", {
        code: "ORGANIZATION_MEMBER_ALREADY_ADMIN",
      });
    }

    const updated = await members.updateRole(member.id, "admin");

    return c.json(
      {
        member: toOrganizationMemberResponse(updated),
        message:
          member.user_id === session.user.id
            ? "Your organization admin role was updated successfully."
            : "Organization admin appointed successfully.",
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

organizationsRouter.openapi(removeOrganizationAdminRoute, async (c) => {
  const params = removeOrganizationAdminRoute.request.params.safeParse(c.req.param());

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const db = new D1Client(c.env.APP_DB);
    const organization = getRouteOrganization(c);
    const members = new OrganizationMembersRepository(db);

    const member = await members.findById(params.data.memberId);
    if (!member || member.organization_id !== organization.id) {
      throw new NotFoundError("Organization membership not found");
    }

    if (member.status !== "active") {
      throw new ConflictError("Only active admins can be removed", {
        code: "ORGANIZATION_MEMBER_NOT_ACTIVE",
      });
    }

    if (member.role === "owner") {
      throw new ConflictError("Organization owner cannot be demoted", {
        code: "ORGANIZATION_OWNER_ROLE_IMMUTABLE",
      });
    }

    if (member.role !== "admin") {
      throw new ConflictError("Member is not an admin", {
        code: "ORGANIZATION_MEMBER_NOT_ADMIN",
      });
    }

    const updated = await members.updateRole(member.id, "member");

    return c.json(
      {
        member: toOrganizationMemberResponse(updated),
        message: "Organization admin removed successfully.",
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

organizationsRouter.openapi(acceptOrganizationInviteRoute, async (c) => {
  const params = acceptOrganizationInviteRoute.request.params.safeParse(c.req.param());

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );

    const member = await members.findById(params.data.memberId);
    if (!member || member.organization_id !== organization.id) {
      throw new NotFoundError("Organization membership not found");
    }

    if (member.user_id !== session.user.id) {
      throw new ForbiddenError("You are not allowed to accept this invitation", {
        code: "ORGANIZATION_INVITE_ACCEPT_FORBIDDEN",
      });
    }

    if (member.status !== "pending") {
      throw new ConflictError("Invitation is not pending", {
        code: "ORGANIZATION_MEMBER_NOT_PENDING",
      });
    }

    const pendingAction = await pendingActions.findByMemberId(member.id);
    if (!pendingAction || pendingAction.kind !== "invite" || !pendingAction.character_id) {
      throw new ConflictError("Invitation details were not found", {
        code: "ORGANIZATION_INVITE_DETAILS_MISSING",
      });
    }

    const existingCharacterClaims = await characters.listByOrganizationAndUser(
      organization.id,
      session.user.id,
    );
    if (existingCharacterClaims.length > 0) {
      throw new ConflictError(
        "You already have a claimed character in this organization",
        {
          code: "USER_ALREADY_HAS_ORGANIZATION_CHARACTER",
        },
      );
    }

    const character = await characters.findById(pendingAction.character_id);
    if (!character || character.organization_id !== organization.id) {
      throw new ConflictError("Invitation character is no longer available", {
        code: "ORGANIZATION_INVITE_DETAILS_MISSING",
      });
    }

    if (
      character.claimed_by_user_id !== null &&
      character.claimed_by_user_id !== session.user.id
    ) {
      throw new ConflictError("Invitation character is already claimed", {
        code: "CHARACTER_ALREADY_CLAIMED",
      });
    }

    if (character.claimed_by_user_id !== session.user.id) {
      await characters.update(character.id, {
        claimedByUserId: session.user.id,
      });
    }

    const updated = await members.updateStatus(member.id, "active");
    await pendingActions.deleteByMemberId(member.id);

    return c.json(
      {
        member: toOrganizationWorkflowMemberResponse(updated),
        message: "Invitation accepted successfully.",
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

organizationsRouter.openapi(declineOrganizationInviteRoute, async (c) => {
  const params = declineOrganizationInviteRoute.request.params.safeParse(c.req.param());

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const pendingActions = new OrganizationMemberPendingActionsRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );

    const member = await members.findById(params.data.memberId);
    if (!member || member.organization_id !== organization.id) {
      throw new NotFoundError("Organization membership not found");
    }

    if (member.user_id !== session.user.id) {
      throw new ForbiddenError("You are not allowed to decline this invitation", {
        code: "ORGANIZATION_INVITE_DECLINE_FORBIDDEN",
      });
    }

    if (member.status !== "pending") {
      throw new ConflictError("Invitation is not pending", {
        code: "ORGANIZATION_MEMBER_NOT_PENDING",
      });
    }

    const pendingAction = await pendingActions.findByMemberId(member.id);
    if (!pendingAction || pendingAction.kind !== "invite") {
      throw new ConflictError("Invitation details were not found", {
        code: "ORGANIZATION_INVITE_DETAILS_MISSING",
      });
    }

    if (pendingAction.character_id && pendingAction.requested_character_name) {
      await characters.delete(pendingAction.character_id, {
        deletedByUserId: session.user.id,
      });
    }

    await pendingActions.deleteByMemberId(member.id);
    const updated = await members.softRemove(member.id);

    return c.json(
      {
        member: toOrganizationMemberResponse(updated),
        message: "Invitation declined successfully.",
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
    const organization = await requireOrganizationByIdentifier(
      organizations,
      parsed.data.organization,
    );

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

organizationsRouter.openapi(updateOrganizationRoute, async (c) => {
  const params = updateOrganizationRoute.request.params.safeParse(c.req.param());
  const schema =
    updateOrganizationRoute.request.body.content["application/json"].schema;
  const payload = await c.req.json();
  const body = schema.safeParse(payload);

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  if (!body.success) {
    return c.json(
      validationErrorFromIssues(body.error.issues, "body", ensureRequestId(c)),
      422,
    );
  }

  try {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );

    if (organization.created_by_user_id !== session.user.id) {
      throw new ForbiddenError("Only the organization creator can update it", {
        code: "ORGANIZATION_UPDATE_FORBIDDEN",
      });
    }

    const updated = await organizations.update(organization.id, {
      description: body.data.description,
      iconUrl: body.data.iconUrl,
      name: body.data.name,
      slug: body.data.slug,
    });

    return c.json(
      {
        message: "Organization updated successfully.",
        organization: toOrganizationResponse(updated),
      },
      200,
    );
  } catch (error) {
    const conflict = mapOrganizationConflict(error);

    if (conflict) {
      return c.json(buildErrorResponseBody(c, conflict), 409);
    }

    if (error instanceof AppError) {
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404 | 409,
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
