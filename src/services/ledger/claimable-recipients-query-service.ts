import type { DatabaseClient } from "../../infrastructure/database/database-client";
import type {
  EventStatus,
  EventType,
  SettlementStatus,
  SettlementType,
} from "../../repositories/types";

type ClaimableAllocationRow = {
  allocation_amount: number;
  allocation_id: number;
  allocation_ratio: number | null;
  allocation_weight: number;
  character_id: number;
  character_name: string;
  event_id: number | null;
  event_key: string | null;
  event_occurred_at: string | null;
  event_status: EventStatus | null;
  event_title: string | null;
  event_type: EventType | null;
  member_display_name: string | null;
  member_email: string | null;
  member_user_id: number | null;
  settlement_decided_at: string;
  settlement_id: number;
  settlement_key: string;
  settlement_status: SettlementStatus;
  settlement_title: string;
  settlement_type: SettlementType;
  unit_asset_id: number | null;
  unit_asset_name: string | null;
};

export type ClaimableUnitBreakdown = {
  allocationCount: number;
  amountTotal: number;
  unitAssetId: number | null;
  unitAssetName: string | null;
};

export type ClaimableRecipientSummary = {
  characterId: number;
  characterName: string;
  hasSiblingCharactersPending: boolean;
  memberDisplayName: string | null;
  memberUserId: number | null;
  pendingAllocationCount: number;
  pendingClaimAmountTotal: number;
  pendingUnitBreakdown: ClaimableUnitBreakdown[];
};

export type ClaimableRecipientDetailAllocation = {
  allocationId: number;
  amount: number;
  eventId: number | null;
  eventKey: string | null;
  eventOccurredAt: string | null;
  eventStatus: EventStatus | null;
  eventTitle: string | null;
  eventType: EventType | null;
  ratio: number | null;
  settlementDecidedAt: string;
  settlementId: number;
  settlementKey: string;
  settlementStatus: SettlementStatus;
  settlementTitle: string;
  settlementType: SettlementType;
  unitAssetId: number | null;
  unitAssetName: string | null;
  weight: number;
};

export type ClaimableRecipientDetail = {
  allocations: ClaimableRecipientDetailAllocation[];
  recipient: ClaimableRecipientSummary;
  siblingCharacters: ClaimableRecipientSummary[];
  unitBreakdown: ClaimableUnitBreakdown[];
};

export class ClaimableRecipientsQueryService {
  constructor(private readonly db: DatabaseClient) {}

  async listClaimableRecipients(
    organizationId: number,
  ): Promise<ClaimableRecipientSummary[]> {
    const rows = await this.listClaimableRows(organizationId);
    return this.buildSummaries(rows);
  }

  async getClaimableRecipientDetail(input: {
    characterId: number;
    includeSiblingCharacters?: boolean;
    organizationId: number;
  }): Promise<ClaimableRecipientDetail> {
    const rows = await this.listClaimableRows(input.organizationId);
    const summaries = this.buildSummaries(rows);
    const summary =
      summaries.find((candidate) => candidate.characterId === input.characterId) ?? null;

    const characterRows = rows.filter(
      (row) => row.character_id === input.characterId,
    );

    const recipient: ClaimableRecipientSummary = summary ?? {
      characterId: input.characterId,
      characterName: characterRows[0]?.character_name ?? "",
      hasSiblingCharactersPending: false,
      memberDisplayName:
        characterRows[0]?.member_display_name ?? characterRows[0]?.member_email ?? null,
      memberUserId: characterRows[0]?.member_user_id ?? null,
      pendingAllocationCount: 0,
      pendingClaimAmountTotal: 0,
      pendingUnitBreakdown: [],
    };

    const siblingCharacters =
      input.includeSiblingCharacters && recipient.memberUserId
        ? summaries.filter(
            (candidate) =>
              candidate.memberUserId === recipient.memberUserId &&
              candidate.characterId !== recipient.characterId,
          )
        : [];

    return {
      allocations: characterRows.map((row) => ({
        allocationId: row.allocation_id,
        amount: row.allocation_amount,
        eventId: row.event_id,
        eventKey: row.event_key,
        eventOccurredAt: row.event_occurred_at,
        eventStatus: row.event_status,
        eventTitle: row.event_title,
        eventType: row.event_type,
        ratio: row.allocation_ratio,
        settlementDecidedAt: row.settlement_decided_at,
        settlementId: row.settlement_id,
        settlementKey: row.settlement_key,
        settlementStatus: row.settlement_status,
        settlementTitle: row.settlement_title,
        settlementType: row.settlement_type,
        unitAssetId: row.unit_asset_id,
        unitAssetName: row.unit_asset_name,
        weight: row.allocation_weight,
      })),
      recipient,
      siblingCharacters,
      unitBreakdown: recipient.pendingUnitBreakdown,
    };
  }

