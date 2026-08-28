import type { SettlementStatus } from "../../../repositories/types";
import { createStateMachine } from "./shared";

export const settlementStateMachine = createStateMachine<SettlementStatus>(
  "settlement",
  {
    draft: ["calculated", "cancelled"],
    calculated: ["paying", "cancelled"],
    paying: ["paid"],
    paid: [],
    cancelled: [],
  },
);
