import type { SettlementClaimStatus } from "../../../repositories/types";
import { createStateMachine } from "./shared";

export const claimStateMachine = createStateMachine<SettlementClaimStatus>(
  "claim",
  {
    recorded: ["confirmed", "voided"],
    confirmed: ["voided"],
    voided: [],
  },
);
