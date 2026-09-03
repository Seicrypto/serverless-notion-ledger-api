import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError } from "../../lib/errors";
import { SettlementsRepository } from "../../repositories/settlements-repository";
import type { SettlementAllocationRecord, SettlementRecord } from "../../repositories/types";
import { AllocationLifecycleService } from "./allocation-lifecycle-service";
import { EventLifecycleService } from "./event-lifecycle-service";
import type {
  SettleEventRecipientInput,
  SettleEventWithAllocationsInput,
  SettleEventWithAllocationsResult,
} from "./interfaces";
import { SettlementLifecycleService } from "./settlement-lifecycle-service";

const AMOUNT_EPSILON = 0.000001;

type PreparedRecipient = {
  amount: number;
  characterId: number;
  ratio: number | null;
  weight: number;
};

export class EventSettlementOrchestrationService {
  constructor(private readonly db: DatabaseClient) {}

  async settleEventWithAllocations(
    input: SettleEventWithAllocationsInput,
  ): Promise<SettleEventWithAllocationsResult> {
    const eventLifecycle = new EventLifecycleService(this.db);
    const settlementLifecycle = new SettlementLifecycleService(this.db);
    const allocationLifecycle = new AllocationLifecycleService(this.db);

    const event = await eventLifecycle.syncStatusFromSettlements(input.eventId);
    if (event.organization_id !== input.organizationId) {
      throw new ConflictError("Settlement event does not belong to the organization", {
        code: "SETTLEMENT_EVENT_ORGANIZATION_MISMATCH",
      });
    }

    if (event.status === "partially_settled" || event.status === "settled") {
      throw new ConflictError(
        "This event already has an active or completed settlement flow",
        {
          code: "EVENT_SETTLEMENT_ALREADY_STARTED",
        },
      );
    }

    if (event.status === "cancelled") {
      throw new ConflictError("Cancelled events cannot be settled", {
        code: "EVENT_SETTLEMENT_STATUS_INVALID",
      });
    }

    const activeSettlements = (
      await new SettlementsRepository(this.db).listByEvent(event.id)
    ).filter((settlement) => settlement.status !== "cancelled");
    if (activeSettlements.length > 0) {
      throw new ConflictError(
        "This event already has an active settlement and cannot be settled again in the MVP flow",
        {
          code: "EVENT_ACTIVE_SETTLEMENT_EXISTS",
        },
      );
    }

    const recipients = this.prepareRecipients(input);

    let workingSettlement: SettlementRecord | null = null;

    try {
      const draftSettlement = await settlementLifecycle.settleEvent({
        ...input,
        eventId: event.id,
      });
      workingSettlement = await settlementLifecycle.markCalculated(draftSettlement.id);

      const allocations: SettlementAllocationRecord[] = [];
      for (const recipient of recipients) {
        const allocation = await allocationLifecycle.createPendingAllocation({
          amount: recipient.amount,
          characterId: recipient.characterId,
          ratio: recipient.ratio,
          settlementId: workingSettlement.id,
          weight: recipient.weight,
        });
        allocations.push(allocation);
      }

      const updatedEvent = await eventLifecycle.syncStatusFromSettlements(event.id);

      return {
        allocations,
        event: updatedEvent,
        settlement: workingSettlement,
      };
    } catch (error) {
      if (workingSettlement) {
        await this.rollbackSettlementFailure({
          eventId: event.id,
          settlement: workingSettlement,
        });
      }

      throw error;
    }
  }

  private async rollbackSettlementFailure(input: {
    eventId: number;
    settlement: SettlementRecord;
  }) {
    try {
      await new SettlementLifecycleService(this.db).cancelSettlement(
        input.settlement.id,
      );
    } catch {
      // Best-effort compensation keeps the original database error as the primary failure.
    }

    try {
      await new EventLifecycleService(this.db).syncStatusFromSettlements(input.eventId);
    } catch {
      // Best-effort compensation keeps the original database error as the primary failure.
    }
  }

