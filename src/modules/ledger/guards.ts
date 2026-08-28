import type { Context } from "hono";
import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { AppError, ForbiddenError } from "../../lib/errors";
import { CharactersRepository } from "../../repositories/characters-repository";
import { EventsRepository } from "../../repositories/events-repository";
import { SettlementAllocationsRepository } from "../../repositories/settlement-allocations-repository";
import { SettlementClaimsRepository } from "../../repositories/settlement-claims-repository";
import { SettlementsRepository } from "../../repositories/settlements-repository";
import type {
  CharacterRecord,
  EventRecord,
  OrganizationMemberRecord,
  OrganizationRecord,
  SettlementAllocationRecord,
  SettlementClaimRecord,
  SettlementRecord,
} from "../../repositories/types";
import type { AuthenticatedSession } from "../../services/auth/session-auth-service";
import type { AppBindings } from "../../types/hono";

export function requireLedgerOrganization(
  c: Context<AppBindings>,
): OrganizationRecord {
  const organization = c.get("organization");
  if (!organization) {
    throw new AppError("Organization context is required", 404, {
      code: "ORGANIZATION_CONTEXT_REQUIRED",
    });
  }

  return organization;
}

export function requireLedgerSession(
  c: Context<AppBindings>,
): AuthenticatedSession {
  const session = c.get("session");
  if (!session) {
    throw new AppError("Session context is required", 401, {
      code: "SESSION_CONTEXT_REQUIRED",
    });
  }

  return session;
}

export function requireLedgerMembership(
  c: Context<AppBindings>,
): OrganizationMemberRecord {
  const membership = c.get("organizationMembership");
  if (!membership) {
    throw new AppError("Organization membership context is required", 403, {
      code: "ORGANIZATION_MEMBER_REQUIRED",
    });
  }

  return membership;
}

export function assertLedgerManager(membership: OrganizationMemberRecord) {
  if (membership.role === "owner" || membership.role === "admin") {
    return;
  }

  throw new ForbiddenError("Organization manager access is required", {
    code: "ORGANIZATION_MANAGER_REQUIRED",
  });
}

export async function requireLedgerEvent(
  db: DatabaseClient,
  eventId: number,
  organizationId: number,
): Promise<EventRecord> {
  const event = await new EventsRepository(db).findById(eventId);
  if (!event || event.organization_id !== organizationId) {
    throw new AppError("Event not found", 404, {
      code: "EVENT_NOT_FOUND",
    });
  }

  return event;
}

export async function requireLedgerSettlement(
  db: DatabaseClient,
  settlementId: number,
  organizationId: number,
): Promise<SettlementRecord> {
  const settlement = await new SettlementsRepository(db).findById(settlementId);
  if (!settlement || settlement.organization_id !== organizationId) {
    throw new AppError("Settlement not found", 404, {
      code: "SETTLEMENT_NOT_FOUND",
    });
  }

  return settlement;
}

export async function requireLedgerAllocation(
  db: DatabaseClient,
  allocationId: number,
  organizationId: number,
): Promise<SettlementAllocationRecord> {
  const allocation = await new SettlementAllocationsRepository(db).findById(
    allocationId,
  );
  if (!allocation) {
    throw new AppError("Allocation not found", 404, {
      code: "ALLOCATION_NOT_FOUND",
    });
  }

  await requireLedgerSettlement(db, allocation.settlement_id, organizationId);
  return allocation;
}

export async function requireLedgerClaim(
  db: DatabaseClient,
  claimId: number,
  organizationId: number,
): Promise<{
  allocation: SettlementAllocationRecord;
  claim: SettlementClaimRecord;
}> {
  const claim = await new SettlementClaimsRepository(db).findById(claimId);
  if (!claim) {
    throw new AppError("Claim not found", 404, {
      code: "CLAIM_NOT_FOUND",
    });
  }

  const allocation = await requireLedgerAllocation(
    db,
    claim.settlement_allocation_id,
    organizationId,
  );

  return { allocation, claim };
}

export async function requireLedgerCharacter(
  db: DatabaseClient,
  characterId: number,
  organizationId: number,
): Promise<CharacterRecord> {
  const character = await new CharactersRepository(db).findById(characterId);
  if (!character || character.organization_id !== organizationId) {
    throw new AppError("Character not found", 404, {
      code: "CHARACTER_NOT_FOUND",
    });
  }

  return character;
}
