import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { SettlementAllocationsRepository } from "../../repositories/settlement-allocations-repository";
import { SettlementsRepository } from "../../repositories/settlements-repository";
import type {
  CreateSettlementInput,
  SettlementAllocationRecord,
  SettlementRecord,
} from "../../repositories/types";
import type { SettlementLifecyclePort } from "./interfaces";
import { EventLifecycleService } from "./event-lifecycle-service";
import { isTerminalAllocationStatus } from "./state-machines/shared";
import { settlementStateMachine } from "./state-machines/settlement-state-machine";

export class SettlementLifecycleService implements SettlementLifecyclePort {
  constructor(private readonly db: DatabaseClient) {}

  async createDraftSettlement(
    input: CreateSettlementInput,
  ): Promise<SettlementRecord> {
    const repository = new SettlementsRepository(this.db);

    if (input.eventId) {
      const eventService = new EventLifecycleService(this.db);
      const event = await eventService.syncStatusFromSettlements(input.eventId);

      if (
        event.status !== "ready_for_settlement" &&
        event.status !== "partially_settled"
      ) {
        throw new ConflictError(
          "Settlement can only be created from an event that is ready or already partially settled",
          {
            code: "SETTLEMENT_EVENT_STATUS_INVALID",
          },
        );
      }
    }

    const created = await repository.create({
      ...input,
      status: "draft",
    });

    if (created.event_id) {
      await new EventLifecycleService(this.db).syncStatusFromSettlements(
        created.event_id,
      );
    }

    return created;
  }

  async markCalculated(settlementId: number): Promise<SettlementRecord> {
    const repository = new SettlementsRepository(this.db);
    const settlement = await this.requireSettlement(settlementId);
    settlementStateMachine.assertTransition(settlement.status, "calculated");

    if (settlement.gross_amount < 0 || settlement.net_amount < 0) {
      throw new ConflictError("Settlement amounts must be non-negative", {
        code: "SETTLEMENT_AMOUNT_INVALID",
      });
    }

    return repository.update(settlementId, {
      status: "calculated",
    });
  }

  async startPaying(settlementId: number): Promise<SettlementRecord> {
    const repository = new SettlementsRepository(this.db);
    const allocationsRepository = new SettlementAllocationsRepository(this.db);
    const settlement = await this.requireSettlement(settlementId);
    settlementStateMachine.assertTransition(settlement.status, "paying");

    const allocations = await allocationsRepository.listBySettlement(settlementId);
    if (allocations.length === 0) {
      throw new ConflictError("Settlement requires allocations before payout starts", {
        code: "SETTLEMENT_ALLOCATIONS_REQUIRED",
      });
    }

    return repository.update(settlementId, {
      status: "paying",
    });
  }

  async markPaid(settlementId: number): Promise<SettlementRecord> {
    const repository = new SettlementsRepository(this.db);
    const allocations = await this.requireAllocations(settlementId);
    const settlement = await this.requireSettlement(settlementId);
    settlementStateMachine.assertTransition(settlement.status, "paid");

    if (!allocations.every((allocation) => isTerminalAllocationStatus(allocation.status))) {
      throw new ConflictError(
        "Settlement cannot be marked paid while allocations are still pending",
        {
          code: "SETTLEMENT_ALLOCATIONS_NOT_TERMINAL",
        },
      );
    }

    const updated = await repository.update(settlementId, {
      status: "paid",
    });

    if (updated.event_id) {
      await new EventLifecycleService(this.db).syncStatusFromSettlements(
        updated.event_id,
      );
    }

    return updated;
  }

  async cancelSettlement(settlementId: number): Promise<SettlementRecord> {
    const repository = new SettlementsRepository(this.db);
    const settlement = await this.requireSettlement(settlementId);
    const allocations = await this.requireAllocations(settlementId);
    settlementStateMachine.assertTransition(settlement.status, "cancelled");

    if (allocations.some((allocation) => allocation.status === "claimed")) {
      throw new ConflictError(
        "Settlement with claimed allocations cannot be cancelled",
        {
          code: "SETTLEMENT_ALREADY_CLAIMED",
        },
      );
    }

    const updated = await repository.update(settlementId, {
      status: "cancelled",
    });

    if (updated.event_id) {
      await new EventLifecycleService(this.db).syncStatusFromSettlements(
        updated.event_id,
      );
    }

    return updated;
  }

  async syncStatusFromAllocations(settlementId: number): Promise<SettlementRecord> {
    const settlement = await this.requireSettlement(settlementId);

    if (settlement.status === "draft" || settlement.status === "cancelled") {
      return settlement;
    }

    const allocations = await this.requireAllocations(settlementId);
    if (allocations.length === 0) {
      return settlement;
    }

    const allTerminal = allocations.every((allocation) =>
      isTerminalAllocationStatus(allocation.status),
    );

    if (allTerminal) {
      if (settlement.status === "calculated") {
        await this.startPaying(settlementId);
      }

      return this.markPaid(settlementId);
    }

    if (settlement.status === "calculated") {
      return this.startPaying(settlementId);
    }

    return settlement;
  }

  private async requireAllocations(
    settlementId: number,
  ): Promise<SettlementAllocationRecord[]> {
    return new SettlementAllocationsRepository(this.db).listBySettlement(
      settlementId,
    );
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
