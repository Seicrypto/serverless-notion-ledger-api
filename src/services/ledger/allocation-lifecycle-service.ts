import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { SettlementAllocationsRepository } from "../../repositories/settlement-allocations-repository";
import { SettlementsRepository } from "../../repositories/settlements-repository";
import type {
  CreateSettlementAllocationInput,
  SettlementAllocationStatus,
  SettlementAllocationRecord,
  SettlementRecord,
} from "../../repositories/types";
import type { AllocationLifecyclePort } from "./interfaces";
import { allocationStateMachine } from "./state-machines/allocation-state-machine";
import { SettlementLifecycleService } from "./settlement-lifecycle-service";

export class AllocationLifecycleService implements AllocationLifecyclePort {
  constructor(private readonly db: DatabaseClient) {}

  async createPendingAllocation(
    input: CreateSettlementAllocationInput,
  ): Promise<SettlementAllocationRecord> {
    const repository = new SettlementAllocationsRepository(this.db);
    const settlement = await this.requireSettlement(input.settlementId);

    if (settlement.status === "paid" || settlement.status === "cancelled") {
      throw new ConflictError(
        "Cannot create allocations for a paid or cancelled settlement",
        {
          code: "SETTLEMENT_NOT_ALLOCATION_EDITABLE",
        },
      );
    }

    return repository.create({
      ...input,
      status: input.status ?? "pending",
    });
  }

  async markClaimed(allocationId: number): Promise<SettlementAllocationRecord> {
    const repository = new SettlementAllocationsRepository(this.db);
    const allocation = await this.requireAllocation(allocationId);
    allocationStateMachine.assertTransition(allocation.status, "claimed");

    const updated = await repository.update(allocationId, {
      status: "claimed",
    });

    await new SettlementLifecycleService(this.db).syncStatusFromAllocations(
      updated.settlement_id,
    );

    return updated;
  }

  async waiveAllocation(allocationId: number): Promise<SettlementAllocationRecord> {
    const repository = new SettlementAllocationsRepository(this.db);
    const allocation = await this.requireAllocation(allocationId);
    allocationStateMachine.assertTransition(allocation.status, "waived");

    const updated = await repository.update(allocationId, {
      status: "waived",
    });

    await new SettlementLifecycleService(this.db).syncStatusFromAllocations(
      updated.settlement_id,
    );

    return updated;
  }

  async cancelAllocation(allocationId: number): Promise<SettlementAllocationRecord> {
    const repository = new SettlementAllocationsRepository(this.db);
    const allocation = await this.requireAllocation(allocationId);
    allocationStateMachine.assertTransition(allocation.status, "cancelled");

    const updated = await repository.update(allocationId, {
      status: "cancelled",
    });

    await new SettlementLifecycleService(this.db).syncStatusFromAllocations(
      updated.settlement_id,
    );

    return updated;
  }

  async transitionStatus(
    allocationId: number,
    nextStatus: SettlementAllocationStatus,
  ): Promise<SettlementAllocationRecord> {
    switch (nextStatus) {
      case "claimed":
        throw new ConflictError("Claimed allocations are managed by confirmed claims", {
          code: "ALLOCATION_STATUS_MANAGED",
        });
      case "waived":
        return this.waiveAllocation(allocationId);
      case "cancelled":
        return this.cancelAllocation(allocationId);
      case "pending":
        throw new ConflictError("Allocation cannot transition back to pending directly", {
          code: "ALLOCATION_STATUS_UNSUPPORTED",
        });
      default:
        throw new ConflictError("Unsupported allocation status transition", {
          code: "ALLOCATION_STATUS_UNSUPPORTED",
        });
    }
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
