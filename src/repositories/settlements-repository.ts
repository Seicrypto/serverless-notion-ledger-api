import type { DatabaseClient } from "../infrastructure/database/database-client";
import type {
  CreateSettlementInput,
  SettlementRecord,
  UpdateSettlementInput,
} from "./types";
import { nowIso } from "./utils";

export class SettlementsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateSettlementInput): Promise<SettlementRecord> {
    const timestamp = nowIso();
    const created = await this.db.first<SettlementRecord>(
      `INSERT INTO settlements (
        organization_id,
        event_id,
        settlement_key,
        title,
        settlement_type,
        decided_at,
        gross_amount,
        fee_mode,
        fee_rule_key,
        fee_percent,
        fee_amount,
        net_amount,
        unit_asset_id,
        payer_type,
        payer_ref,
        allocation_mode,
        status,
        notes,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      input.organizationId,
      input.eventId ?? null,
      input.settlementKey,
      input.title,
      input.settlementType ?? "sale",
      input.decidedAt,
      input.grossAmount,
      input.feeMode ?? "none",
      input.feeRuleKey ?? null,
      input.feePercent ?? null,
      input.feeAmount ?? null,
      input.netAmount,
      input.unitAssetId ?? null,
      input.payerType ?? "character",
      input.payerRef ?? null,
      input.allocationMode ?? "equal",
      input.status ?? "draft",
      input.notes ?? null,
      input.createdByUserId ?? null,
      timestamp,
      timestamp,
    );

    if (!created) {
      throw new Error("Failed to create settlement");
    }

    return created;
  }

  async findById(id: number): Promise<SettlementRecord | null> {
    return this.db.first<SettlementRecord>(
      `SELECT * FROM settlements WHERE id = ?`,
      id,
    );
  }

  async listByEvent(eventId: number): Promise<SettlementRecord[]> {
    return this.db.all<SettlementRecord>(
      `SELECT * FROM settlements
       WHERE event_id = ?
       ORDER BY decided_at ASC, id ASC`,
      eventId,
    );
  }

  async listByOrganization(organizationId: number): Promise<SettlementRecord[]> {
    return this.db.all<SettlementRecord>(
      `SELECT * FROM settlements
       WHERE organization_id = ?
       ORDER BY decided_at DESC, id DESC`,
      organizationId,
    );
  }

  async update(id: number, input: UpdateSettlementInput): Promise<SettlementRecord> {
    const existing = await this.findByIdOrThrow(id);
    const updated = await this.db.first<SettlementRecord>(
      `UPDATE settlements
       SET event_id = ?,
           settlement_key = ?,
           title = ?,
           settlement_type = ?,
           decided_at = ?,
           gross_amount = ?,
           fee_mode = ?,
           fee_rule_key = ?,
           fee_percent = ?,
           fee_amount = ?,
           net_amount = ?,
           unit_asset_id = ?,
           payer_type = ?,
           payer_ref = ?,
           allocation_mode = ?,
           status = ?,
           notes = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING *`,
      input.eventId === undefined ? existing.event_id : input.eventId,
      input.settlementKey ?? existing.settlement_key,
      input.title ?? existing.title,
      input.settlementType ?? existing.settlement_type,
      input.decidedAt ?? existing.decided_at,
      input.grossAmount ?? existing.gross_amount,
      input.feeMode ?? existing.fee_mode,
      input.feeRuleKey === undefined ? existing.fee_rule_key : input.feeRuleKey,
      input.feePercent === undefined ? existing.fee_percent : input.feePercent,
      input.feeAmount === undefined ? existing.fee_amount : input.feeAmount,
      input.netAmount ?? existing.net_amount,
      input.unitAssetId === undefined ? existing.unit_asset_id : input.unitAssetId,
      input.payerType ?? existing.payer_type,
      input.payerRef === undefined ? existing.payer_ref : input.payerRef,
      input.allocationMode ?? existing.allocation_mode,
      input.status ?? existing.status,
      input.notes === undefined ? existing.notes : input.notes,
      nowIso(),
      id,
    );

    if (!updated) {
      throw new Error(`Failed to update settlement ${id}`);
    }

    return updated;
  }

  private async findByIdOrThrow(id: number): Promise<SettlementRecord> {
    const record = await this.findById(id);
    if (!record) {
      throw new Error(`Settlement ${id} not found`);
    }

    return record;
  }
}
