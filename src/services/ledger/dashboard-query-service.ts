import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { NotFoundError } from "../../lib/errors";
import type {
  EventStatus,
  EventType,
  SettlementPayerType,
  SettlementStatus,
  SettlementType,
} from "../../repositories/types";
import { CharactersRepository } from "../../repositories/characters-repository";

type SummaryTotalsRow = {
  disbursement_in_progress_count: number | string | null;
  disbursement_not_started_count: number | string | null;
  settlement_count: number | string | null;
  unsettled_event_count: number | string | null;
};

type RevenueBreakdownRow = {
  gross_amount_total: number | string;
  net_amount_total: number | string;
  settlement_count: number | string;
  unit_asset_id: number | null;
  unit_asset_name: string | null;
};

type PendingLedgerRow = {
  amount: number | string;
  character_id: number;
  character_name: string;
  direction: "payable" | "receivable";
  settlement_count: number | string;
  settlement_id: number;
  unit_asset_id: number | null;
  unit_asset_name: string | null;
  updated_at: string;
};

type DetailReceivableRow = {
  active_claim_count: number | string;
  amount: number | string;
  counterparty_ref: string | null;
  counterparty_type: SettlementPayerType;
  event_id: number | null;
  event_title: string | null;
  settlement_id: number;
  settlement_key: string;
  settlement_status: SettlementStatus;
  settlement_title: string;
  settlement_type: SettlementType;
  decided_at: string;
  unit_asset_id: number | null;
  unit_asset_name: string | null;
  confirmed_claim_count: number | string;
};

type DetailPayableRow = {
  active_claim_count: number | string;
  amount: number | string;
  counterparty_character_id: number | null;
  counterparty_character_name: string | null;
  event_id: number | null;
  event_title: string | null;
  settlement_id: number;
  settlement_key: string;
  settlement_status: SettlementStatus;
  settlement_title: string;
  settlement_type: SettlementType;
  decided_at: string;
  unit_asset_id: number | null;
  unit_asset_name: string | null;
  confirmed_claim_count: number | string;
};

export type OrganizationLedgerDashboardSummaryResponse = {
  generatedAt: string;
  organization: {
    id: number;
    name: string;
    slug: string;
  };
  summary: {
    disbursementInProgressCount: number;
    disbursementNotStartedCount: number;
    revenueUnitBreakdown: Array<{
      grossAmountTotal: number;
      netAmountTotal: number;
      settlementCount: number;
      unitAssetId: number | null;
      unitAssetName: string | null;
    }>;
    settlementCount: number;
    unsettledEventCount: number;
  };
};

export type CharacterLedgerDashboardSummaryResponse = {
  generatedAt: string;
  summaries: Array<{
    characterId: number;
    characterName: string;
    lastActivityAt: string | null;
    payableSettlementCount: number;
    payableUnitBreakdown: Array<{
      amountTotal: number;
      settlementCount: number;
      unitAssetId: number | null;
      unitAssetName: string | null;
    }>;
    pendingClaimCount: number;
    receivableSettlementCount: number;
    receivableUnitBreakdown: Array<{
      amountTotal: number;
      settlementCount: number;
      unitAssetId: number | null;
      unitAssetName: string | null;
    }>;
  }>;
};

type DashboardClaimStatus = "none" | "partial" | "claimed" | "confirmed";

