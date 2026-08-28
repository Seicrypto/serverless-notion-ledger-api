import type { DatabaseClient } from "../infrastructure/database/database-client";
import type { CreateEventInput, EventRecord, UpdateEventInput } from "./types";
import { nowIso } from "./utils";

export class EventsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateEventInput): Promise<EventRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<EventRecord>(
      `INSERT INTO events (
        organization_id,
        game_id,
        asset_id,
        event_key,
        title,
        event_type,
        occurred_at,
        holder_type,
        holder_ref,
        status,
        notes,
        source_type,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.organizationId,
      input.gameId ?? null,
      input.assetId ?? null,
      input.eventKey,
      input.title,
      input.eventType ?? "loot",
      input.occurredAt,
      input.holderType ?? "character",
      input.holderRef ?? null,
      input.status ?? "open",
      input.notes ?? null,
      input.sourceType ?? "manual",
      input.createdByUserId ?? null,
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create event");
    }

    return created;
  }

  async findById(id: number): Promise<EventRecord | null> {
    return this.db.first<EventRecord>(`SELECT * FROM events WHERE id = ?`, id);
  }

  async listByOrganization(organizationId: number): Promise<EventRecord[]> {
    return this.db.all<EventRecord>(
      `SELECT * FROM events
       WHERE organization_id = ?
       ORDER BY occurred_at DESC, id DESC`,
      organizationId,
    );
  }

  async update(id: number, input: UpdateEventInput): Promise<EventRecord> {
    const existing = await this.findByIdOrThrow(id);
    const updated = await this.db.first<EventRecord>(
      `UPDATE events
       SET game_id = ?,
           asset_id = ?,
           event_key = ?,
           title = ?,
           event_type = ?,
           occurred_at = ?,
           holder_type = ?,
           holder_ref = ?,
           status = ?,
           notes = ?,
           source_type = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.gameId === undefined ? existing.game_id : input.gameId,
      input.assetId === undefined ? existing.asset_id : input.assetId,
      input.eventKey ?? existing.event_key,
      input.title ?? existing.title,
      input.eventType ?? existing.event_type,
      input.occurredAt ?? existing.occurred_at,
      input.holderType ?? existing.holder_type,
      input.holderRef === undefined ? existing.holder_ref : input.holderRef,
      input.status ?? existing.status,
      input.notes === undefined ? existing.notes : input.notes,
      input.sourceType ?? existing.source_type,
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update event ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(id: number): Promise<EventRecord> {
    const record = await this.findById(id);
    if (!record) {
      throw new Error(`Event ${id} not found`);
    }

    return record;
  }
}
