import type { EventStatus } from "../../../repositories/types";
import { createStateMachine } from "./shared";

export const eventStateMachine = createStateMachine<EventStatus>("event", {
  open: ["ready_for_settlement", "cancelled"],
  ready_for_settlement: ["partially_settled", "cancelled"],
  partially_settled: ["ready_for_settlement", "settled", "cancelled"],
  settled: [],
  cancelled: [],
});