export type CharacterLedgerDashboardDetailResponse = {
  character: {
    id: number;
    name: string;
  };
  generatedAt: string;
  payableGroups: Array<{
    counterpartyId: number | null;
    counterpartyLabel: string;
    counterpartyType: "character" | "org_treasury" | "external" | "custom";
    settlements: Array<{
      amount: number;
      claimStatus: DashboardClaimStatus;
      decidedAt: string;
      eventId: number | null;
      eventTitle: string | null;
      settlementId: number;
      settlementKey: string;
      settlementStatus: SettlementStatus;
      settlementTitle: string;
      settlementType: SettlementType;
      unitAssetId: number | null;
      unitAssetName: string | null;
    }>;
    unitBreakdown: Array<{
      amountTotal: number;
      settlementCount: number;
      unitAssetId: number | null;
      unitAssetName: string | null;
    }>;
  }>;
  receivableGroups: Array<{
    counterpartyId: number | null;
    counterpartyLabel: string;
    counterpartyType: "character" | "org_treasury" | "external" | "custom";
    settlements: Array<{
      amount: number;
      claimStatus: DashboardClaimStatus;
      decidedAt: string;
      eventId: number | null;
      eventTitle: string | null;
      settlementId: number;
      settlementKey: string;
      settlementStatus: SettlementStatus;
      settlementTitle: string;
      settlementType: SettlementType;
      unitAssetId: number | null;
      unitAssetName: string | null;
    }>;
    unitBreakdown: Array<{
      amountTotal: number;
      settlementCount: number;
      unitAssetId: number | null;
      unitAssetName: string | null;
    }>;
  }>;
};

export class DashboardQueryService {
  constructor(private readonly db: DatabaseClient) {}

  async getOrganizationSummary(input: {
    organization: { id: number; name: string; slug: string };
  }): Promise<OrganizationLedgerDashboardSummaryResponse> {
    const totals = await this.db.first<SummaryTotalsRow>(
      `SELECT
         (SELECT COUNT(*) FROM settlements s
          WHERE s.organization_id = ? AND s.status != 'cancelled') AS settlement_count,
         (SELECT COUNT(*) FROM events e
          WHERE e.organization_id = ?
            AND e.status IN ('open', 'ready_for_settlement', 'partially_settled')) AS unsettled_event_count,
         (SELECT COUNT(*)
          FROM settlements s
          WHERE s.organization_id = ?
            AND s.status IN ('draft', 'calculated', 'paying')
            AND EXISTS (
              SELECT 1
              FROM settlement_claims sc
              INNER JOIN settlement_allocations sa
                ON sa.id = sc.settlement_allocation_id
              WHERE sa.settlement_id = s.id
                AND sc.status != 'voided'
            )) AS disbursement_in_progress_count,
         (SELECT COUNT(*)
          FROM settlements s
          WHERE s.organization_id = ?
            AND s.status IN ('draft', 'calculated', 'paying')
            AND NOT EXISTS (
              SELECT 1
              FROM settlement_claims sc
              INNER JOIN settlement_allocations sa
                ON sa.id = sc.settlement_allocation_id
              WHERE sa.settlement_id = s.id
                AND sc.status != 'voided'
            )) AS disbursement_not_started_count`,
      input.organization.id,
      input.organization.id,
      input.organization.id,
      input.organization.id,
    );

    const revenueRows = await this.db.all<RevenueBreakdownRow>(
      `SELECT
         s.unit_asset_id,
         a.name AS unit_asset_name,
         SUM(s.gross_amount) AS gross_amount_total,
         SUM(s.net_amount) AS net_amount_total,
         COUNT(*) AS settlement_count
       FROM settlements s
       LEFT JOIN assets a
         ON a.id = s.unit_asset_id
       WHERE s.organization_id = ?
         AND s.status != 'cancelled'
       GROUP BY s.unit_asset_id, a.name
       ORDER BY settlement_count DESC, s.unit_asset_id ASC`,
      input.organization.id,
    );

    return {
      generatedAt: new Date().toISOString(),
      organization: input.organization,
      summary: {
        disbursementInProgressCount: toNumber(
          totals?.disbursement_in_progress_count,
        ),
        disbursementNotStartedCount: toNumber(
          totals?.disbursement_not_started_count,
        ),
        revenueUnitBreakdown: revenueRows.map((row) => ({
          grossAmountTotal: toNumber(row.gross_amount_total),
          netAmountTotal: toNumber(row.net_amount_total),
          settlementCount: toNumber(row.settlement_count),
          unitAssetId: row.unit_asset_id,
          unitAssetName: row.unit_asset_name,
        })),
        settlementCount: toNumber(totals?.settlement_count),
        unsettledEventCount: toNumber(totals?.unsettled_event_count),
      },
    };
  }

