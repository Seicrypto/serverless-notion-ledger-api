import type { DatabaseClient } from "../../infrastructure/database/database-client";
import type { SettlementClaimMethod, SettlementType } from "../../repositories/types";

type ClaimableRecipientRow = {
  allocation_amount: number;
  allocation_id: number;
  allocation_updated_at: string;
  character_game_id: number | null;
  character_id: number;
  character_name: string;
  event_game_id: number | null;
  event_id: number | null;
  event_occurred_at: string | null;
  event_status: string | null;
  event_title: string | null;
  member_display_name: string | null;
  member_email: string | null;
  member_user_id: number | null;
  settlement_decided_at: string;
  settlement_id: number;
  settlement_title: string;
  settlement_type: SettlementType;
  unit_asset_id: number | null;
  unit_asset_name: string | null;
};

type DisburseableAllocationRow = {
  active_claim_amount: number | null;
  active_claim_count: number | null;
  allocation_amount: number;
  allocation_id: number;
  character_id: number | null;
  character_name: string | null;
  decided_at: string;
  event_id: number | null;
  event_occurred_at: string | null;
  event_status: string | null;
  event_title: string | null;
  holder_ref: string | null;
  holder_type: string | null;
  member_display_name: string | null;
  settlement_id: number;
  settlement_title: string;
  settlement_type: SettlementType;
  unit_asset_id: number | null;
  unit_asset_name: string | null;
};

export type ClaimableRecipientWorkspaceResponse = {
  allocations: Array<{
    allocationId: number;
    amount: number;
    eventId: number | null;
    eventOccurredAt: string | null;
    eventStatus: string | null;
    eventTitle: string | null;
    ownerCharacterId: number;
    ownerCharacterName: string;
    settlementDecidedAt: string;
    settlementId: number;
    settlementTitle: string;
    settlementType: SettlementType;
    unitAssetId: number | null;
    unitAssetName: string | null;
  }>;
  defaults: {
    defaultClaimedAt: string | null;
    defaultMethod: SettlementClaimMethod;
  };
  recipient: {
    characterId: number;
    characterName: string;
    memberDisplayName: string | null;
  };
  siblingCharacters: Array<{
    characterId: number;
    characterName: string;
  }>;
  unitBreakdown: Array<{
    allocationCount: number;
    amountTotal: number;
    unitAssetId: number | null;
    unitAssetName: string | null;
  }>;
};

export type SettlementDisbursementWorkspaceResponse = {
  defaults: {
    defaultClaimedAt: string | null;
    defaultMethod: SettlementClaimMethod;
  };
  recipients: Array<{
    allocationId: number;
    amount: number;
    characterId: number;
    characterName: string;
    claimStatus: "pending" | "partial" | "claimed";
    claimableAmount: number;
    memberDisplayName: string | null;
  }>;
  settlement: {
    decidedAt: string;
    eventId: number | null;
    eventOccurredAt: string | null;
    eventTitle: string | null;
    id: number;
    settlementType: SettlementType;
    title: string;
    totalAmount: number;
    unitAssetId: number | null;
    unitAssetName: string | null;
  };
};

export class ClaimWorkspaceQueryService {
  constructor(private readonly db: DatabaseClient) {}

  async listClaimableRecipientSummaries(input: {
    gameId?: number;
    limit: number;
    offset: number;
    organizationId: number;
    q?: string;
    sortBy?: "pendingAmount" | "updatedAt" | "name";
    sortOrder?: "asc" | "desc";
  }) {
    const rows = await this.listRecipientRows(input.organizationId, {
      gameId: input.gameId,
      q: input.q,
    });

    const summaries = this.buildRecipientSummaries(rows);
    const sortBy = input.sortBy ?? "updatedAt";
    const sortOrder = input.sortOrder ?? "desc";
    summaries.sort((left, right) => {
      const factor = sortOrder === "asc" ? 1 : -1;
      switch (sortBy) {
        case "name":
          return left.characterName.localeCompare(right.characterName) * factor;
        case "pendingAmount":
          return (
            (left.pendingClaimAmountTotal - right.pendingClaimAmountTotal) * factor ||
            left.characterName.localeCompare(right.characterName)
          );
        case "updatedAt":
        default:
          return (
            left.updatedAt.localeCompare(right.updatedAt) * factor ||
            left.characterName.localeCompare(right.characterName)
          );
      }
    });

    const page = summaries.slice(input.offset, input.offset + input.limit + 1);
    const hasMore = page.length > input.limit;
    const recipients = (hasMore ? page.slice(0, input.limit) : page).map(
      ({ updatedAt: _updatedAt, memberUserId: _memberUserId, ...summary }) => summary,
    );

    return {
      pagination: {
        hasMore,
        limit: input.limit,
        offset: input.offset,
      },
      recipients,
    };
  }

