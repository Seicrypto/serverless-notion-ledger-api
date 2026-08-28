import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CreateSettlementClaimInput,
  SettlementClaimRecord,
  UpdateSettlementClaimInput,
} from "./types";
import { nowIso } from "./utils";

export class SettlementClaimsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateSettlementClaimInput): Promise<SettlementClaimRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<SettlementClaimRecord>(
      `INSERT INTO settlement_claims (
        settlement_allocation_id,
        claimed_by_character_id,
        claimed_at,
        amount,
        status,
        method,
        confirmed_at,
        confirmed_by_user_id,
        voided_at,
        voided_by_user_id,
        notes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.settlementAllocationId,
      input.claimedByCharacterId ?? null,
      input.claimedAt,
      input.amount,
      input.status ?? "recorded",
      input.method ?? "manual",
      input.confirmedAt ?? null,
      input.confirmedByUserId ?? null,
      input.voidedAt ?? null,
      input.voidedByUserId ?? null,
      input.notes ?? null,
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create settlement claim");
    }

    return created;
  }

  async findById(id: number): Promise<SettlementClaimRecord | null> {
    return this.db.first<SettlementClaimRecord>(
      `SELECT * FROM settlement_claims WHERE id = ?`,
      id,
    );
  }

  async listByAllocation(
    settlementAllocationId: number,
  ): Promise<SettlementClaimRecord[]> {
    return this.db.all<SettlementClaimRecord>(
      `SELECT * FROM settlement_claims
       WHERE settlement_allocation_id = ?
       ORDER BY id ASC`,
      settlementAllocationId,
    );
  }

  async update(
    id: number,
    input: UpdateSettlementClaimInput,
  ): Promise<SettlementClaimRecord> {
    const existing = await this.findByIdOrThrow(id);
    const updated = await this.db.first<SettlementClaimRecord>(
      `UPDATE settlement_claims
       SET claimed_by_character_id = ?,
           claimed_at = ?,
           amount = ?,
           status = ?,
           method = ?,
           confirmed_at = ?,
           confirmed_by_user_id = ?,
           voided_at = ?,
           voided_by_user_id = ?,
           notes = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.claimedByCharacterId === undefined
        ? existing.claimed_by_character_id
        : input.claimedByCharacterId,
      input.claimedAt ?? existing.claimed_at,
      input.amount ?? existing.amount,
      input.status ?? existing.status,
      input.method ?? existing.method,
      input.confirmedAt === undefined ? existing.confirmed_at : input.confirmedAt,
      input.confirmedByUserId === undefined
        ? existing.confirmed_by_user_id
        : input.confirmedByUserId,
      input.voidedAt === undefined ? existing.voided_at : input.voidedAt,
      input.voidedByUserId === undefined
        ? existing.voided_by_user_id
        : input.voidedByUserId,
      input.notes === undefined ? existing.notes : input.notes,
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update settlement claim ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(id: number): Promise<SettlementClaimRecord> {
    const record = await this.findById(id);
    if (!record) {
      throw new Error(`Settlement claim ${id} not found`);
    }

    return record;
  }
}