  async queryCharacterSummaries(input: {
    characterIds: number[];
    organizationId: number;
  }): Promise<CharacterLedgerDashboardSummaryResponse> {
    const characters = await this.requireCharacters(
      input.characterIds,
      input.organizationId,
    );
    const rows = await this.listPendingCharacterRows(
      input.organizationId,
      input.characterIds,
    );

    const byCharacter = new Map<
      number,
      CharacterLedgerDashboardSummaryResponse["summaries"][number]
    >();
    const receivableUnits = new Map<string, { amountTotal: number; settlementIds: Set<number>; unitAssetId: number | null; unitAssetName: string | null }>();
    const payableUnits = new Map<string, { amountTotal: number; settlementIds: Set<number>; unitAssetId: number | null; unitAssetName: string | null }>();

    for (const character of characters) {
      byCharacter.set(character.id, {
        characterId: character.id,
        characterName: character.name,
        lastActivityAt: null,
        payableSettlementCount: 0,
        payableUnitBreakdown: [],
        pendingClaimCount: 0,
        receivableSettlementCount: 0,
        receivableUnitBreakdown: [],
      });
    }

    const receivableSettlementSets = new Map<number, Set<number>>();
    const payableSettlementSets = new Map<number, Set<number>>();

    for (const row of rows) {
      const summary = byCharacter.get(row.character_id);
      if (!summary) {
        continue;
      }

      const amount = toNumber(row.amount);
      const unitKey = `${row.character_id}:${row.direction}:${row.unit_asset_id ?? "null"}:${row.unit_asset_name ?? ""}`;
      const targetMap =
        row.direction === "receivable" ? receivableUnits : payableUnits;
      const settlementSets =
        row.direction === "receivable"
          ? receivableSettlementSets
          : payableSettlementSets;

      const current = targetMap.get(unitKey) ?? {
        amountTotal: 0,
        settlementIds: new Set<number>(),
        unitAssetId: row.unit_asset_id,
        unitAssetName: row.unit_asset_name,
      };
      current.amountTotal += amount;
      current.settlementIds.add(row.settlement_id);
      targetMap.set(unitKey, current);

      const set = settlementSets.get(row.character_id) ?? new Set<number>();
      set.add(row.settlement_id);
      settlementSets.set(row.character_id, set);

      if (row.direction === "receivable") {
        summary.pendingClaimCount += 1;
      }

      const lastActivity = summary.lastActivityAt;
      if (!lastActivity || row.updated_at > lastActivity) {
        summary.lastActivityAt = row.updated_at;
      }
    }

    for (const summary of byCharacter.values()) {
      summary.receivableSettlementCount =
        receivableSettlementSets.get(summary.characterId)?.size ?? 0;
      summary.payableSettlementCount =
        payableSettlementSets.get(summary.characterId)?.size ?? 0;

      summary.receivableUnitBreakdown = [...receivableUnits.entries()]
        .filter(([key]) => key.startsWith(`${summary.characterId}:receivable:`))
        .map(([, value]) => ({
          amountTotal: value.amountTotal,
          settlementCount: value.settlementIds.size,
          unitAssetId: value.unitAssetId,
          unitAssetName: value.unitAssetName,
        }));

      summary.payableUnitBreakdown = [...payableUnits.entries()]
        .filter(([key]) => key.startsWith(`${summary.characterId}:payable:`))
        .map(([, value]) => ({
          amountTotal: value.amountTotal,
          settlementCount: value.settlementIds.size,
          unitAssetId: value.unitAssetId,
          unitAssetName: value.unitAssetName,
        }));
    }

    return {
      generatedAt: new Date().toISOString(),
      summaries: input.characterIds
        .map((characterId) => byCharacter.get(characterId))
        .filter((value): value is NonNullable<typeof value> => value !== undefined),
    };
  }

