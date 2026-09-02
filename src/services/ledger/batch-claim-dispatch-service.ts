import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError } from "../../lib/errors";
import {
  requireLedgerAllocation,
  requireLedgerCharacter,
  requireLedgerSettlement,
} from "../../modules/ledger/guards";
import { SettlementClaimsRepository } from "../../repositories/settlement-claims-repository";
import { CharactersRepository } from "../../repositories/characters-repository";
import type { SettlementClaimMethod, SettlementClaimRecord } from "../../repositories/types";
import { ClaimLifecycleService } from "./claim-lifecycle-service";
import { SettlementLifecycleService } from "./settlement-lifecycle-service";

type BatchClaimItemInput = {
  amount: number;
  claimedByCharacterId?: number | null;
  settlementAllocationId: number;
};

export type BatchClaimDispatchResult = {
  allocationsProcessed: number;
  claims: SettlementClaimRecord[];
  settlementsTouched: number;
};

export class BatchClaimDispatchService {
  constructor(private readonly db: DatabaseClient) {}

  async recordBatchClaims(input: {
    claimedAt: string;
    items: BatchClaimItemInput[];
    method?: SettlementClaimMethod;
    notes?: string | null;
    organizationId: number;
  }): Promise<BatchClaimDispatchResult> {
    const seenAllocationIds = new Set<number>();
    const touchedSettlementIds = new Set<number>();
    const claims: SettlementClaimRecord[] = [];
    const claimService = new ClaimLifecycleService(this.db);
    const claimsRepository = new SettlementClaimsRepository(this.db);

    for (const item of input.items) {
      if (seenAllocationIds.has(item.settlementAllocationId)) {
        throw new ConflictError("Duplicate allocation ids are not allowed in batch claims", {
          code: "BATCH_CLAIM_DUPLICATE_ALLOCATION",
        });
      }
      seenAllocationIds.add(item.settlementAllocationId);

      const allocation = await requireLedgerAllocation(
        this.db,
        item.settlementAllocationId,
        input.organizationId,
      );
      const settlement = await requireLedgerSettlement(
        this.db,
        allocation.settlement_id,
        input.organizationId,
      );

      const activeClaims = await claimsRepository.listByAllocation(allocation.id);
      if (activeClaims.some((claim) => claim.status !== "voided")) {
        throw new ConflictError("Allocation already has a recorded or confirmed claim", {
          code: "ALLOCATION_CLAIM_ALREADY_EXISTS",
        });
      }

      const resolvedCharacterId =
        item.claimedByCharacterId ?? allocation.character_id ?? null;

      if (allocation.character_id && resolvedCharacterId !== allocation.character_id) {
        throw new ConflictError("Claim recipient must match the allocation recipient", {
          code: "ALLOCATION_RECIPIENT_MISMATCH",
        });
      }

      if (resolvedCharacterId) {
        await requireLedgerCharacter(
          this.db,
          resolvedCharacterId,
          input.organizationId,
        );
      } else {
        throw new ConflictError("Claimable batch items require a recipient character", {
          code: "BATCH_CLAIM_CHARACTER_REQUIRED",
        });
      }

      if (settlement.status === "draft") {
        await new SettlementLifecycleService(this.db).markCalculated(settlement.id);
      }

      const claim = await claimService.recordClaim({
        amount: item.amount,
        claimedAt: input.claimedAt,
        claimedByCharacterId: resolvedCharacterId,
        method: input.method,
        notes: input.notes,
        settlementAllocationId: allocation.id,
      });

      touchedSettlementIds.add(settlement.id);
      claims.push(claim);
    }

    return {
      allocationsProcessed: claims.length,
      claims,
      settlementsTouched: touchedSettlementIds.size,
    };
  }

  async recordRecipientClaims(input: {
    characterId: number;
    claimedAt: string;
    includeSiblingCharacters?: boolean;
    items: Array<{
      allocationId: number;
      amount: number;
    }>;
    method?: SettlementClaimMethod;
    notes?: string | null;
    organizationId: number;
  }): Promise<BatchClaimDispatchResult> {
    const allowedCharacterIds = await this.resolveAllowedRecipientCharacterIds({
      characterId: input.characterId,
      includeSiblingCharacters: input.includeSiblingCharacters,
      organizationId: input.organizationId,
    });

    const items = [];
    for (const item of input.items) {
      const allocation = await requireLedgerAllocation(
        this.db,
        item.allocationId,
        input.organizationId,
      );
      if (!allocation.character_id || !allowedCharacterIds.has(allocation.character_id)) {
        throw new ConflictError("Allocation does not belong to the requested recipient", {
          code: "CLAIMABLE_RECIPIENT_ALLOCATION_MISMATCH",
        });
      }

      items.push({
        amount: item.amount,
        claimedByCharacterId: allocation.character_id,
        settlementAllocationId: allocation.id,
      });
    }

    return this.recordBatchClaims({
      claimedAt: input.claimedAt,
      items,
      method: input.method,
      notes: input.notes,
      organizationId: input.organizationId,
    });
  }

  async recordSettlementClaims(input: {
    claimedAt: string;
    items: Array<{
      allocationId: number;
      amount: number;
      characterId: number;
    }>;
    method?: SettlementClaimMethod;
    notes?: string | null;
    organizationId: number;
    settlementId: number;
  }): Promise<BatchClaimDispatchResult> {
    const items = [];
    for (const item of input.items) {
      const allocation = await requireLedgerAllocation(
        this.db,
        item.allocationId,
        input.organizationId,
      );
      if (allocation.settlement_id !== input.settlementId) {
        throw new ConflictError("Allocation does not belong to the requested settlement", {
          code: "SETTLEMENT_CLAIM_ALLOCATION_MISMATCH",
        });
      }
      if (!allocation.character_id || allocation.character_id !== item.characterId) {
        throw new ConflictError("Claim recipient must match the allocation recipient", {
          code: "ALLOCATION_RECIPIENT_MISMATCH",
        });
      }

      items.push({
        amount: item.amount,
        claimedByCharacterId: item.characterId,
        settlementAllocationId: allocation.id,
      });
    }

    return this.recordBatchClaims({
      claimedAt: input.claimedAt,
      items,
      method: input.method,
      notes: input.notes,
      organizationId: input.organizationId,
    });
  }

  private async resolveAllowedRecipientCharacterIds(input: {
    characterId: number;
    includeSiblingCharacters?: boolean;
    organizationId: number;
  }) {
    const character = await requireLedgerCharacter(
      this.db,
      input.characterId,
      input.organizationId,
    );
    const allowed = new Set<number>([character.id]);

    if (!input.includeSiblingCharacters || !character.claimed_by_user_id) {
      return allowed;
    }

    const siblings = await new CharactersRepository(this.db).listByOrganizationAndUser(
      input.organizationId,
      character.claimed_by_user_id,
    );
    for (const sibling of siblings) {
      allowed.add(sibling.id);
    }

    return allowed;
  }
}
