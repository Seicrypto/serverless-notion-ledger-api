import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { SettlementAllocationsRepository } from "../../repositories/settlement-allocations-repository";
import { SettlementsRepository } from "../../repositories/settlements-repository";
import type {
  SettlementAllocationRecord,
  SettlementRecord,
  SettlementStatus,
} from "../../repositories/types";
import { AssetIdentityResolutionService } from "../assets/asset-identity-resolution-service";
import { AssetTrustLifecycleService } from "../assets/asset-trust-lifecycle-service";
import type {
  CreateManagedSettlementInput,
  SettlementLifecyclePort,
} from "./interfaces";
import { EventLifecycleService } from "./event-lifecycle-service";
import { isTerminalAllocationStatus } from "./state-machines/shared";
import { settlementStateMachine } from "./state-machines/settlement-state-machine";

export class SettlementLifecycleService implements SettlementLifecyclePort {
  constructor(private readonly db: DatabaseClient) {}

  async createDraftSettlement(
    input: CreateManagedSettlementInput,
  ): Promise<SettlementRecord> {
    const repository = new SettlementsRepository(this.db);
    let fallbackGameId: number | null = null;

    if (input.eventId) {
      const eventService = new EventLifecycleService(this.db);
      const event = await eventService.syncStatusFromSettlements(input.eventId);
      if (event.organization_id !== input.organizationId) {
        throw new ConflictError("Settlement event does not belong to the organization", {
          code: "SETTLEMENT_EVENT_ORGANIZATION_MISMATCH",
        });
      }
      fallbackGameId = event.game_id;

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

    const resolvedUnitAssetId =
      input.unitAssetId === undefined
        ? await this.resolveDefaultUnitAssetId({
            gameId: fallbackGameId,
            organizationId: input.organizationId,
          })
        : input.unitAssetId;

    const created = await repository.create({
      ...input,
      settlementKey: input.settlementKey || `st-${randomUUID().slice(0, 12)}`,
      status: "draft",
      unitAssetId: resolvedUnitAssetId,
    });

    if (created.event_id) {
      await new EventLifecycleService(this.db).syncStatusFromSettlements(
        created.event_id,
      );
    }

    if (created.unit_asset_id) {
      await new AssetTrustLifecycleService(this.db).recomputeStatus(
        created.unit_asset_id,
      );
    }

    return created;
  }

  async settleEvent(
    input: CreateManagedSettlementInput & { eventId: number },
  ): Promise<SettlementRecord> {
    const eventService = new EventLifecycleService(this.db);
    const event = await eventService.syncStatusFromSettlements(input.eventId);

    if (event.organization_id !== input.organizationId) {
      throw new ConflictError("Settlement event does not belong to the organization", {
        code: "SETTLEMENT_EVENT_ORGANIZATION_MISMATCH",
      });
    }

    if (event.status === "open") {
      await eventService.markReadyForSettlement(event.id);
    }

    return this.createDraftSettlement(input);
  }

  async transitionStatus(
    settlementId: number,
    nextStatus: SettlementStatus,
  ): Promise<SettlementRecord> {
    switch (nextStatus) {
      case "calculated":
        return this.markCalculated(settlementId);
      case "paying":
        return this.startPaying(settlementId);
      case "paid":
        return this.markPaid(settlementId);
      case "cancelled":
        return this.cancelSettlement(settlementId);
      case "draft":
        throw new ConflictError("Settlement cannot transition back to draft", {
          code: "SETTLEMENT_STATUS_UNSUPPORTED",
        });
      default:
        throw new ConflictError("Unsupported settlement status transition", {
          code: "SETTLEMENT_STATUS_UNSUPPORTED",
        });
    }
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

  private async resolveDefaultUnitAssetId(input: {
    gameId: number | null;
    organizationId: number;
  }): Promise<number | null> {
    if (input.gameId) {
      const asset = await new AssetIdentityResolutionService(
        this.db,
      ).resolveDefaultSettlementUnit({
        gameId: input.gameId,
        organizationId: input.organizationId,
      });
      return asset?.id ?? null;
    }

    return null;
  }
}