  async getCharacterDetail(input: {
    characterId: number;
    organizationId: number;
  }): Promise<CharacterLedgerDashboardDetailResponse> {
    const character = await new CharactersRepository(this.db).findById(
      input.characterId,
    );
    if (!character || character.organization_id !== input.organizationId) {
      throw new NotFoundError("Character not found");
    }

    const receivableRows = await this.db.all<DetailReceivableRow>(
      `SELECT
         sa.amount,
         s.id AS settlement_id,
         s.settlement_key,
         s.title AS settlement_title,
         s.settlement_type,
         s.status AS settlement_status,
         s.decided_at,
         s.payer_type AS counterparty_type,
         s.payer_ref AS counterparty_ref,
         s.unit_asset_id,
         ua.name AS unit_asset_name,
         e.id AS event_id,
         e.title AS event_title,
         (SELECT COUNT(*) FROM settlement_claims sc
          WHERE sc.settlement_allocation_id = sa.id
            AND sc.status != 'voided') AS active_claim_count,
         (SELECT COUNT(*) FROM settlement_claims sc
          WHERE sc.settlement_allocation_id = sa.id
            AND sc.status = 'confirmed') AS confirmed_claim_count
       FROM settlement_allocations sa
       INNER JOIN settlements s
         ON s.id = sa.settlement_id
       LEFT JOIN assets ua
         ON ua.id = s.unit_asset_id
       LEFT JOIN events e
         ON e.id = s.event_id
       WHERE sa.character_id = ?
         AND s.organization_id = ?
         AND s.status IN ('draft', 'calculated', 'paying', 'paid')
         AND sa.status NOT IN ('waived', 'cancelled')
       ORDER BY s.decided_at DESC, s.id DESC`,
      input.characterId,
      input.organizationId,
    );

    const payableRows = await this.db.all<DetailPayableRow>(
      `SELECT
         sa.amount,
         sa.character_id AS counterparty_character_id,
         rc.name AS counterparty_character_name,
         s.id AS settlement_id,
         s.settlement_key,
         s.title AS settlement_title,
         s.settlement_type,
         s.status AS settlement_status,
         s.decided_at,
         s.unit_asset_id,
         ua.name AS unit_asset_name,
         e.id AS event_id,
         e.title AS event_title,
         (SELECT COUNT(*) FROM settlement_claims sc
          WHERE sc.settlement_allocation_id = sa.id
            AND sc.status != 'voided') AS active_claim_count,
         (SELECT COUNT(*) FROM settlement_claims sc
          WHERE sc.settlement_allocation_id = sa.id
            AND sc.status = 'confirmed') AS confirmed_claim_count
       FROM settlements s
       INNER JOIN settlement_allocations sa
         ON sa.settlement_id = s.id
       LEFT JOIN characters rc
         ON rc.id = sa.character_id
       LEFT JOIN assets ua
         ON ua.id = s.unit_asset_id
       LEFT JOIN events e
         ON e.id = s.event_id
       WHERE s.organization_id = ?
         AND s.payer_type = 'character'
         AND s.payer_ref = ?
         AND s.status IN ('draft', 'calculated', 'paying', 'paid')
         AND sa.status NOT IN ('waived', 'cancelled')
       ORDER BY s.decided_at DESC, s.id DESC`,
      input.organizationId,
      String(input.characterId),
    );

    return {
      character: {
        id: character.id,
        name: character.name,
      },
      generatedAt: new Date().toISOString(),
      payableGroups: await this.buildPayableGroups(payableRows),
      receivableGroups: await this.buildReceivableGroups(
        receivableRows,
        input.organizationId,
      ),
    };
  }

  private async buildReceivableGroups(
    rows: DetailReceivableRow[],
    organizationId: number,
  ): Promise<CharacterLedgerDashboardDetailResponse["receivableGroups"]> {
    const groups = new Map<string, CharacterLedgerDashboardDetailResponse["receivableGroups"][number]>();

    for (const row of rows) {
      const { counterpartyId, counterpartyLabel, counterpartyType } =
        await this.resolveSettlementCounterparty(
          row.counterparty_type,
          row.counterparty_ref,
          organizationId,
        );
      const key = `${counterpartyType}:${counterpartyId ?? "null"}:${counterpartyLabel}`;
      const group = groups.get(key) ?? {
        counterpartyId,
        counterpartyLabel,
        counterpartyType,
        settlements: [],
        unitBreakdown: [],
      };

      group.settlements.push({
        amount: toNumber(row.amount),
        claimStatus: mapClaimStatus(
          toNumber(row.active_claim_count),
          toNumber(row.confirmed_claim_count),
        ),
        decidedAt: row.decided_at,
        eventId: row.event_id,
        eventTitle: row.event_title,
        settlementId: row.settlement_id,
        settlementKey: row.settlement_key,
        settlementStatus: row.settlement_status,
        settlementTitle: row.settlement_title,
        settlementType: row.settlement_type,
        unitAssetId: row.unit_asset_id,
        unitAssetName: row.unit_asset_name,
      });

      groups.set(key, group);
    }

    return [...groups.values()].map((group) => ({
      ...group,
      unitBreakdown: buildUnitBreakdown(group.settlements),
    }));
  }

