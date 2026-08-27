import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { EventsRepository } from "../../repositories/events-repository";
import { OrganizationGamesRepository } from "../../repositories/organization-games-repository";
import { SettlementsRepository } from "../../repositories/settlements-repository";
import { AssetTrustLifecycleService } from "../assets/asset-trust-lifecycle-service";
import type {
  EventRecord,
  EventStatus,
} from "../../repositories/types";
import type {
  CreateManagedEventInput,
  EventLifecyclePort,
} from "./interfaces";
import { eventStateMachine } from "./state-machines/event-state-machine";

export class EventLifecycleService implements EventLifecyclePort {
  constructor(private readonly db: DatabaseClient) {}

  async createEvent(input: CreateManagedEventInput): Promise<EventRecord> {
    const repository = new EventsRepository(this.db);
    const gameId =
      input.gameId === undefined ? await this.resolvePrimaryGameId(input.organizationId) : input.gameId;

    const created = await repository.create({
      ...input,
      eventKey: input.eventKey || `evt-${randomUUID().slice(0, 12)}`,
      gameId,
      status: input.status ?? "open",
    });

    if (created.asset_id) {
      await new AssetTrustLifecycleService(this.db).recomputeStatus(created.asset_id);
    }

    return created;
  }

  async transitionStatus(
    eventId: number,
    nextStatus: EventStatus,
  ): Promise<EventRecord> {
    switch (nextStatus) {
      case "ready_for_settlement":
        return this.markReadyForSettlement(eventId);
      case "cancelled":
        return this.cancelEvent(eventId);
      case "open":
      case "partially_settled":
      case "settled":
        throw new ConflictError("This event status is managed by lifecycle rules", {
          code: "EVENT_STATUS_MANAGED",
        });
      default:
        throw new ConflictError("Unsupported event status transition", {
          code: "EVENT_STATUS_UNSUPPORTED",
        });
    }
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

  private async resolvePrimaryGameId(
    organizationId: number,
  ): Promise<number | null | undefined> {
    const organizationGames = await new OrganizationGamesRepository(
      this.db,
    ).listByOrganization(organizationId);
    return organizationGames.find((game) => game.is_primary === 1)?.game_id ?? null;
  }
}
