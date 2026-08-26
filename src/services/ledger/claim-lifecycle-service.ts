import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { SettlementAllocationsRepository } from "../../repositories/settlement-allocations-repository";
import { SettlementClaimsRepository } from "../../repositories/settlement-claims-repository";
import { SettlementsRepository } from "../../repositories/settlements-repository";
import type {
  CreateSettlementClaimInput,
  SettlementAllocationRecord,
  SettlementClaimRecord,
  SettlementRecord,
} from "../../repositories/types";
import type { ClaimLifecyclePort } from "./interfaces";
import { AllocationLifecycleService } from "./allocation-lifecycle-service";
import { claimStateMachine } from "./state-machines/claim-state-machine";
import { isConfirmedClaimStatus } from "./state-machines/shared";
import { SettlementLifecycleService } from "./settlement-lifecycle-service";

export class ClaimLifecycleService implements ClaimLifecyclePort {
  constructor(private readonly db: DatabaseClient) {}

  async recordClaim(
    input: CreateSettlementClaimInput,
  ): Promise<SettlementClaimRecord> {
    const repository = new SettlementClaimsRepository(this.db);
    const allocation = await this.requireAllocation(input.settlementAllocationId);
    if (allocation.status !== "pending") {
      throw new ConflictError("Claim can only be recorded for a pending allocation", {
        code: "ALLOCATION_NOT_PENDING",
      });
    }

    const settlement = await this.requireSettlement(allocation.settlement_id);
    if (settlement.status === "cancelled" || settlement.status === "paid") {
      throw new ConflictError(
        "Cannot record claim on a paid or cancelled settlement",
        {
          code: "SETTLEMENT_CLAIM_NOT_ALLOWED",
        },
      );
    }

    if (settlement.status === "calculated") {
      await new SettlementLifecycleService(this.db).startPaying(settlement.id);
    }

    return repository.create({
      ...input,
      status: input.status ?? "recorded",
    });
  }

  async confirmClaim(
    claimId: number,
    confirmedByUserId?: number | null,
  ): Promise<SettlementClaimRecord> {
    const repository = new SettlementClaimsRepository(this.db);
    const claim = await this.requireClaim(claimId);
    claimStateMachine.assertTransition(claim.status, "confirmed");

    const timestamp = new Date().toISOString();
    const updated = await repository.update(claimId, {
      confirmedAt: timestamp,
      confirmedByUserId: confirmedByUserId ?? null,
      status: "confirmed",
      voidedAt: null,
      voidedByUserId: null,
    });

    const allocation = await this.requireAllocation(updated.settlement_allocation_id);
    if (allocation.status === "pending") {
      await new AllocationLifecycleService(this.db).markClaimed(allocation.id);
    }

    return updated;
  }

  async voidClaim(
    claimId: number,
    voidedByUserId?: number | null,
  ): Promise<SettlementClaimRecord> {
    const repository = new SettlementClaimsRepository(this.db);
    const claim = await this.requireClaim(claimId);
    claimStateMachine.assertTransition(claim.status, "voided");

    const timestamp = new Date().toISOString();
    const updated = await repository.update(claimId, {
      status: "voided",
      voidedAt: timestamp,
      voidedByUserId: voidedByUserId ?? null,
    });

    const allocation = await this.requireAllocation(updated.settlement_allocation_id);
    const siblingClaims = await repository.listByAllocation(allocation.id);
    const hasOtherConfirmedClaim = siblingClaims.some(
      (sibling) =>
        sibling.id !== updated.id && isConfirmedClaimStatus(sibling.status),
    );

    if (!hasOtherConfirmedClaim && allocation.status === "claimed") {
      await new SettlementAllocationsRepository(this.db).update(allocation.id, {
        status: "pending",
      });
      await new SettlementLifecycleService(this.db).syncStatusFromAllocations(
        allocation.settlement_id,
      );
    }

    return updated;
  }

  private async requireAllocation(
    allocationId: number,
  ): Promise<SettlementAllocationRecord> {
    const allocation = await new SettlementAllocationsRepository(this.db).findById(
      allocationId,
    );

    if (!allocation) {
      throw new NotFoundError("Settlement allocation not found");
    }

    return allocation;
  }

  private async requireClaim(claimId: number): Promise<SettlementClaimRecord> {
    const claim = await new SettlementClaimsRepository(this.db).findById(claimId);

    if (!claim) {
      throw new NotFoundError("Settlement claim not found");
    }

    return claim;
  }

  private async requireSettlement(settlementId: number): Promise<SettlementRecord> {
    const settlement = await new SettlementsRepository(this.db).findById(
      settlementId,
    );

    if (!settlement) {
      throw new NotFoundError("Settlement not found");
    }

    return settlement;
  }
}