  private async buildPayableGroups(
    rows: DetailPayableRow[],
  ): Promise<CharacterLedgerDashboardDetailResponse["payableGroups"]> {
    const groups = new Map<string, CharacterLedgerDashboardDetailResponse["payableGroups"][number]>();

    for (const row of rows) {
      const counterpartyType =
        row.counterparty_character_id === null ? "custom" : "character";
      const counterpartyId = row.counterparty_character_id;
      const counterpartyLabel =
        row.counterparty_character_name ??
        (row.counterparty_character_id === null
          ? "Unassigned recipient"
          : `Character ${row.counterparty_character_id}`);
      const key = `${counterpartyType}:${counterpartyId ?? "null"}:${counterpartyLabel}`;
      const group = groups.get(key) ?? {
        counterpartyId,
        counterpartyLabel,
        counterpartyType,
        settlements: [],
        unitBreakdown: [],
      };

      group.settlements.push({
        amount: toNumber(row.amount),
        claimStatus: mapClaimStatus(
          toNumber(row.active_claim_count),
          toNumber(row.confirmed_claim_count),
        ),
        decidedAt: row.decided_at,
        eventId: row.event_id,
        eventTitle: row.event_title,
        settlementId: row.settlement_id,
        settlementKey: row.settlement_key,
        settlementStatus: row.settlement_status,
        settlementTitle: row.settlement_title,
        settlementType: row.settlement_type,
        unitAssetId: row.unit_asset_id,
        unitAssetName: row.unit_asset_name,
      });

      groups.set(key, group);
    }

    return [...groups.values()].map((group) => ({
      ...group,
      unitBreakdown: buildUnitBreakdown(group.settlements),
    }));
  }

  private async resolveSettlementCounterparty(
    type: SettlementPayerType,
    ref: string | null,
    organizationId: number,
  ): Promise<{
    counterpartyId: number | null;
    counterpartyLabel: string;
    counterpartyType: "character" | "org_treasury" | "external" | "custom";
  }> {
    if (type === "character") {
      const numericId = parseNumericRef(ref);
      if (numericId !== null) {
        const character = await new CharactersRepository(this.db).findById(numericId);
        if (character && character.organization_id === organizationId) {
          return {
            counterpartyId: character.id,
            counterpartyLabel: character.name,
            counterpartyType: "character",
          };
        }
      }

      return {
        counterpartyId: numericId,
        counterpartyLabel: ref ?? "Character payer",
        counterpartyType: "character",
      };
    }

    if (type === "org_treasury") {
      return {
        counterpartyId: null,
        counterpartyLabel: ref ?? "Organization Treasury",
        counterpartyType: "org_treasury",
      };
    }

    if (type === "external") {
      return {
        counterpartyId: null,
        counterpartyLabel: ref ?? "External payer",
        counterpartyType: "external",
      };
    }

    return {
      counterpartyId: null,
      counterpartyLabel: ref ?? "Custom payer",
      counterpartyType: "custom",
    };
  }

  private async requireCharacters(characterIds: number[], organizationId: number) {
    const characters = await Promise.all(
      characterIds.map((characterId) =>
        new CharactersRepository(this.db).findById(characterId),
      ),
    );

    const invalid = characters.some(
      (character) => !character || character.organization_id !== organizationId,
    );
    if (invalid) {
      throw new NotFoundError("Character not found");
    }

    return characters.filter((character): character is NonNullable<typeof character> => Boolean(character));
  }

