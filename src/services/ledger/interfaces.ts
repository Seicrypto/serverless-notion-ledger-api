import type {
  CreateEventInput,
  CreateSettlementAllocationInput,
  CreateSettlementClaimInput,
  CreateSettlementInput,
  EventRecord,
  EventStatus,
  SettlementAllocationStatus,
  SettlementAllocationRecord,
  SettlementClaimRecord,
  SettlementClaimStatus,
  SettlementClaimMethod,
  SettlementRecord,
  SettlementStatus,
} from "../../repositories/types";

export interface CreateManagedEventInput
  extends Omit<CreateEventInput, "eventKey"> {
  eventKey?: string;
}

export interface CreateManagedSettlementInput
  extends Omit<CreateSettlementInput, "settlementKey"> {
  settlementKey?: string;
}

export interface EventLifecyclePort {
  createEvent(input: CreateManagedEventInput): Promise<EventRecord>;
  cancelEvent(eventId: number): Promise<EventRecord>;
  markReadyForSettlement(eventId: number): Promise<EventRecord>;
  syncStatusFromSettlements(eventId: number): Promise<EventRecord>;
  transitionStatus(eventId: number, nextStatus: EventStatus): Promise<EventRecord>;
}

export interface SettlementLifecyclePort {
  cancelSettlement(settlementId: number): Promise<SettlementRecord>;
  createDraftSettlement(input: CreateManagedSettlementInput): Promise<SettlementRecord>;
  markCalculated(settlementId: number): Promise<SettlementRecord>;
  markPaid(settlementId: number): Promise<SettlementRecord>;
  startPaying(settlementId: number): Promise<SettlementRecord>;
  syncStatusFromAllocations(settlementId: number): Promise<SettlementRecord>;
  transitionStatus(
    settlementId: number,
    nextStatus: SettlementStatus,
  ): Promise<SettlementRecord>;
}

export interface AllocationLifecyclePort {
  createPendingAllocation(
    input: CreateSettlementAllocationInput,
  ): Promise<SettlementAllocationRecord>;
  markClaimed(allocationId: number): Promise<SettlementAllocationRecord>;
  waiveAllocation(allocationId: number): Promise<SettlementAllocationRecord>;
  cancelAllocation(allocationId: number): Promise<SettlementAllocationRecord>;
  transitionStatus(
    allocationId: number,
    nextStatus: SettlementAllocationStatus,
  ): Promise<SettlementAllocationRecord>;
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
  transitionStatus(
    claimId: number,
    nextStatus: SettlementClaimStatus,
    actedByUserId?: number | null,
  ): Promise<SettlementClaimRecord>;
}

export interface SettlementDisbursementPort {
  disburseSettlement(input: {
    claimedAt: string;
    items: Array<{
      amount: number;
      characterId: number;
      ratio?: number | null;
      weight?: number;
    }>;
    method?: SettlementClaimMethod;
    notes?: string | null;
    organizationId: number;
    settlementId: number;
  }): Promise<{
    allocationMode: "created" | "matched";
    allocations: SettlementAllocationRecord[];
    claims: SettlementClaimRecord[];
    settlement: SettlementRecord;
    settlementStatusChanged: boolean;
  }>;
}
