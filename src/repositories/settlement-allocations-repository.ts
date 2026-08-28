import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CreateSettlementAllocationInput,
  SettlementAllocationRecord,
  UpdateSettlementAllocationInput,
} from "./types";
import { nowIso } from "./utils";

export class SettlementAllocationsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(
    input: CreateSettlementAllocationInput,
  ): Promise<SettlementAllocationRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<SettlementAllocationRecord>(
      `INSERT INTO settlement_allocations (
        settlement_id,
        character_id,
        weight,
        ratio,
        amount,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.settlementId,
      input.characterId ?? null,
      input.weight ?? 1,
      input.ratio ?? null,
      input.amount,
      input.status ?? "pending",
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create settlement allocation");
    }

    return created;
  }

  async findById(id: number): Promise<SettlementAllocationRecord | null> {
    return this.db.first<SettlementAllocationRecord>(
      `SELECT * FROM settlement_allocations WHERE id = ?`,
      id,
    );
  }

  async listBySettlement(settlementId: number): Promise<SettlementAllocationRecord[]> {
    return this.db.all<SettlementAllocationRecord>(
      `SELECT * FROM settlement_allocations
       WHERE settlement_id = ?
       ORDER BY id ASC`,
      settlementId,
    );
  }

  async update(
    id: number,
    input: UpdateSettlementAllocationInput,
  ): Promise<SettlementAllocationRecord> {
    const existing = await this.findByIdOrThrow(id);
    const updated = await this.db.first<SettlementAllocationRecord>(
      `UPDATE settlement_allocations
       SET character_id = ?,
           weight = ?,
           ratio = ?,
           amount = ?,
           status = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.characterId === undefined ? existing.character_id : input.characterId,
      input.weight ?? existing.weight,
      input.ratio === undefined ? existing.ratio : input.ratio,
      input.amount ?? existing.amount,
      input.status ?? existing.status,
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update settlement allocation ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(id: number): Promise<SettlementAllocationRecord> {
    const record = await this.findById(id);
    if (!record) {
      throw new Error(`Settlement allocation ${id} not found`);
    }

    return record;
  }
}
