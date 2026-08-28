import type { SettlementAllocationStatus } from "../../../repositories/types";
import { createStateMachine } from "./shared";

export const allocationStateMachine =
  createStateMachine<SettlementAllocationStatus>("allocation", {
    pending: ["claimed", "waived", "cancelled"],
    claimed: [],
    waived: [],
    cancelled: [],
  });
