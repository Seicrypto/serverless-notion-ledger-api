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
import { CharacterClaimRequestsRepository } from "../../repositories/character-claim-requests-repository";
import { CharactersRepository } from "../../repositories/characters-repository";
import { GamesRepository } from "../../repositories/games-repository";
import { OrganizationMemberPendingActionsRepository } from "../../repositories/organization-member-pending-actions-repository";
import { OrganizationGamesRepository } from "../../repositories/organization-games-repository";
import { SessionAuthService } from "../../services/auth/session-auth-service";
import { OrganizationCharacterClaimWorkflowService } from "../../services/organizations/organization-character-claim-workflow-service";
import { OrganizationMembershipWorkflowService } from "../../services/organizations/organization-membership-workflow-service";
import { OrganizationMembersRepository } from "../../repositories/organization-members-repository";
import { OrganizationsRepository } from "../../repositories/organizations-repository";
import { UsersRepository } from "../../repositories/users-repository";
import type { AppBindings } from "../../types/hono";
import {
  requireTargetOrganizationMember,
  requireTargetOrganizationManager,
  requireTargetOrganizationOwner,
} from "./middleware";
import {
  addOrganizationMemberRoute,
  acceptOrganizationInviteRoute,
  acceptOrganizationCharacterClaimRequestRoute,
  applyOrganizationMemberRoute,
  assignOrganizationCharacterRoute,
  appointOrganizationAdminRoute,
  approveOrganizationMemberRoute,
  cancelOrganizationCharacterClaimRequestRoute,
  cancelOrganizationMemberRoute,
  claimOrganizationCharacterRoute,
  createOrganizationRoute,
  createOrganizationCharacterRoute,
  createOrganizationCharacterClaimRequestRoute,
  createOrganizationGameRoute,
  currentOrganizationMembersRoute,
  currentOrganizationRoute,
  deleteOrganizationCharacterRoute,
  deleteOrganizationRoute,
  deleteOrganizationGameRoute,
  declineOrganizationCharacterClaimRequestRoute,
  declineOrganizationInviteRoute,
  inviteOrganizationMemberRoute,
  leaveOrganizationMemberRoute,
  listGamesRoute,
  listOrganizationsRoute,
  myOrganizationsRoute,
  organizationCharacterDetailRoute,
  organizationActiveMembersRoute,
  organizationAvailableCharactersRoute,
  organizationCharactersRoute,
  organizationDetailRoute,
  organizationManagementCharactersRoute,
  organizationMembersRoute,
  organizationPendingMembersRoute,
  removeOrganizationAdminRoute,
  removeOrganizationMemberRoute,
  rejectOrganizationMemberRoute,
  searchOrganizationCharactersRoute,
  setPrimaryOrganizationGameRoute,
  unclaimOrganizationCharacterRoute,
  unassignOrganizationCharacterRoute,
  updateOrganizationCharacterRoute,
  updateOrganizationGameRoute,
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
  "/:organization/members/:memberId/remove",
  requireTargetOrganizationManager,
);
organizationsRouter.use(
  "/:organization/members/:memberId/leave",
  requireTargetOrganizationMember,
);
organizationsRouter.use(
  "/:organization/members/:memberId/appoint-admin",
  requireTargetOrganizationOwner,
);
organizationsRouter.use(
  "/:organization/members/:memberId/remove-admin",
  requireTargetOrganizationOwner,
);
organizationsRouter.use(
  "/:organization/games",
  requireTargetOrganizationManager,
);
organizationsRouter.use(
  "/:organization/characters/:characterId/assign",
  requireTargetOrganizationManager,
);
organizationsRouter.use(
  "/:organization/characters/:characterId/unassign",
  requireTargetOrganizationManager,
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

type OrganizationGameRow = {
  display_name: string | null;
  game_id: number;
  game_name: string;
  game_slug: string;
  icon_url: string | null;
  is_primary: number;
  metadata_source: "inherited" | "official";
  official_site_url: string | null;
  organization_id: number;
  sort_order: number;
  source: "internal" | "steam";
  source_id: string | null;
  type: "game" | "activity";
};

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

function toOrganizationGameSummary(game: OrganizationGameRow) {
  return {
    displayName: game.display_name,
    gameId: game.game_id,
    gameName: game.game_name,
    gameSlug: game.game_slug,
    iconUrl: game.icon_url,
    isPrimary: game.is_primary === 1,
    metadataSource: game.metadata_source,
    officialSiteUrl: game.official_site_url,
    resolvedIconUrl: resolveGameIconUrl(game.icon_url, game.official_site_url),
    sortOrder: game.sort_order,
    source: game.source,
    sourceId: game.source_id,
    type: game.type,
  };
}

function currentIsoTimestamp(): string {
  return new Date().toISOString();
}

function toCharacterClaimRequestResponse(
  request: Awaited<ReturnType<CharacterClaimRequestsRepository["create"]>>,
) {
  return {
    characterId: request.character_id,
    createdAt: request.created_at,
    id: request.id,
    organizationId: request.organization_id,
    requestedByUserId: request.requested_by_user_id,
    status: request.status,
    targetMemberId: request.target_member_id,
    targetUserId: request.target_user_id,
    updatedAt: request.updated_at,
  };
}

async function getOrganizationGameSummaryByGameId(
  db: D1Client,
  organizationId: number,
  gameId: number,
): Promise<ReturnType<typeof toOrganizationGameSummary> | null> {
  const row = await db.first<OrganizationGameRow>(
    `SELECT
       og.organization_id,
       og.game_id,
       og.display_name,
       og.is_primary,
       og.sort_order,
       g.name AS game_name,
       g.slug AS game_slug,
       g.icon_url,
       g.metadata_source,
       g.official_site_url,
       g.source,
       g.source_id,
       g.type
     FROM organization_games og
     INNER JOIN games g ON g.id = og.game_id
     WHERE og.organization_id = ?
       AND og.game_id = ?`,
    organizationId,
    gameId,
  );

  return row ? toOrganizationGameSummary(row) : null;
}

async function getCharacterDetailResponse(
  db: D1Client,
  organizationId: number,
  characterId: number,
) {
  const character = await db.first<{
    claimed_by_user_id: number | null;
    created_at: string;
    deleted_at: string | null;
    deleted_by_user_id: number | null;
    game_id: number | null;
    game_name: string | null;
    game_slug: string | null;
    icon_url: string | null;
    id: number;
    is_active: number;
    metadata_source: "inherited" | "official" | null;
    name: string;
    notes: string | null;
    official_site_url: string | null;
    organization_id: number;
    organization_game_display_name: string | null;
    organization_game_is_primary: number | null;
    organization_game_sort_order: number | null;
    slug: string | null;
    source: "internal" | "steam" | null;
    source_id: string | null;
    type: "game" | "activity" | null;
    updated_at: string;
    vanity: string | null;
  }>(
    `SELECT
       c.*,
       og.display_name AS organization_game_display_name,
       og.is_primary AS organization_game_is_primary,
       og.sort_order AS organization_game_sort_order,
       g.name AS game_name,
       g.slug AS game_slug,
       g.icon_url,
       g.metadata_source,
       g.official_site_url,
       g.source,
       g.source_id,
       g.type
     FROM characters c
     LEFT JOIN organization_games og
       ON og.organization_id = c.organization_id
      AND og.game_id = c.game_id
     LEFT JOIN games g ON g.id = c.game_id
     WHERE c.organization_id = ?
       AND c.id = ?
       AND c.deleted_at IS NULL`,
    organizationId,
    characterId,
  );

  if (!character) {
    throw new NotFoundError("Character not found");
  }

  return {
    ...toCharacterResponse(character),
    game:
      character.game_id === null ||
      character.game_name === null ||
      character.game_slug === null ||
      character.source === null ||
      character.type === null
        ? null
        : toOrganizationGameSummary({
            display_name: character.organization_game_display_name,
            game_id: character.game_id,
            game_name: character.game_name,
            game_slug: character.game_slug,
            icon_url: character.icon_url,
            is_primary: character.organization_game_is_primary ?? 0,
            metadata_source: character.metadata_source ?? "inherited",
            official_site_url: character.official_site_url,
            organization_id: character.organization_id,
            sort_order: character.organization_game_sort_order ?? 0,
            source: character.source,
            source_id: character.source_id,
            type: character.type,
          }),
  };
}

async function setOrganizationPrimaryGame(
  db: D1Client,
  organizationId: number,
  gameId: number,
) {
  await db.run(
    `UPDATE organization_games
     SET is_primary = CASE WHEN game_id = ? THEN 1 ELSE 0 END,
         updated_at = ?
     WHERE organization_id = ?`,
    gameId,
    currentIsoTimestamp(),
    organizationId,
  );
}

export async function ensureOrganizationInitialGame(
  db: D1Client,
  input: {
    gameId: number;
    organizationId: number;
  },
) {
  const organizationGames = new OrganizationGamesRepository(db);
  const existing = await organizationGames.findByOrganizationAndGame(
    input.organizationId,
    input.gameId,
  );

  if (existing) {
    if (existing.is_primary !== 1) {
      await setOrganizationPrimaryGame(db, input.organizationId, input.gameId);
    }
    return existing;
  }

  const existingGames = await organizationGames.listByOrganization(input.organizationId);
  const created = await organizationGames.create({
    gameId: input.gameId,
    isPrimary: existingGames.length === 0,
    organizationId: input.organizationId,
    sortOrder: existingGames.length,
  });

  if (created.is_primary === 1) {
    await setOrganizationPrimaryGame(db, input.organizationId, created.game_id);
  }

  return created;
}

async function requireOrganizationCharacter(
  characters: CharactersRepository,
  organizationId: number,
  characterId: number,
) {
  const character = await characters.findById(characterId);

  if (!character || character.organization_id !== organizationId) {
    throw new NotFoundError("Character not found");
  }

  return character;
}

async function requireOrganizationGame(
  organizationGames: OrganizationGamesRepository,
  organizationId: number,
  gameId: number,
) {
  const organizationGame = await organizationGames.findByOrganizationAndGame(
    organizationId,
    gameId,
  );

  if (!organizationGame) {
    throw new NotFoundError("Organization game not found");
  }

  return organizationGame;
}

async function requireActiveOrganizationMemberByReference(
  members: OrganizationMembersRepository,
  organizationId: number,
  input: {
    memberId?: number;
    userId?: number;
  },
) {
  const membership =
    input.memberId !== undefined
      ? await members.findById(input.memberId)
      : await members.findByOrganizationAndUser(organizationId, input.userId!);

  if (!membership || membership.organization_id !== organizationId) {
    throw new NotFoundError("Organization member not found");
  }

  if (membership.status !== "active") {
    throw new ConflictError("Target member is not active in this organization", {
      code: "ORGANIZATION_MEMBER_NOT_ACTIVE",
    });
  }

  return membership;
}

async function cancelPendingCharacterClaimRequests(
  db: D1Client,
  organizationId: number,
  characterId: number,
) {
  await db.run(
    `UPDATE character_claim_requests
     SET status = 'cancelled',
         updated_at = ?
     WHERE organization_id = ?
       AND character_id = ?
       AND status = 'pending_confirmation'`,
    currentIsoTimestamp(),
    organizationId,
    characterId,
  );
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

async function requireOrganizationOwner(
  members: OrganizationMembersRepository,
  organizationId: number,
  userId: number,
) {
  const membership = await members.findByOrganizationAndUser(organizationId, userId);

  if (!membership || membership.status !== "active" || membership.role !== "owner") {
    throw new ForbiddenError("Organization owner access is required", {
      code: "ORGANIZATION_OWNER_REQUIRED",
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
    icon_url: string | null;
    is_primary: number;
    metadata_source: "inherited" | "official";
    official_site_url: string | null;
    organization_id: number;
    sort_order: number;
    source: "internal" | "steam";
    source_id: string | null;
    type: "game" | "activity";
  }>(
    `SELECT
       og.organization_id,
       og.game_id,
       og.display_name,
       og.is_primary,
       og.sort_order,
       g.name AS game_name,
       g.slug AS game_slug,
       g.icon_url,
       g.metadata_source,
       g.official_site_url,
       g.source,
       g.source_id,
       g.type
     FROM organization_games og
     INNER JOIN games g ON g.id = og.game_id
     WHERE og.organization_id IN (${placeholders})
     ORDER BY og.sort_order ASC, og.id ASC`,
    ...organizationIds,
  );

  const characterGames = await db.all<OrganizationGameRow>(
    `SELECT DISTINCT
       c.organization_id,
       c.game_id,
       NULL AS display_name,
       0 AS is_primary,
       0 AS sort_order,
       g.name AS game_name,
       g.slug AS game_slug,
       g.icon_url,
       g.metadata_source,
       g.official_site_url,
       g.source,
       g.source_id,
       g.type
     FROM characters c
     INNER JOIN games g ON g.id = c.game_id
     WHERE c.organization_id IN (${placeholders})
       AND c.deleted_at IS NULL
       AND c.game_id IS NOT NULL
     ORDER BY c.game_id ASC`,
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

  const gamesByOrganization = new Map<number, OrganizationGameRow[]>();
  for (const game of games) {
    const existing = gamesByOrganization.get(game.organization_id) ?? [];
    existing.push(game);
    gamesByOrganization.set(game.organization_id, existing);
  }

  for (const game of characterGames) {
    const existing = gamesByOrganization.get(game.organization_id) ?? [];
    if (existing.some((candidate) => candidate.game_id === game.game_id)) {
      continue;
    }
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
    games: (gamesByOrganization.get(organization.id) ?? []).map(
      toOrganizationGameSummary,
    ),
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
      iconUrl: game.resolvedIconUrl,
      name: game.displayName ?? game.gameName,
      primary: game.isPrimary,
    })),
    iconUrl: organization.iconUrl,
    id: organization.id,
    membership,
    name: organization.name,
    stats: {
      characterCount: organization.activeCharacterCount,
      memberCount: organization.activeMemberCount,
    },
    tags: [],
    vanity: organization.vanity,
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
  const requestId = ensureRequestId(c);

  if (!parsed.success) {
    console.warn("[organizations.search.validation_failed]", {
      issues: parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.map(String).join("."),
      })),
      query: c.req.query(),
      requestId,
    });
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "query", requestId),
      422,
    );
  }

  const db = new D1Client(c.env.APP_DB);
  const bindings: unknown[] = [];
  const whereClauses: string[] = [];
  const searchTerm = parsed.data.q ?? parsed.data.displayName;

  if (searchTerm) {
    whereClauses.push(
      `(o.name LIKE ? OR o.vanity LIKE ? OR g.name LIKE ? OR g.slug LIKE ?)`,
    );
    const pattern = `%${searchTerm}%`;
    bindings.push(pattern, pattern, pattern, pattern);
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
  const orderByClause =
    parsed.data.gameId || parsed.data.gameSlug
      ? "ORDER BY CASE WHEN og.is_primary = 1 THEN 0 ELSE 1 END ASC, o.id ASC"
      : "ORDER BY o.id ASC";

  const rows = await db.all<{
    created_at: string;
    created_by_user_id: number;
    deleted_at: string | null;
    deleted_by_user_id: number | null;
      description: string | null;
      icon_url: string | null;
      id: number;
      name: string;
      updated_at: string;
      vanity: string | null;
  }>(
    `SELECT DISTINCT
       o.*
     FROM organizations o
     LEFT JOIN organization_games og ON og.organization_id = o.id
     LEFT JOIN games g ON g.id = og.game_id
     WHERE o.deleted_at IS NULL
     ${whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""}
     ${orderByClause}
     LIMIT ?
     OFFSET ?`,
    ...bindings,
  );

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const organizations = await buildOrganizationSearchItems(db, pageRows);

  if (organizations.length === 0) {
    console.warn("[organizations.search.no_results]", {
      gameId: parsed.data.gameId ?? null,
      gameSlug: parsed.data.gameSlug ?? null,
      limit,
      offset,
      query: searchTerm ?? null,
      rawRowCount: rows.length,
      requestId,
    });
  }

  console.info("[organizations.search.completed]", {
    gameId: parsed.data.gameId ?? null,
    gameSlug: parsed.data.gameSlug ?? null,
    hasMore,
    limit,
    matchedCount: organizations.length,
    offset,
    query: searchTerm ?? null,
    requestId,
    resultIds: organizations.map((organization) => organization.id),
  });

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
      deleted_at: string | null;
      deleted_by_user_id: number | null;
      description: string | null;
      icon_url: string | null;
      id: number;
      joined_at: string;
      membership_role: "owner" | "admin" | "member";
      membership_status: "pending" | "active";
      name: string;
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
         AND o.deleted_at IS NULL
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
        deleted_at: row.deleted_at,
        deleted_by_user_id: row.deleted_by_user_id,
        description: row.description,
        icon_url: row.icon_url,
        id: row.id,
        name: row.name,
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
    const organization = await requireOrganizationByIdentifier(
      organizations,
      parsed.data.organization,
    );
    const now = currentIsoTimestamp();

    return c.json(
      {
        characters: (
          await db.all<{
            claimed_by_user_id: number | null;
            created_at: string;
            deleted_at: string | null;
            deleted_by_user_id: number | null;
            game_id: number | null;
            game_name: string | null;
            game_slug: string | null;
            icon_url: string | null;
            id: number;
            is_active: number;
            metadata_source: "inherited" | "official" | null;
            name: string;
            notes: string | null;
            official_site_url: string | null;
            organization_id: number;
            organization_game_display_name: string | null;
            organization_game_is_primary: number | null;
            pending_draft_id: number | null;
            slug: string | null;
            source: "internal" | "steam" | null;
            source_id: string | null;
            type: "game" | "activity" | null;
            updated_at: string;
            vanity: string | null;
          }>(
            `SELECT
               c.*,
               og.display_name AS organization_game_display_name,
               og.is_primary AS organization_game_is_primary,
               g.name AS game_name,
               g.slug AS game_slug,
               g.icon_url,
               g.metadata_source,
               g.official_site_url,
               p.id AS pending_draft_id,
               g.source,
               g.source_id,
               g.type
             FROM characters c
             LEFT JOIN organization_member_pending_actions p
               ON p.character_id = c.id
              AND (p.expires_at IS NULL OR p.expires_at > ?)
             LEFT JOIN organization_games og
               ON og.organization_id = c.organization_id
              AND og.game_id = c.game_id
             LEFT JOIN games g ON g.id = c.game_id
             WHERE c.organization_id = ?
               AND c.deleted_at IS NULL
               AND NOT (
                 p.id IS NOT NULL
                 AND p.requested_character_name IS NOT NULL
               )
             ORDER BY c.id ASC`,
            now,
            organization.id,
          )
        ).map((character) => ({
          ...toCharacterResponse(character),
          game:
            character.game_id === null ||
            character.game_name === null ||
            character.game_slug === null ||
            character.source === null ||
            character.type === null
              ? null
              : toOrganizationGameSummary({
                  display_name: character.organization_game_display_name,
                  game_id: character.game_id,
                  game_name: character.game_name,
                  game_slug: character.game_slug,
                  icon_url: character.icon_url,
                  is_primary: character.organization_game_is_primary ?? 0,
            metadata_source: character.metadata_source ?? "inherited",
            official_site_url: character.official_site_url,
            organization_id: character.organization_id,
            sort_order: 0,
            source: character.source,
            source_id: character.source_id,
            type: character.type,
                }),
        })),
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

organizationsRouter.openapi(searchOrganizationCharactersRoute, async (c) => {
  const params = searchOrganizationCharactersRoute.request.params.safeParse(c.req.param());
  const query = searchOrganizationCharactersRoute.request.query.safeParse(c.req.query());

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  if (!query.success) {
    return c.json(
      validationErrorFromIssues(query.error.issues, "query", ensureRequestId(c)),
      422,
    );
  }

  try {
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    const now = currentIsoTimestamp();
    const limit = query.data.limit ?? 20;
    const offset = query.data.offset ?? 0;
    const activeClause =
      query.data.isActive === undefined
        ? ""
        : query.data.isActive === "true"
          ? "AND c.is_active = 1"
          : "AND c.is_active = 0";

    const rows = await db.all<{
      claimed_by_user_id: number | null;
      created_at: string;
      deleted_at: string | null;
      deleted_by_user_id: number | null;
      game_id: number | null;
      game_name: string | null;
      game_slug: string | null;
      icon_url: string | null;
      id: number;
      is_active: number;
      metadata_source: "inherited" | "official" | null;
      name: string;
      notes: string | null;
      official_site_url: string | null;
      pending_draft_id: number | null;
      organization_game_display_name: string | null;
      organization_game_is_primary: number | null;
      organization_game_sort_order: number | null;
      organization_id: number;
      slug: string | null;
      source: "internal" | "steam" | null;
      source_id: string | null;
      type: "game" | "activity" | null;
      updated_at: string;
      vanity: string | null;
    }>(
      `SELECT
         c.*,
         og.display_name AS organization_game_display_name,
         og.is_primary AS organization_game_is_primary,
         og.sort_order AS organization_game_sort_order,
         p.id AS pending_draft_id,
         g.name AS game_name,
         g.slug AS game_slug,
         g.icon_url,
         g.metadata_source,
         g.official_site_url,
         g.source,
         g.source_id,
         g.type
       FROM characters c
       LEFT JOIN organization_member_pending_actions p
         ON p.character_id = c.id
        AND (p.expires_at IS NULL OR p.expires_at > ?)
       LEFT JOIN organization_games og
         ON og.organization_id = c.organization_id
        AND og.game_id = c.game_id
       LEFT JOIN games g ON g.id = c.game_id
       WHERE c.organization_id = ?
         AND c.deleted_at IS NULL
         AND NOT (
           p.id IS NOT NULL
           AND p.requested_character_name IS NOT NULL
         )
         AND (c.name LIKE ? OR c.slug LIKE ? OR c.notes LIKE ?)
         ${activeClause}
       ORDER BY c.id ASC
       LIMIT ?
       OFFSET ?`,
      now,
      organization.id,
      `%${query.data.q}%`,
      `%${query.data.q}%`,
      `%${query.data.q}%`,
      limit + 1,
      offset,
    );

    const hasMore = rows.length > limit;
    const visibleRows = hasMore ? rows.slice(0, limit) : rows;

    return c.json(
      {
        characters: visibleRows.map((character) => ({
          ...toCharacterResponse(character),
          game:
            character.game_id === null ||
            character.game_name === null ||
            character.game_slug === null ||
            character.source === null ||
            character.type === null
              ? null
              : toOrganizationGameSummary({
                  display_name: character.organization_game_display_name,
                  game_id: character.game_id,
                  game_name: character.game_name,
                  game_slug: character.game_slug,
                  icon_url: character.icon_url,
                  is_primary: character.organization_game_is_primary ?? 0,
                  metadata_source: character.metadata_source ?? "inherited",
                  official_site_url: character.official_site_url,
                  organization_id: character.organization_id,
                  sort_order: character.organization_game_sort_order ?? 0,
                  source: character.source,
                  source_id: character.source_id,
                  type: character.type,
                }),
        })),
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
      return c.json(buildErrorResponseBody(c, error), error.status as 404);
    }
    throw error;
  }
});

organizationsRouter.openapi(organizationCharacterDetailRoute, async (c) => {
  const parsed = organizationCharacterDetailRoute.request.params.safeParse(c.req.param());

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

    return c.json(
      {
        character: await getCharacterDetailResponse(
          db,
          organization.id,
          parsed.data.characterId,
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

organizationsRouter.openapi(updateOrganizationCharacterRoute, async (c) => {
  const params = updateOrganizationCharacterRoute.request.params.safeParse(c.req.param());
  const schema =
    updateOrganizationCharacterRoute.request.body.content["application/json"].schema;
  const body = schema.safeParse(await c.req.json());

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
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    await requireOrganizationManager(members, organization.id, session.user.id);
    const existing = await requireOrganizationCharacter(
      characters,
      organization.id,
      params.data.characterId,
    );

    if (body.data.gameId !== undefined && body.data.gameId !== null) {
      const organizationGames = new OrganizationGamesRepository(db);
      await requireOrganizationGame(organizationGames, organization.id, body.data.gameId);
    }

    const updated = await characters.update(existing.id, {
      gameId: body.data.gameId,
      isActive: body.data.isActive,
      name: body.data.name,
      notes: body.data.notes ?? body.data.description,
      slug: body.data.slug,
    });

    return c.json(
      {
        character: await getCharacterDetailResponse(db, organization.id, updated.id),
        message: "Character updated successfully.",
      },
      200,
    );
  } catch (error) {
    const characterConflict = mapCharacterConflict(error);
    if (characterConflict) {
      return c.json(buildErrorResponseBody(c, characterConflict), 409);
    }

    if (error instanceof AppError) {
      return c.json(
        buildErrorResponseBody(c, error),
        error.status as 401 | 403 | 404,
      );
    }
    throw error;
  }
});

organizationsRouter.openapi(deleteOrganizationCharacterRoute, async (c) => {
  const parsed = deleteOrganizationCharacterRoute.request.params.safeParse(c.req.param());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const characters = new CharactersRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      parsed.data.organization,
    );
    await requireOrganizationManager(members, organization.id, session.user.id);
    const character = await requireOrganizationCharacter(
      characters,
      organization.id,
      parsed.data.characterId,
    );
    const deleted = await characters.delete(character.id, {
      deletedByUserId: session.user.id,
    });
    await cancelPendingCharacterClaimRequests(db, organization.id, character.id);

    return c.json(
      {
        character: toCharacterResponse(deleted),
        message: "Character deleted successfully.",
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

organizationsRouter.openapi(claimOrganizationCharacterRoute, async (c) => {
  const params = claimOrganizationCharacterRoute.request.params.safeParse(c.req.param());
  const schema =
    claimOrganizationCharacterRoute.request.body.content["application/json"].schema;
  const body = schema.safeParse(await c.req.json());

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
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    await requireOrganizationManager(members, organization.id, session.user.id);
    const workflow = new OrganizationCharacterClaimWorkflowService(db);

    const mode =
      body.data.mode ??
      (body.data.status === "pending_confirmation"
        ? "assign"
        : body.data.userId === undefined && body.data.memberId === undefined
          ? "unassign"
          : "assign");

    if (mode === "unassign") {
      const updated = await workflow.unassignCharacter({
        characterId: params.data.characterId,
        organizationId: organization.id,
      });
      return c.json(
        {
          character: await getCharacterDetailResponse(db, organization.id, updated.id),
          claimRequest: null,
          message: "Character unclaimed successfully.",
        },
        200,
      );
    }

    if (body.data.status === "pending_confirmation" || mode === "transfer") {
      const request = await workflow.createClaimRequest({
        characterId: params.data.characterId,
        organizationId: organization.id,
        requestedByUserId: session.user.id,
        targetMemberId: body.data.memberId,
        targetUserId: body.data.userId,
      });
      return c.json(
        {
          character: await getCharacterDetailResponse(
            db,
            organization.id,
            params.data.characterId,
          ),
          claimRequest: toCharacterClaimRequestResponse(request),
          message:
            mode === "transfer"
              ? "Character transfer confirmation requested successfully."
              : "Character claim request created successfully.",
        },
        200,
      );
    }

    const updatedCharacter = await workflow.assignCharacter({
      characterId: params.data.characterId,
      organizationId: organization.id,
      targetMemberId: body.data.memberId,
      targetUserId: body.data.userId,
    });

    return c.json(
      {
        character: await getCharacterDetailResponse(db, organization.id, updatedCharacter.id),
        claimRequest: null,
        message: "Character assigned successfully.",
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

organizationsRouter.openapi(createOrganizationCharacterClaimRequestRoute, async (c) => {
  const params = createOrganizationCharacterClaimRequestRoute.request.params.safeParse(
    c.req.param(),
  );
  const schema =
    createOrganizationCharacterClaimRequestRoute.request.body.content["application/json"]
      .schema;
  const body = schema.safeParse(await c.req.json());

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
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    await requireOrganizationManager(members, organization.id, session.user.id);
    const workflow = new OrganizationCharacterClaimWorkflowService(db);
    const request = await workflow.createClaimRequest({
      characterId: params.data.characterId,
      organizationId: organization.id,
      requestedByUserId: session.user.id,
      targetMemberId: body.data.memberId,
      targetUserId: body.data.userId,
    });

    return c.json(
      {
        character: await getCharacterDetailResponse(
          db,
          organization.id,
          params.data.characterId,
        ),
        claimRequest: toCharacterClaimRequestResponse(request),
        message: "Character claim request created successfully.",
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

organizationsRouter.openapi(assignOrganizationCharacterRoute, async (c) => {
  const params = assignOrganizationCharacterRoute.request.params.safeParse(c.req.param());
  const schema =
    assignOrganizationCharacterRoute.request.body.content["application/json"].schema;
  const body = schema.safeParse(await c.req.json());

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
    await requireOrganizationManager(
      new OrganizationMembersRepository(db),
      organization.id,
      session.user.id,
    );
    const workflow = new OrganizationCharacterClaimWorkflowService(db);
    const updated = await workflow.assignCharacter({
      characterId: params.data.characterId,
      organizationId: organization.id,
      targetMemberId: body.data.memberId,
      targetUserId: body.data.userId,
    });

    return c.json(
      {
        character: await getCharacterDetailResponse(db, organization.id, updated.id),
        claimRequest: null,
        message: "Character assigned successfully.",
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

organizationsRouter.openapi(unclaimOrganizationCharacterRoute, async (c) => {
  const parsed = unclaimOrganizationCharacterRoute.request.params.safeParse(c.req.param());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      parsed.data.organization,
    );
    await requireOrganizationManager(members, organization.id, session.user.id);
    const workflow = new OrganizationCharacterClaimWorkflowService(db);
    const updated = await workflow.unassignCharacter({
      characterId: parsed.data.characterId,
      organizationId: organization.id,
    });

    return c.json(
      {
        character: await getCharacterDetailResponse(db, organization.id, updated.id),
        claimRequest: null,
        message: "Character unclaimed successfully.",
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

organizationsRouter.openapi(unassignOrganizationCharacterRoute, async (c) => {
  const parsed = unassignOrganizationCharacterRoute.request.params.safeParse(c.req.param());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const session = getRouteSession(c);
    const db = new D1Client(c.env.APP_DB);
    const organization = getRouteOrganization(c);
    await requireOrganizationManager(
      new OrganizationMembersRepository(db),
      organization.id,
      session.user.id,
    );
    const workflow = new OrganizationCharacterClaimWorkflowService(db);
    const updated = await workflow.unassignCharacter({
      characterId: parsed.data.characterId,
      organizationId: organization.id,
    });

    return c.json(
      {
        character: await getCharacterDetailResponse(db, organization.id, updated.id),
        claimRequest: null,
        message: "Character unassigned successfully.",
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
      game_id: number | null;
      game_name: string | null;
      game_slug: string | null;
      id: number;
      icon_url: string | null;
      is_primary: number | null;
      metadata_source: "inherited" | "official" | null;
      name: string;
      notes: string | null;
      official_site_url: string | null;
      slug: string | null;
      source: "internal" | "steam" | null;
      source_id: string | null;
      type: "game" | "activity" | null;
      vanity: string | null;
      organization_game_display_name: string | null;
    }>(
      `SELECT
         c.id,
         c.name,
         c.slug,
         c.vanity,
         c.notes,
         c.game_id,
         c.claimed_by_user_id,
         u.display_name AS claimed_display_name,
         u.vanity AS claimed_vanity,
         og.display_name AS organization_game_display_name,
         og.is_primary,
         g.name AS game_name,
         g.slug AS game_slug,
         g.icon_url,
         g.metadata_source,
         g.official_site_url,
         g.source,
         g.source_id,
         g.type
       FROM characters c
       LEFT JOIN users u ON u.id = c.claimed_by_user_id
       LEFT JOIN organization_games og
         ON og.organization_id = c.organization_id
        AND og.game_id = c.game_id
       LEFT JOIN games g ON g.id = c.game_id
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
          game:
            character.game_id === null ||
            character.game_name === null ||
            character.game_slug === null ||
            character.source === null ||
            character.type === null
              ? null
              : toOrganizationGameSummary({
                  display_name: character.organization_game_display_name,
                  game_id: character.game_id,
                  game_name: character.game_name,
                  game_slug: character.game_slug,
                  icon_url: character.icon_url,
                  is_primary: character.is_primary ?? 0,
                  metadata_source: character.metadata_source ?? "inherited",
                  official_site_url: character.official_site_url,
                  organization_id: organization.id,
                  sort_order: 0,
                  source: character.source,
                  source_id: character.source_id,
                  type: character.type,
                }),
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
    const now = currentIsoTimestamp();

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
      game_id: number | null;
      game_name: string | null;
      game_slug: string | null;
      icon_url: string | null;
      metadata_source: "inherited" | "official" | null;
      official_site_url: string | null;
      organization_game_display_name: string | null;
      organization_game_is_primary: number | null;
      source: "internal" | "steam" | null;
      source_id: string | null;
      type: "game" | "activity" | null;
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
         c.notes AS character_notes,
         c.game_id,
         og.display_name AS organization_game_display_name,
         og.is_primary AS organization_game_is_primary,
         g.name AS game_name,
         g.slug AS game_slug,
         g.icon_url,
         g.metadata_source,
         g.official_site_url,
         g.source,
         g.source_id,
         g.type
       FROM organization_members m
       INNER JOIN users u ON u.id = m.user_id
       INNER JOIN organization_member_pending_actions p ON p.member_id = m.id
       LEFT JOIN characters c ON c.id = p.character_id
       LEFT JOIN organization_games og
         ON og.organization_id = m.organization_id
        AND og.game_id = c.game_id
       LEFT JOIN games g ON g.id = c.game_id
       WHERE m.organization_id = ?
         AND m.status = 'pending'
         AND (p.expires_at IS NULL OR p.expires_at > ?)
       ORDER BY m.id ASC`,
      organization.id,
      now,
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
                  game:
                    member.game_id === null ||
                    member.game_name === null ||
                    member.game_slug === null ||
                    member.source === null ||
                    member.type === null
                      ? null
                      : toOrganizationGameSummary({
                          display_name: member.organization_game_display_name,
                          game_id: member.game_id,
                          game_name: member.game_name,
                          game_slug: member.game_slug,
                          icon_url: member.icon_url,
                          is_primary: member.organization_game_is_primary ?? 0,
                          metadata_source: member.metadata_source ?? "inherited",
                          official_site_url: member.official_site_url,
                          organization_id: organization.id,
                          sort_order: 0,
                          source: member.source,
                          source_id: member.source_id,
                          type: member.type,
                        }),
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
    const now = currentIsoTimestamp();

    const characters = await db.all<{
      game_id: number | null;
      game_name: string | null;
      game_slug: string | null;
      id: number;
      icon_url: string | null;
      is_primary: number | null;
      metadata_source: "inherited" | "official" | null;
      name: string;
      notes: string | null;
      official_site_url: string | null;
      organization_game_display_name: string | null;
      slug: string | null;
      source: "internal" | "steam" | null;
      source_id: string | null;
      type: "game" | "activity" | null;
      vanity: string | null;
    }>(
      `SELECT
         c.id,
         c.name,
         c.slug,
         c.vanity,
         c.notes,
         c.game_id,
         og.display_name AS organization_game_display_name,
         og.is_primary,
         g.name AS game_name,
         g.slug AS game_slug,
         g.icon_url,
         g.metadata_source,
         g.official_site_url,
         g.source,
         g.source_id,
         g.type
       FROM characters c
       LEFT JOIN organization_member_pending_actions p
         ON p.character_id = c.id
        AND (p.expires_at IS NULL OR p.expires_at > ?)
       LEFT JOIN organization_games og
         ON og.organization_id = c.organization_id
        AND og.game_id = c.game_id
       LEFT JOIN games g ON g.id = c.game_id
       WHERE c.organization_id = ?
         AND c.deleted_at IS NULL
         AND c.is_active = 1
         AND c.claimed_by_user_id IS NULL
         AND p.id IS NULL
       ORDER BY c.id ASC`,
      now,
      organization.id,
    );

    return c.json(
      {
        characters: characters.map((character) => ({
          characterId: character.id,
          description: character.notes,
          game:
            character.game_id === null ||
            character.game_name === null ||
            character.game_slug === null ||
            character.source === null ||
            character.type === null
              ? null
              : toOrganizationGameSummary({
                  display_name: character.organization_game_display_name,
                  game_id: character.game_id,
                  game_name: character.game_name,
                  game_slug: character.game_slug,
                  icon_url: character.icon_url,
                  is_primary: character.is_primary ?? 0,
                  metadata_source: character.metadata_source ?? "inherited",
                  official_site_url: character.official_site_url,
                  organization_id: organization.id,
                  sort_order: 0,
                  source: character.source,
                  source_id: character.source_id,
                  type: character.type,
                }),
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
        error.status as 401 | 403 | 404,
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

    await ensureOrganizationInitialGame(db, {
      gameId: parsed.data.initialCharacter.gameId,
      organizationId: organization.id,
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

organizationsRouter.openapi(createOrganizationGameRoute, async (c) => {
  const params = createOrganizationGameRoute.request.params.safeParse(c.req.param());
  const schema =
    createOrganizationGameRoute.request.body.content["application/json"].schema;
  const body = schema.safeParse(await c.req.json());

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
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const organizationGames = new OrganizationGamesRepository(db);
    const games = new GamesRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    await requireOrganizationManager(members, organization.id, session.user.id);

    const game = await games.findById(body.data.gameId);
    if (!game) {
      throw new NotFoundError("Game not found");
    }

    const existing = await organizationGames.findByOrganizationAndGame(
      organization.id,
      body.data.gameId,
    );
    if (existing) {
      throw new ConflictError("Organization game already exists", {
        code: "ORGANIZATION_GAME_EXISTS",
      });
    }

    const existingGames = await organizationGames.listByOrganization(organization.id);
    const created = await organizationGames.create({
      displayName: body.data.displayName,
      gameId: body.data.gameId,
      isPrimary: body.data.isPrimary ?? existingGames.length === 0,
      organizationId: organization.id,
      sortOrder: body.data.sortOrder ?? existingGames.length,
    });

    if (created.is_primary === 1) {
      await setOrganizationPrimaryGame(db, organization.id, created.game_id);
    }

    const summary = await getOrganizationGameSummaryByGameId(
      db,
      organization.id,
      created.game_id,
    );
    if (!summary) {
      throw new NotFoundError("Organization game not found");
    }

    return c.json(
      {
        game: summary,
        message: "Organization game created successfully.",
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

organizationsRouter.openapi(updateOrganizationGameRoute, async (c) => {
  const params = updateOrganizationGameRoute.request.params.safeParse(c.req.param());
  const schema =
    updateOrganizationGameRoute.request.body.content["application/json"].schema;
  const body = schema.safeParse(await c.req.json());

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
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const organizationGames = new OrganizationGamesRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    await requireOrganizationManager(members, organization.id, session.user.id);
    const organizationGame = await requireOrganizationGame(
      organizationGames,
      organization.id,
      params.data.gameId,
    );

    await organizationGames.update(organizationGame.id, {
      displayName: body.data.displayName,
      isPrimary: body.data.isPrimary,
      sortOrder: body.data.sortOrder,
    });

    if (body.data.isPrimary === true) {
      await setOrganizationPrimaryGame(db, organization.id, organizationGame.game_id);
    }

    if (body.data.isPrimary === false) {
      const games = await organizationGames.listByOrganization(organization.id);
      const hasPrimary = games.some(
        (candidate) =>
          candidate.game_id !== organizationGame.game_id && candidate.is_primary === 1,
      );
      if (!hasPrimary) {
        throw new ConflictError("Organization must keep at least one primary game", {
          code: "ORGANIZATION_PRIMARY_GAME_REQUIRED",
        });
      }
    }

    const summary = await getOrganizationGameSummaryByGameId(
      db,
      organization.id,
      organizationGame.game_id,
    );
    if (!summary) {
      throw new NotFoundError("Organization game not found");
    }

    return c.json(
      {
        game: summary,
        message: "Organization game updated successfully.",
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

organizationsRouter.openapi(deleteOrganizationGameRoute, async (c) => {
  const parsed = deleteOrganizationGameRoute.request.params.safeParse(c.req.param());

  if (!parsed.success) {
    return c.json(
      validationErrorFromIssues(parsed.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const organizationGames = new OrganizationGamesRepository(db);
    const characters = new CharactersRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      parsed.data.organization,
    );
    await requireOrganizationManager(members, organization.id, session.user.id);
    const organizationGame = await requireOrganizationGame(
      organizationGames,
      organization.id,
      parsed.data.gameId,
    );
    const allGames = await organizationGames.listByOrganization(organization.id);
    if (allGames.length <= 1) {
      throw new ConflictError("Organization must keep at least one game", {
        code: "ORGANIZATION_GAME_REQUIRED",
      });
    }

    const linkedCharacters = await characters.listByGame(organizationGame.game_id);
    if (linkedCharacters.some((character) => character.organization_id === organization.id)) {
      throw new ConflictError("Cannot remove a game that is still used by characters", {
        code: "ORGANIZATION_GAME_IN_USE",
      });
    }

    const summary = await getOrganizationGameSummaryByGameId(
      db,
      organization.id,
      organizationGame.game_id,
    );
    await organizationGames.delete(organizationGame.id);

    if (organizationGame.is_primary === 1) {
      const remainingGames = await organizationGames.listByOrganization(organization.id);
      const nextPrimary = remainingGames[0];
      if (nextPrimary) {
        await setOrganizationPrimaryGame(db, organization.id, nextPrimary.game_id);
      }
    }

    if (!summary) {
      throw new NotFoundError("Organization game not found");
    }

    return c.json(
      {
        game: summary,
        message: "Organization game deleted successfully.",
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

organizationsRouter.openapi(setPrimaryOrganizationGameRoute, async (c) => {
  const params = setPrimaryOrganizationGameRoute.request.params.safeParse(c.req.param());
  const schema =
    setPrimaryOrganizationGameRoute.request.body.content["application/json"].schema;
  const body = schema.safeParse(await c.req.json());

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
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const organizationGames = new OrganizationGamesRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    await requireOrganizationManager(members, organization.id, session.user.id);
    await requireOrganizationGame(organizationGames, organization.id, params.data.gameId);
    await setOrganizationPrimaryGame(db, organization.id, params.data.gameId);
    const summary = await getOrganizationGameSummaryByGameId(
      db,
      organization.id,
      params.data.gameId,
    );
    if (!summary) {
      throw new NotFoundError("Organization game not found");
    }

    return c.json(
      {
        game: summary,
        message: "Organization primary game updated successfully.",
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
    const workflow = new OrganizationMembershipWorkflowService(db);
    const updated = await workflow.approvePendingApply({
      memberId: params.data.memberId,
      organizationId: organization.id,
    });

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
    const workflow = new OrganizationMembershipWorkflowService(db);
    const updated = await workflow.rejectPendingMembership({
      actorUserId: session.user.id,
      memberId: params.data.memberId,
      organizationId: organization.id,
    });

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

organizationsRouter.openapi(cancelOrganizationMemberRoute, async (c) => {
  const params = cancelOrganizationMemberRoute.request.params.safeParse(c.req.param());

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    const managerMembership = await members.findByOrganizationAndUser(
      organization.id,
      session.user.id,
    );
    const allowManagerOverride =
      managerMembership?.status === "active" &&
      (managerMembership.role === "owner" || managerMembership.role === "admin");
    const workflow = new OrganizationMembershipWorkflowService(db);
    const updated = await workflow.cancelPendingMembership({
      actorUserId: session.user.id,
      allowManagerOverride,
      memberId: params.data.memberId,
      organizationId: organization.id,
    });

    return c.json(
      {
        member: toOrganizationMemberResponse(updated),
        message: "Pending membership cancelled successfully.",
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

organizationsRouter.openapi(leaveOrganizationMemberRoute, async (c) => {
  const params = leaveOrganizationMemberRoute.request.params.safeParse(c.req.param());

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
    const workflow = new OrganizationMembershipWorkflowService(db);
    const updated = await workflow.leaveActiveMembership({
      actorUserId: session.user.id,
      memberId: params.data.memberId,
      organizationId: organization.id,
    });

    return c.json(
      {
        member: toOrganizationMemberResponse(updated),
        message: "Member left the organization successfully.",
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

organizationsRouter.openapi(removeOrganizationMemberRoute, async (c) => {
  const params = removeOrganizationMemberRoute.request.params.safeParse(c.req.param());

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const db = new D1Client(c.env.APP_DB);
    const organization = getRouteOrganization(c);
    const workflow = new OrganizationMembershipWorkflowService(db);
    const updated = await workflow.removeActiveMembership({
      memberId: params.data.memberId,
      organizationId: organization.id,
    });

    return c.json(
      {
        member: toOrganizationMemberResponse(updated),
        message: "Member removed successfully.",
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
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    const workflow = new OrganizationMembershipWorkflowService(db);
    const updated = await workflow.acceptInvite({
      actorUserId: session.user.id,
      memberId: params.data.memberId,
      organizationId: organization.id,
    });

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
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    const workflow = new OrganizationMembershipWorkflowService(db);
    const updated = await workflow.declineInvite({
      actorUserId: session.user.id,
      memberId: params.data.memberId,
      organizationId: organization.id,
    });

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

organizationsRouter.openapi(acceptOrganizationCharacterClaimRequestRoute, async (c) => {
  const params = acceptOrganizationCharacterClaimRequestRoute.request.params.safeParse(
    c.req.param(),
  );

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    const workflow = new OrganizationCharacterClaimWorkflowService(db);
    const result = await workflow.acceptClaimRequest({
      actorUserId: session.user.id,
      organizationId: organization.id,
      requestId: params.data.requestId,
    });

    return c.json(
      {
        character: await getCharacterDetailResponse(db, organization.id, result.character.id),
        claimRequest: toCharacterClaimRequestResponse(result.request),
        message: "Character claim request accepted successfully.",
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

organizationsRouter.openapi(declineOrganizationCharacterClaimRequestRoute, async (c) => {
  const params = declineOrganizationCharacterClaimRequestRoute.request.params.safeParse(
    c.req.param(),
  );

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const claimRequests = new CharacterClaimRequestsRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    const workflow = new OrganizationCharacterClaimWorkflowService(db);
    const request = await workflow.declineClaimRequest({
      actorUserId: session.user.id,
      organizationId: organization.id,
      requestId: params.data.requestId,
    });

    return c.json(
      {
        character: await getCharacterDetailResponse(db, organization.id, request.character_id),
        claimRequest: toCharacterClaimRequestResponse(
          (await claimRequests.findById(request.id)) ?? request,
        ),
        message: "Character claim request declined successfully.",
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

organizationsRouter.openapi(cancelOrganizationCharacterClaimRequestRoute, async (c) => {
  const params = cancelOrganizationCharacterClaimRequestRoute.request.params.safeParse(
    c.req.param(),
  );

  if (!params.success) {
    return c.json(
      validationErrorFromIssues(params.error.issues, "params", ensureRequestId(c)),
      422,
    );
  }

  try {
    const session = await new SessionAuthService(c.env).requireActiveUser(getSessionCookie(c));
    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const claimRequests = new CharacterClaimRequestsRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      params.data.organization,
    );
    const managerMembership = await members.findByOrganizationAndUser(
      organization.id,
      session.user.id,
    );
    const allowManagerOverride =
      managerMembership?.status === "active" &&
      (managerMembership.role === "owner" || managerMembership.role === "admin");
    const workflow = new OrganizationCharacterClaimWorkflowService(db);
    const request = await workflow.cancelClaimRequest({
      actorUserId: session.user.id,
      allowManagerOverride,
      organizationId: organization.id,
      requestId: params.data.requestId,
    });

    return c.json(
      {
        character: await getCharacterDetailResponse(db, organization.id, request.character_id),
        claimRequest: toCharacterClaimRequestResponse(
          (await claimRequests.findById(request.id)) ?? request,
        ),
        message: "Character claim request cancelled successfully.",
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
    const members = new OrganizationMembersRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      parsed.data.organization,
    );
    await requireOrganizationOwner(members, organization.id, session.user.id);

    await organizations.delete(organization.id, {
      deletedByUserId: session.user.id,
    });

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
