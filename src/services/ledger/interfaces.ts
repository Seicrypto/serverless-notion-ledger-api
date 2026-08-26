import type {
  CreateEventInput,
  CreateSettlementAllocationInput,
  CreateSettlementClaimInput,
  CreateSettlementInput,
  EventRecord,
  SettlementAllocationRecord,
  SettlementClaimRecord,
  SettlementRecord,
} from "../../repositories/types";

export interface EventLifecyclePort {
  createEvent(input: CreateEventInput): Promise<EventRecord>;
  cancelEvent(eventId: number): Promise<EventRecord>;
  markReadyForSettlement(eventId: number): Promise<EventRecord>;
  syncStatusFromSettlements(eventId: number): Promise<EventRecord>;
}

export interface SettlementLifecyclePort {
  cancelSettlement(settlementId: number): Promise<SettlementRecord>;
  createDraftSettlement(input: CreateSettlementInput): Promise<SettlementRecord>;
  markCalculated(settlementId: number): Promise<SettlementRecord>;
  markPaid(settlementId: number): Promise<SettlementRecord>;
  startPaying(settlementId: number): Promise<SettlementRecord>;
  syncStatusFromAllocations(settlementId: number): Promise<SettlementRecord>;
}

export interface AllocationLifecyclePort {
  createPendingAllocation(
    input: CreateSettlementAllocationInput,
  ): Promise<SettlementAllocationRecord>;
  markClaimed(allocationId: number): Promise<SettlementAllocationRecord>;
  waiveAllocation(allocationId: number): Promise<SettlementAllocationRecord>;
  cancelAllocation(allocationId: number): Promise<SettlementAllocationRecord>;
}

export interface ClaimLifecyclePort {
  confirmClaim(
    claimId: number,
    confirmedByUserId?: number | null,
  ): Promise<SettlementClaimRecord>;
  recordClaim(input: CreateSettlementClaimInput): Promise<SettlementClaimRecord>;
  voidClaim(
    claimId: number,
    voidedByUserId?: number | null,
  ): Promise<SettlementClaimRecord>;
}
