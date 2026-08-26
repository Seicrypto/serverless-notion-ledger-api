import { ConflictError } from "../../lib/errors";

export class InvalidStateTransitionError extends ConflictError {
  constructor(
    entity: string,
    currentStatus: string,
    nextStatus: string,
    details?: string,
  ) {
    super(
      details
        ? `Cannot transition ${entity} from ${currentStatus} to ${nextStatus}: ${details}`
        : `Cannot transition ${entity} from ${currentStatus} to ${nextStatus}`,
      {
        code: "INVALID_STATE_TRANSITION",
      },
    );
    this.name = "InvalidStateTransitionError";
  }
}
