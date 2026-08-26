import type {
  EventStatus,
  SettlementAllocationStatus,
  SettlementClaimStatus,
  SettlementStatus,
} from "../../../repositories/types";
import { InvalidStateTransitionError } from "../errors";

export interface StateMachine<TState extends string> {
  allowedTransitions(current: TState): readonly TState[];
  assertTransition(current: TState, next: TState): void;
}

export function createStateMachine<TState extends string>(
  entity: string,
  transitions: Record<TState, readonly TState[]>,
): StateMachine<TState> {
  return {
    allowedTransitions(current) {
      return transitions[current] ?? [];
    },
    assertTransition(current, next) {
      if (current === next) {
        return;
      }

      const allowed = transitions[current] ?? [];
      if (!allowed.includes(next)) {
        throw new InvalidStateTransitionError(entity, current, next);
      }
    },
  };
}

export function isTerminalAllocationStatus(
  status: SettlementAllocationStatus,
): boolean {
  return status === "claimed" || status === "waived" || status === "cancelled";
}

export function isTerminalSettlementStatus(status: SettlementStatus): boolean {
  return status === "paid" || status === "cancelled";
}

export function isActiveEventStatus(status: EventStatus): boolean {
  return (
    status === "open" ||
    status === "ready_for_settlement" ||
    status === "partially_settled"
  );
}

export function isConfirmedClaimStatus(status: SettlementClaimStatus): boolean {
  return status === "confirmed";
}
