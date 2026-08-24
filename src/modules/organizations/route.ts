import { OpenAPIHono } from "@hono/zod-openapi";
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
import { generateInitialOrganizationVanity } from "../../lib/vanity";
import { CharactersRepository } from "../../repositories/characters-repository";
import { GamesRepository } from "../../repositories/games-repository";
import { SessionAuthService } from "../../services/auth/session-auth-service";
import { OrganizationMembersRepository } from "../../repositories/organization-members-repository";
import { OrganizationsRepository } from "../../repositories/organizations-repository";
import { UsersRepository } from "../../repositories/users-repository";
import type { AppBindings } from "../../types/hono";
import {
  addOrganizationMemberRoute,
  applyOrganizationMemberRoute,
  approveOrganizationMemberRoute,
  createOrganizationRoute,
  createOrganizationCharacterRoute,
  currentOrganizationMembersRoute,
  currentOrganizationRoute,
  deleteOrganizationRoute,
  listGamesRoute,
  listOrganizationsRoute,
  myOrganizationsRoute,
  organizationCharactersRoute,
  organizationDetailRoute,
  organizationMembersRoute,
  updateOrganizationRoute,
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

  return character;
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

  const limit = parsed.data.limit ?? 20;
  bindings.push(limit);

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
     LIMIT ?`,
    ...bindings,
  );

  const organizations = await buildOrganizationSearchItems(db, rows);

  return c.json({ organizations }, 200);
});

organizationsRouter.openapi(myOrganizationsRoute, async (c) => {
  try {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);

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

    const organizations = await buildOrganizationSearchItems(
      db,
      rows.map((row) => ({
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
      rows.map((row) => [
        row.id,
        {
          approvedAt: row.approved_at,
          joinedAt: row.joined_at,
          role: row.membership_role,
          status: row.membership_status,
        },
      ]),
    );

    return c.json(
      {
        organizations: organizations.map((organization) => ({
          ...organization,
          membership: membershipById.get(organization.id)!,
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
    const organization = await requireOrganizationById(organizations, parsed.data.id);
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
    await requireOrganizationById(organizations, parsed.data.id);

    return c.json(
      {
        characters: (await characters.listByOrganization(parsed.data.id)).map(
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
    await requireOrganizationById(organizations, parsed.data.id);

    return c.json(
      {
        members: (await members.listByOrganization(parsed.data.id, "active")).map(
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
    const vanity = await reserveInitialVanity(organizations);

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

    await requireOrganizationById(organizations, params.data.id);
    await requireOrganizationManager(members, params.data.id, session.user.id);

    const character = await characters.create({
      gameId: body.data.gameId,
      name: body.data.name,
      notes: body.data.notes,
      organizationId: params.data.id,
      slug: body.data.slug,
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
    const users = new UsersRepository(db);

    await requireOrganizationById(organizations, params.data.id);
    await requireOrganizationManager(members, params.data.id, session.user.id);

    const targetUser = await users.findById(body.data.userId);
    if (!targetUser || targetUser.status !== "active") {
      throw new NotFoundError("Target user not found");
    }

    const existingMembership = await members.findByOrganizationAndUser(
      params.data.id,
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
      params.data.id,
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
      params.data.id,
      body.data.characterId,
    );
    const claimedCharacter = await characters.update(character.id, {
      claimedByUserId: body.data.userId,
    });
    const member = await members.createOrReactivate({
      organizationId: params.data.id,
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

    await requireOrganizationById(organizations, params.data.id);

    const existingMembership = await members.findByOrganizationAndUser(
      params.data.id,
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
      params.data.id,
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

    const character = await requireAvailableCharacter(
      characters,
      params.data.id,
      body.data.characterId,
    );
    const claimedCharacter = await characters.update(character.id, {
      claimedByUserId: session.user.id,
    });
    const member = await members.createOrReactivate({
      organizationId: params.data.id,
      role: "member",
      status: "pending",
      userId: session.user.id,
    });

    return c.json(
      {
        character: toCharacterResponse(claimedCharacter),
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
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);

    await requireOrganizationById(organizations, params.data.id);
    await requireOrganizationManager(members, params.data.id, session.user.id);

    const member = await members.findById(params.data.memberId);
    if (!member || member.organization_id !== params.data.id) {
      throw new NotFoundError("Organization membership not found");
    }

    if (member.status !== "pending") {
      throw new ConflictError("Membership is not pending approval", {
        code: "ORGANIZATION_MEMBER_NOT_PENDING",
      });
    }

    const claimedCharacters = await characters.listByOrganizationAndUser(
      params.data.id,
      member.user_id,
    );
    if (claimedCharacters.length === 0) {
      throw new ConflictError(
        "Pending member must have at least one claimed character",
        {
          code: "ORGANIZATION_MEMBER_CHARACTER_REQUIRED",
        },
      );
    }

    const updated = await members.updateStatus(member.id, "active");

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
    const organization = await organizations.findById(params.data.id);

    if (!organization) {
      throw new NotFoundError("Organization not found");
    }

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