  private prepareRecipients(
    input: SettleEventWithAllocationsInput,
  ): PreparedRecipient[] {
    const mode = input.allocationMode ?? "equal";
    const rawRecipients = this.normalizeRecipients(input);

    if (rawRecipients.length === 0) {
      throw new ConflictError("Settlement requires at least one recipient", {
        code: "SETTLEMENT_RECIPIENTS_REQUIRED",
      });
    }

    const seen = new Set<number>();
    for (const recipient of rawRecipients) {
      if (seen.has(recipient.characterId)) {
        throw new ConflictError("Settlement recipients must be unique", {
          code: "SETTLEMENT_RECIPIENT_DUPLICATE",
        });
      }
      seen.add(recipient.characterId);
    }

    const hasExplicitAmounts = rawRecipients.every(
      (recipient) => recipient.amount !== undefined,
    );

    if (hasExplicitAmounts) {
      const allocations = rawRecipients.map((recipient) => ({
        amount: recipient.amount ?? 0,
        characterId: recipient.characterId,
        ratio: recipient.ratio ?? null,
        weight: recipient.weight ?? 1,
      }));

      this.assertAllocationTotalMatchesNetAmount(
        allocations.map((recipient) => recipient.amount),
        input.netAmount,
      );

      return allocations;
    }

    if (mode === "manual") {
      throw new ConflictError(
        "Manual settlement allocation requires an explicit amount for every recipient",
        {
          code: "SETTLEMENT_RECIPIENT_AMOUNT_REQUIRED",
        },
      );
    }

    if (mode === "weight") {
      return this.buildWeightedRecipients(rawRecipients, input.netAmount);
    }

    return this.buildEqualRecipients(rawRecipients, input.netAmount);
  }

  private normalizeRecipients(
    input: SettleEventWithAllocationsInput,
  ): SettleEventRecipientInput[] {
    if (input.recipients && input.recipients.length > 0) {
      return input.recipients;
    }

    return (input.recipientCharacterIds ?? []).map((characterId) => ({
      characterId,
    }));
  }

  private buildEqualRecipients(
    recipients: SettleEventRecipientInput[],
    totalAmount: number,
  ): PreparedRecipient[] {
    const ratio = recipients.length === 0 ? 0 : 1 / recipients.length;
    const baseAmount = recipients.length === 0 ? 0 : totalAmount / recipients.length;

    return recipients.map((recipient, index) => ({
      amount:
        index === recipients.length - 1
          ? totalAmount - baseAmount * (recipients.length - 1)
          : baseAmount,
      characterId: recipient.characterId,
      ratio: recipient.ratio ?? ratio,
      weight: recipient.weight ?? 1,
    }));
  }

  private buildWeightedRecipients(
    recipients: SettleEventRecipientInput[],
    totalAmount: number,
  ): PreparedRecipient[] {
    const weights = recipients.map((recipient) => recipient.weight ?? 1);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
      throw new ConflictError("Weighted settlement allocation requires positive weights", {
        code: "SETTLEMENT_RECIPIENT_WEIGHT_INVALID",
      });
    }

    let distributed = 0;
    return recipients.map((recipient, index) => {
      const weight = recipient.weight ?? 1;
      const amount =
        index === recipients.length - 1
          ? totalAmount - distributed
          : (totalAmount * weight) / totalWeight;
      distributed += amount;

      return {
        amount,
        characterId: recipient.characterId,
        ratio: recipient.ratio ?? weight / totalWeight,
        weight,
      };
    });
  }

  private assertAllocationTotalMatchesNetAmount(
    amounts: number[],
    netAmount: number,
  ) {
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    if (Math.abs(total - netAmount) > AMOUNT_EPSILON) {
      throw new ConflictError(
        "Settlement allocation total must match the settlement net amount",
        {
          code: "SETTLEMENT_ALLOCATION_TOTAL_MISMATCH",
        },
      );
    }
  }
}