  private async listPendingCharacterRows(
    organizationId: number,
    characterIds: number[],
  ): Promise<PendingLedgerRow[]> {
    const placeholders = characterIds.map(() => "?").join(", ");
    const bindings: unknown[] = [organizationId, ...characterIds, organizationId, ...characterIds];

    return this.db.all<PendingLedgerRow>(
      `SELECT
         c.id AS character_id,
         c.name AS character_name,
         'receivable' AS direction,
         sa.amount,
         s.id AS settlement_id,
         s.unit_asset_id,
         ua.name AS unit_asset_name,
         s.updated_at,
         1 AS settlement_count
       FROM settlement_allocations sa
       INNER JOIN settlements s
         ON s.id = sa.settlement_id
       INNER JOIN characters c
         ON c.id = sa.character_id
       LEFT JOIN assets ua
         ON ua.id = s.unit_asset_id
       WHERE s.organization_id = ?
         AND c.id IN (${placeholders})
         AND sa.status = 'pending'
         AND s.status IN ('draft', 'calculated', 'paying')
         AND NOT EXISTS (
           SELECT 1 FROM settlement_claims sc
           WHERE sc.settlement_allocation_id = sa.id
             AND sc.status != 'voided'
         )
       UNION ALL
       SELECT
         payer.id AS character_id,
         payer.name AS character_name,
         'payable' AS direction,
         sa.amount,
         s.id AS settlement_id,
         s.unit_asset_id,
         ua.name AS unit_asset_name,
         s.updated_at,
         1 AS settlement_count
       FROM settlements s
       INNER JOIN characters payer
         ON payer.id = CAST(s.payer_ref AS INTEGER)
       INNER JOIN settlement_allocations sa
         ON sa.settlement_id = s.id
       LEFT JOIN assets ua
         ON ua.id = s.unit_asset_id
       WHERE s.organization_id = ?
         AND payer.id IN (${placeholders})
         AND s.payer_type = 'character'
         AND s.payer_ref IS NOT NULL
         AND s.payer_ref != ''
         AND s.status IN ('draft', 'calculated', 'paying')
         AND sa.status = 'pending'
         AND NOT EXISTS (
           SELECT 1 FROM settlement_claims sc
           WHERE sc.settlement_allocation_id = sa.id
             AND sc.status != 'voided'
         )`,
      ...bindings,
    );
  }
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  return typeof value === "number" ? value : Number(value);
}

function parseNumericRef(ref: string | null): number | null {
  if (!ref || !/^\d+$/.test(ref)) {
    return null;
  }

  return Number(ref);
}

function mapClaimStatus(
  activeClaimCount: number,
  confirmedClaimCount: number,
): DashboardClaimStatus {
  if (activeClaimCount === 0) {
    return "none";
  }

  if (confirmedClaimCount === 0) {
    return "claimed";
  }

  if (confirmedClaimCount === activeClaimCount) {
    return "confirmed";
  }

  return "partial";
}

function buildUnitBreakdown(
  settlements: Array<{
    amount: number;
    settlementId: number;
    unitAssetId: number | null;
    unitAssetName: string | null;
  }>,
) {
  const map = new Map<
    string,
    {
      amountTotal: number;
      settlementIds: Set<number>;
      unitAssetId: number | null;
      unitAssetName: string | null;
    }
  >();

  for (const settlement of settlements) {
    const key = `${settlement.unitAssetId ?? "null"}:${settlement.unitAssetName ?? ""}`;
    const existing = map.get(key) ?? {
      amountTotal: 0,
      settlementIds: new Set<number>(),
      unitAssetId: settlement.unitAssetId,
      unitAssetName: settlement.unitAssetName,
    };
    existing.amountTotal += settlement.amount;
    existing.settlementIds.add(settlement.settlementId);
    map.set(key, existing);
  }

  return [...map.values()].map((value) => ({
    amountTotal: value.amountTotal,
    settlementCount: value.settlementIds.size,
    unitAssetId: value.unitAssetId,
    unitAssetName: value.unitAssetName,
  }));
}
