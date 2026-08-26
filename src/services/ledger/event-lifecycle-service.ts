import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { EventsRepository } from "../../repositories/events-repository";
import { SettlementsRepository } from "../../repositories/settlements-repository";
import type { CreateEventInput, EventRecord } from "../../repositories/types";
import type { EventLifecyclePort } from "./interfaces";
import { eventStateMachine } from "./state-machines/event-state-machine";

export class EventLifecycleService implements EventLifecyclePort {
  constructor(private readonly db: DatabaseClient) {}

  async createEvent(input: CreateEventInput): Promise<EventRecord> {
    const repository = new EventsRepository(this.db);
    return repository.create({
      ...input,
      status: input.status ?? "open",
    });
  }

  async markReadyForSettlement(eventId: number): Promise<EventRecord> {
    const repository = new EventsRepository(this.db);
    const event = await this.requireEvent(eventId);
    eventStateMachine.assertTransition(event.status, "ready_for_settlement");
    return repository.update(eventId, {
      status: "ready_for_settlement",
    });
  }

  async cancelEvent(eventId: number): Promise<EventRecord> {
    const repository = new EventsRepository(this.db);
    const event = await this.requireEvent(eventId);
    eventStateMachine.assertTransition(event.status, "cancelled");
    return repository.update(eventId, {
      status: "cancelled",
    });
  }

  async syncStatusFromSettlements(eventId: number): Promise<EventRecord> {
    const repository = new EventsRepository(this.db);
    const settlementsRepository = new SettlementsRepository(this.db);
    const event = await this.requireEvent(eventId);
    const settlements = await settlementsRepository.listByEvent(eventId);
    const activeSettlements = settlements.filter(
      (settlement) => settlement.status !== "cancelled",
    );

    if (activeSettlements.length === 0) {
      if (event.status === "partially_settled") {
        return repository.update(eventId, {
          status: "ready_for_settlement",
        });
      }

      return event;
    }

    const allTerminal = activeSettlements.every(
      (settlement) => settlement.status === "paid",
    );

    if (allTerminal && event.status === "partially_settled") {
      return repository.update(eventId, {
        status: "settled",
      });
    }

    if (!allTerminal && event.status === "ready_for_settlement") {
      return repository.update(eventId, {
        status: "partially_settled",
      });
    }

    if (!allTerminal && event.status === "open") {
      throw new ConflictError(
        "Open event cannot have active settlements before being marked ready",
        {
          code: "EVENT_NOT_READY_FOR_SETTLEMENT",
        },
      );
    }

    return event;
  }

  private async requireEvent(eventId: number): Promise<EventRecord> {
    const repository = new EventsRepository(this.db);
    const event = await repository.findById(eventId);

    if (!event) {
      throw new NotFoundError("Event not found");
    }

    return event;
  }
}