  private async listClaimableRows(
    organizationId: number,
  ): Promise<ClaimableAllocationRow[]> {
    return this.db.all<ClaimableAllocationRow>(
      `SELECT
         sa.id AS allocation_id,
         sa.amount AS allocation_amount,
         sa.ratio AS allocation_ratio,
         sa.weight AS allocation_weight,
         c.id AS character_id,
         c.name AS character_name,
         c.claimed_by_user_id AS member_user_id,
         u.display_name AS member_display_name,
         u.email AS member_email,
         s.id AS settlement_id,
         s.settlement_key AS settlement_key,
         s.title AS settlement_title,
         s.settlement_type AS settlement_type,
         s.status AS settlement_status,
         s.decided_at AS settlement_decided_at,
         s.unit_asset_id AS unit_asset_id,
         unit_asset.name AS unit_asset_name,
         e.id AS event_id,
         e.event_key AS event_key,
         e.title AS event_title,
         e.event_type AS event_type,
         e.occurred_at AS event_occurred_at,
         e.status AS event_status
       FROM settlement_allocations sa
       INNER JOIN settlements s
         ON s.id = sa.settlement_id
       INNER JOIN characters c
         ON c.id = sa.character_id
       LEFT JOIN users u
         ON u.id = c.claimed_by_user_id
       LEFT JOIN assets unit_asset
         ON unit_asset.id = s.unit_asset_id
       LEFT JOIN events e
         ON e.id = s.event_id
       WHERE s.organization_id = ?
         AND sa.status = 'pending'
         AND s.status IN ('draft', 'calculated', 'paying')
         AND NOT EXISTS (
           SELECT 1
           FROM settlement_claims sc
           WHERE sc.settlement_allocation_id = sa.id
             AND sc.status != 'voided'
         )
       ORDER BY c.name ASC, sa.id ASC`,
      organizationId,
    );
  }

  private buildSummaries(
    rows: ClaimableAllocationRow[],
  ): ClaimableRecipientSummary[] {
    const memberCharacterCounts = new Map<number, Set<number>>();
    for (const row of rows) {
      if (!row.member_user_id) {
        continue;
      }

      const existing = memberCharacterCounts.get(row.member_user_id) ?? new Set<number>();
      existing.add(row.character_id);
      memberCharacterCounts.set(row.member_user_id, existing);
    }

    const summaryMap = new Map<number, ClaimableRecipientSummary>();
    const unitMaps = new Map<number, Map<string, ClaimableUnitBreakdown>>();

    for (const row of rows) {
      if (!summaryMap.has(row.character_id)) {
        summaryMap.set(row.character_id, {
          characterId: row.character_id,
          characterName: row.character_name,
          hasSiblingCharactersPending:
            row.member_user_id !== null &&
            (memberCharacterCounts.get(row.member_user_id)?.size ?? 0) > 1,
          memberDisplayName: row.member_display_name ?? row.member_email ?? null,
          memberUserId: row.member_user_id,
          pendingAllocationCount: 0,
          pendingClaimAmountTotal: 0,
          pendingUnitBreakdown: [],
        });
        unitMaps.set(row.character_id, new Map<string, ClaimableUnitBreakdown>());
      }

      const summary = summaryMap.get(row.character_id);
      const unitMap = unitMaps.get(row.character_id);
      if (!summary || !unitMap) {
        continue;
      }

      summary.pendingAllocationCount += 1;
      summary.pendingClaimAmountTotal += row.allocation_amount;

      const unitKey = `${row.unit_asset_id ?? "null"}:${row.unit_asset_name ?? ""}`;
      const breakdown = unitMap.get(unitKey) ?? {
        allocationCount: 0,
        amountTotal: 0,
        unitAssetId: row.unit_asset_id,
        unitAssetName: row.unit_asset_name,
      };

      breakdown.allocationCount += 1;
      breakdown.amountTotal += row.allocation_amount;
      unitMap.set(unitKey, breakdown);
    }

    return [...summaryMap.values()].map((summary) => ({
      ...summary,
      pendingUnitBreakdown: [
        ...(unitMaps.get(summary.characterId)?.values() ?? []),
      ],
    }));
  }
}