  async getClaimableRecipientWorkspace(input: {
    characterId: number;
    organizationId: number;
  }): Promise<ClaimableRecipientWorkspaceResponse> {
    const rows = await this.listRecipientRows(input.organizationId, {});
    const summaries = this.buildRecipientSummaries(rows);
    const recipientRows = rows.filter((row) => row.character_id === input.characterId);
    const summary = summaries.find((candidate) => candidate.characterId === input.characterId);

    return {
      allocations: recipientRows.map((row) => ({
        allocationId: row.allocation_id,
        amount: row.allocation_amount,
        eventId: row.event_id,
        eventOccurredAt: row.event_occurred_at,
        eventStatus: row.event_status,
        eventTitle: row.event_title,
        ownerCharacterId: row.character_id,
        ownerCharacterName: row.character_name,
        settlementDecidedAt: row.settlement_decided_at,
        settlementId: row.settlement_id,
        settlementTitle: row.settlement_title,
        settlementType: row.settlement_type,
        unitAssetId: row.unit_asset_id,
        unitAssetName: row.unit_asset_name,
      })),
      defaults: {
        defaultClaimedAt: null,
        defaultMethod: "manual",
      },
      recipient: {
        characterId: input.characterId,
        characterName:
          summary?.characterName ?? recipientRows[0]?.character_name ?? "",
        memberDisplayName:
          summary?.memberDisplayName ??
          recipientRows[0]?.member_display_name ??
          recipientRows[0]?.member_email ??
          null,
      },
      siblingCharacters:
        summary?.memberUserId === null || summary?.memberUserId === undefined
          ? []
          : summaries
              .filter(
                (candidate) =>
                  candidate.memberUserId === summary.memberUserId &&
                  candidate.characterId !== summary.characterId,
              )
              .map((candidate) => ({
                characterId: candidate.characterId,
                characterName: candidate.characterName,
              })),
      unitBreakdown: summary?.pendingUnitBreakdown ?? [],
    };
  }

  async listDisburseableEventSummaries(input: {
    fromDecidedAt?: string;
    gameId?: number;
    limit: number;
    offset: number;
    organizationId: number;
    q?: string;
    toDecidedAt?: string;
  }) {
    const rows = await this.listDisburseableRows(input.organizationId, {
      fromDecidedAt: input.fromDecidedAt,
      gameId: input.gameId,
      q: input.q,
      toDecidedAt: input.toDecidedAt,
    });
    const summaryMap = new Map<
      number,
      {
        decidedAt: string;
        eventId: number | null;
        eventOccurredAt: string | null;
        eventTitle: string | null;
        holderLabel: string | null;
        pendingRecipientCount: number;
        settlementId: number;
        settlementTitle: string;
        settlementType: SettlementType;
        totalAmount: number;
        unitAssetId: number | null;
        unitAssetName: string | null;
      }
    >();

    for (const row of rows) {
      const claimableAmount = Math.max(
        0,
        row.allocation_amount - (row.active_claim_amount ?? 0),
      );
      if (claimableAmount <= 0) {
        continue;
      }

      const existing = summaryMap.get(row.settlement_id) ?? {
        decidedAt: row.decided_at,
        eventId: row.event_id,
        eventOccurredAt: row.event_occurred_at,
        eventTitle: row.event_title,
        holderLabel: row.character_name ?? row.holder_ref,
        pendingRecipientCount: 0,
        settlementId: row.settlement_id,
        settlementTitle: row.settlement_title,
        settlementType: row.settlement_type,
        totalAmount: 0,
        unitAssetId: row.unit_asset_id,
        unitAssetName: row.unit_asset_name,
      };

      existing.pendingRecipientCount += 1;
      existing.totalAmount += claimableAmount;
      summaryMap.set(row.settlement_id, existing);
    }

    const items = [...summaryMap.values()].sort((left, right) =>
      right.decidedAt.localeCompare(left.decidedAt) ||
      right.settlementId - left.settlementId,
    );
    const page = items.slice(input.offset, input.offset + input.limit + 1);
    const hasMore = page.length > input.limit;

    return {
      items: hasMore ? page.slice(0, input.limit) : page,
      pagination: {
        hasMore,
        limit: input.limit,
        offset: input.offset,
      },
    };
  }

