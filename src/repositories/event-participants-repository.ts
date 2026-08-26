import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CreateEventParticipantInput,
  EventParticipantRecord,
  UpdateEventParticipantInput,
} from "./types";
import { nowIso } from "./utils";

export class EventParticipantsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateEventParticipantInput): Promise<EventParticipantRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<EventParticipantRecord>(
      `INSERT INTO event_participants (
        event_id,
        character_id,
        role_label,
        weight,
        joined_at,
        left_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.eventId,
      input.characterId ?? null,
      input.roleLabel ?? null,
      input.weight ?? 1,
      input.joinedAt ?? null,
      input.leftAt ?? null,
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create event participant");
    }

    return created;
  }

  async findById(id: number): Promise<EventParticipantRecord | null> {
    return this.db.first<EventParticipantRecord>(
      `SELECT * FROM event_participants WHERE id = ?`,
      id,
    );
  }

  async listByEvent(eventId: number): Promise<EventParticipantRecord[]> {
    return this.db.all<EventParticipantRecord>(
      `SELECT * FROM event_participants
       WHERE event_id = ?
       ORDER BY id ASC`,
      eventId,
    );
  }

  async update(
    id: number,
    input: UpdateEventParticipantInput,
  ): Promise<EventParticipantRecord> {
    const existing = await this.findByIdOrThrow(id);
    const updated = await this.db.first<EventParticipantRecord>(
      `UPDATE event_participants
       SET character_id = ?,
           role_label = ?,
           weight = ?,
           joined_at = ?,
           left_at = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.characterId === undefined ? existing.character_id : input.characterId,
      input.roleLabel === undefined ? existing.role_label : input.roleLabel,
      input.weight ?? existing.weight,
      input.joinedAt === undefined ? existing.joined_at : input.joinedAt,
      input.leftAt === undefined ? existing.left_at : input.leftAt,
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update event participant ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(id: number): Promise<EventParticipantRecord> {
    const record = await this.findById(id);
    if (!record) {
      throw new Error(`Event participant ${id} not found`);
    }

    return record;
  }
}