  async getSettlementDisbursementWorkspace(input: {
    organizationId: number;
    settlementId: number;
  }): Promise<SettlementDisbursementWorkspaceResponse> {
    const rows = await this.listDisburseableRows(input.organizationId, {
      settlementId: input.settlementId,
    });
    const first = rows[0];

    return {
      defaults: {
        defaultClaimedAt: null,
        defaultMethod: "manual",
      },
      recipients: rows
        .filter((row) => row.character_id !== null)
        .map((row) => {
          const activeClaimAmount = row.active_claim_amount ?? 0;
          const claimableAmount = Math.max(0, row.allocation_amount - activeClaimAmount);
          const claimStatus =
            activeClaimAmount <= 0
              ? "pending"
              : claimableAmount > 0
                ? "partial"
                : "claimed";

          return {
            allocationId: row.allocation_id,
            amount: row.allocation_amount,
            characterId: row.character_id as number,
            characterName: row.character_name ?? "",
            claimStatus,
            claimableAmount,
            memberDisplayName: row.member_display_name,
          };
        }),
      settlement: {
        decidedAt: first?.decided_at ?? "",
        eventId: first?.event_id ?? null,
        eventOccurredAt: first?.event_occurred_at ?? null,
        eventTitle: first?.event_title ?? null,
        id: input.settlementId,
        settlementType: first?.settlement_type ?? "sale",
        title: first?.settlement_title ?? "",
        totalAmount: rows.reduce((sum, row) => sum + row.allocation_amount, 0),
        unitAssetId: first?.unit_asset_id ?? null,
        unitAssetName: first?.unit_asset_name ?? null,
      },
    };
  }

  private async listRecipientRows(
    organizationId: number,
    filter: {
      gameId?: number;
      q?: string;
    },
  ): Promise<ClaimableRecipientRow[]> {
    const whereClauses = [
      "s.organization_id = ?",
      "sa.status = 'pending'",
      "s.status IN ('draft', 'calculated', 'paying')",
      "NOT EXISTS (SELECT 1 FROM settlement_claims sc WHERE sc.settlement_allocation_id = sa.id AND sc.status != 'voided')",
    ];
    const bindings: Array<number | string> = [organizationId];

    if (filter.gameId) {
      whereClauses.push("(e.game_id = ? OR (e.game_id IS NULL AND c.game_id = ?))");
      bindings.push(filter.gameId, filter.gameId);
    }

    if (filter.q) {
      whereClauses.push(
        "(LOWER(c.name) LIKE ? OR LOWER(COALESCE(u.display_name, '')) LIKE ? OR LOWER(COALESCE(u.email, '')) LIKE ?)",
      );
      const pattern = `%${filter.q.trim().toLowerCase()}%`;
      bindings.push(pattern, pattern, pattern);
    }

    return this.db.all<ClaimableRecipientRow>(
      `SELECT
         sa.id AS allocation_id,
         sa.amount AS allocation_amount,
         sa.updated_at AS allocation_updated_at,
         c.id AS character_id,
         c.name AS character_name,
         c.game_id AS character_game_id,
         c.claimed_by_user_id AS member_user_id,
         u.display_name AS member_display_name,
         u.email AS member_email,
         s.id AS settlement_id,
         s.title AS settlement_title,
         s.settlement_type AS settlement_type,
         s.decided_at AS settlement_decided_at,
         unit_asset.id AS unit_asset_id,
         unit_asset.name AS unit_asset_name,
         e.id AS event_id,
         e.game_id AS event_game_id,
         e.title AS event_title,
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
       WHERE ${whereClauses.join(" AND ")}
       ORDER BY c.name ASC, sa.id ASC`,
      ...bindings,
    );
  }

  private buildRecipientSummaries(rows: ClaimableRecipientRow[]) {
    const memberCharacterCounts = new Map<number, Set<number>>();
    for (const row of rows) {
      if (row.member_user_id === null) {
        continue;
      }
      const existing = memberCharacterCounts.get(row.member_user_id) ?? new Set<number>();
      existing.add(row.character_id);
      memberCharacterCounts.set(row.member_user_id, existing);
    }

    const summaryMap = new Map<
      number,
      {
        characterId: number;
        characterName: string;
        hasSiblingCharactersPending: boolean;
        memberDisplayName: string | null;
        memberUserId: number | null;
        pendingAllocationCount: number;
        pendingClaimAmountTotal: number;
        pendingUnitBreakdown: Array<{
          allocationCount: number;
          amountTotal: number;
          unitAssetId: number | null;
          unitAssetName: string | null;
        }>;
        updatedAt: string;
      }
    >();
    const unitMaps = new Map<
      number,
      Map<string, { allocationCount: number; amountTotal: number; unitAssetId: number | null; unitAssetName: string | null }>
    >();

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
          updatedAt: row.allocation_updated_at,
        });
        unitMaps.set(row.character_id, new Map());
      }

      const summary = summaryMap.get(row.character_id);
      const unitMap = unitMaps.get(row.character_id);
      if (!summary || !unitMap) {
        continue;
      }

      summary.pendingAllocationCount += 1;
      summary.pendingClaimAmountTotal += row.allocation_amount;
      if (row.allocation_updated_at > summary.updatedAt) {
        summary.updatedAt = row.allocation_updated_at;
      }

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
      pendingUnitBreakdown: [...(unitMaps.get(summary.characterId)?.values() ?? [])],
    }));
  }

  private async listDisburseableRows(
    organizationId: number,
    filter: {
      fromDecidedAt?: string;
      gameId?: number;
      q?: string;
      settlementId?: number;
      toDecidedAt?: string;
    },
  ): Promise<DisburseableAllocationRow[]> {
    const whereClauses = [
      "s.organization_id = ?",
      "s.status IN ('draft', 'calculated', 'paying')",
      "sa.status IN ('pending', 'claimed')",
    ];
    const bindings: Array<number | string> = [organizationId];

    if (filter.settlementId) {
      whereClauses.push("s.id = ?");
      bindings.push(filter.settlementId);
    }
    if (filter.gameId) {
      whereClauses.push("e.game_id = ?");
      bindings.push(filter.gameId);
    }
    if (filter.fromDecidedAt) {
      whereClauses.push("s.decided_at >= ?");
      bindings.push(filter.fromDecidedAt);
    }
    if (filter.toDecidedAt) {
      whereClauses.push("s.decided_at <= ?");
      bindings.push(filter.toDecidedAt);
    }
    if (filter.q) {
      whereClauses.push(
        "(LOWER(s.title) LIKE ? OR LOWER(COALESCE(e.title, '')) LIKE ? OR LOWER(COALESCE(e.holder_ref, '')) LIKE ? OR LOWER(COALESCE(c.name, '')) LIKE ?)",
      );
      const pattern = `%${filter.q.trim().toLowerCase()}%`;
      bindings.push(pattern, pattern, pattern, pattern);
    }

    return this.db.all<DisburseableAllocationRow>(
      `SELECT
         sa.id AS allocation_id,
         sa.amount AS allocation_amount,
         sa.character_id AS character_id,
         c.name AS character_name,
         u.display_name AS member_display_name,
         s.id AS settlement_id,
         s.title AS settlement_title,
         s.settlement_type AS settlement_type,
         s.decided_at AS decided_at,
         s.unit_asset_id AS unit_asset_id,
         unit_asset.name AS unit_asset_name,
         e.id AS event_id,
         e.title AS event_title,
         e.occurred_at AS event_occurred_at,
         e.status AS event_status,
         e.holder_ref AS holder_ref,
         e.holder_type AS holder_type,
         COALESCE(SUM(CASE WHEN sc.status != 'voided' THEN sc.amount ELSE 0 END), 0) AS active_claim_amount,
         COALESCE(SUM(CASE WHEN sc.status != 'voided' THEN 1 ELSE 0 END), 0) AS active_claim_count
       FROM settlement_allocations sa
       INNER JOIN settlements s
         ON s.id = sa.settlement_id
       LEFT JOIN characters c
         ON c.id = sa.character_id
       LEFT JOIN users u
         ON u.id = c.claimed_by_user_id
       LEFT JOIN assets unit_asset
         ON unit_asset.id = s.unit_asset_id
       LEFT JOIN events e
         ON e.id = s.event_id
       LEFT JOIN settlement_claims sc
         ON sc.settlement_allocation_id = sa.id
       WHERE ${whereClauses.join(" AND ")}
       GROUP BY
         sa.id,
         sa.amount,
         sa.character_id,
         c.name,
         u.display_name,
         s.id,
         s.title,
         s.settlement_type,
         s.decided_at,
         s.unit_asset_id,
         unit_asset.name,
         e.id,
         e.title,
         e.occurred_at,
         e.status,
         e.holder_ref,
         e.holder_type
       ORDER BY s.decided_at DESC, s.id DESC, sa.id ASC`,
      ...bindings,
    );
  }
}
