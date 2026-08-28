import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { CharactersRepository } from "../../repositories/characters-repository";
import { SettlementAllocationsRepository } from "../../repositories/settlement-allocations-repository";
import { SettlementClaimsRepository } from "../../repositories/settlement-claims-repository";
import { SettlementsRepository } from "../../repositories/settlements-repository";
import type {
  SettlementAllocationRecord,
  SettlementClaimMethod,
  SettlementClaimRecord,
  SettlementRecord,
} from "../../repositories/types";
import { AllocationLifecycleService } from "./allocation-lifecycle-service";
import { ClaimLifecycleService } from "./claim-lifecycle-service";
import { SettlementLifecycleService } from "./settlement-lifecycle-service";

export type SettlementDisbursementItemInput = {
  amount: number;
  characterId: number;
  ratio?: number | null;
  weight?: number;
};

export type SettlementDisbursementResult = {
  allocationMode: "created" | "matched";
  allocations: SettlementAllocationRecord[];
  claims: SettlementClaimRecord[];
  settlement: SettlementRecord;
  settlementStatusChanged: boolean;
};

export class SettlementDisbursementService {
  constructor(private readonly db: DatabaseClient) {}

  async disburseSettlement(input: {
    claimedAt: string;
    items: SettlementDisbursementItemInput[];
    method?: SettlementClaimMethod;
    notes?: string | null;
    organizationId: number;
    settlementId: number;
  }): Promise<SettlementDisbursementResult> {
    if (input.items.length === 0) {
      throw new ConflictError("Disbursement requires at least one item", {
        code: "SETTLEMENT_DISBURSE_ITEMS_REQUIRED",
      });
    }

    this.assertUniqueCharacterItems(input.items);

    const settlementRepository = new SettlementsRepository(this.db);
    const allocationsRepository = new SettlementAllocationsRepository(this.db);
    const claimsRepository = new SettlementClaimsRepository(this.db);
    const settlementLifecycle = new SettlementLifecycleService(this.db);
    const allocationLifecycle = new AllocationLifecycleService(this.db);
    const claimLifecycle = new ClaimLifecycleService(this.db);

    const initialSettlement = await this.requireSettlement(
      input.settlementId,
      input.organizationId,
    );

    if (
      initialSettlement.status === "paid" ||
      initialSettlement.status === "cancelled"
    ) {
      throw new ConflictError(
        "Settlement cannot be disbursed after it is paid or cancelled",
        {
          code: "SETTLEMENT_DISBURSE_STATUS_INVALID",
        },
      );
    }

    for (const item of input.items) {
      await this.requireCharacter(item.characterId, input.organizationId);
    }

    let workingSettlement = initialSettlement;
    if (workingSettlement.status === "draft") {
      workingSettlement = await settlementLifecycle.markCalculated(
        workingSettlement.id,
      );
    }

    const existingAllocations = await allocationsRepository.listBySettlement(
      workingSettlement.id,
    );

    let allocationMode: "created" | "matched";
    let allocations: SettlementAllocationRecord[];

    if (existingAllocations.length === 0) {
      this.assertDisbursementTotalWithinSettlement(input.items, workingSettlement);
      allocationMode = "created";
      allocations = [];

      for (const item of input.items) {
        const created = await allocationLifecycle.createPendingAllocation({
          amount: item.amount,
          characterId: item.characterId,
          ratio: item.ratio,
          settlementId: workingSettlement.id,
          weight: item.weight,
        });
        allocations.push(created);
      }
    } else {
      allocationMode = "matched";
      allocations = await this.matchExistingAllocations({
        allocations: existingAllocations,
        claimsRepository,
        items: input.items,
      });
    }

    const claims: SettlementClaimRecord[] = [];
    for (let index = 0; index < allocations.length; index += 1) {
      const allocation = allocations[index];
      const item = input.items[index];
      const claim = await claimLifecycle.recordClaim({
        amount: item.amount,
        claimedAt: input.claimedAt,
        claimedByCharacterId: item.characterId,
        method: input.method,
        notes: input.notes,
        settlementAllocationId: allocation.id,
      });
      claims.push(claim);
    }

    const finalSettlement = await settlementRepository.findById(workingSettlement.id);
    if (!finalSettlement) {
      throw new NotFoundError("Settlement not found");
    }

    return {
      allocationMode,
      allocations,
      claims,
      settlement: finalSettlement,
      settlementStatusChanged: finalSettlement.status !== initialSettlement.status,
    };
  }

  private assertUniqueCharacterItems(
    items: SettlementDisbursementItemInput[],
  ) {
    const seen = new Set<number>();
    for (const item of items) {
      if (seen.has(item.characterId)) {
        throw new ConflictError(
          "Disbursement does not support duplicate character rows in one request",
          {
            code: "SETTLEMENT_DISBURSE_DUPLICATE_CHARACTER",
          },
        );
      }
      seen.add(item.characterId);
    }
  }

  private assertDisbursementTotalWithinSettlement(
    items: SettlementDisbursementItemInput[],
    settlement: SettlementRecord,
  ) {
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    if (total > settlement.net_amount) {
      throw new ConflictError(
        "Disbursement total cannot exceed settlement net amount",
        {
          code: "SETTLEMENT_DISBURSE_TOTAL_EXCEEDS_NET",
        },
      );
    }
  }

  private async matchExistingAllocations(input: {
    allocations: SettlementAllocationRecord[];
    claimsRepository: SettlementClaimsRepository;
    items: SettlementDisbursementItemInput[];
  }): Promise<SettlementAllocationRecord[]> {
    if (input.allocations.length !== input.items.length) {
      throw new ConflictError(
        "Existing allocations do not match disbursement item count",
        {
          code: "SETTLEMENT_DISBURSE_ALLOCATION_COUNT_MISMATCH",
        },
      );
    }

    const allocationMap = new Map<number, SettlementAllocationRecord>();

    for (const allocation of input.allocations) {
      if (allocation.status !== "pending") {
        throw new ConflictError(
          "Settlement with existing non-pending allocations cannot be disbursed by this route",
          {
            code: "SETTLEMENT_DISBURSE_ALLOCATION_STATE_INVALID",
          },
        );
      }

      if (!allocation.character_id) {
        throw new ConflictError(
          "Settlement with recipient-less allocations cannot be disbursed by this route",
          {
            code: "SETTLEMENT_DISBURSE_ALLOCATION_AMBIGUOUS",
          },
        );
      }

      if (allocationMap.has(allocation.character_id)) {
        throw new ConflictError(
          "Settlement with duplicate recipient allocations cannot be disbursed by this route",
          {
            code: "SETTLEMENT_DISBURSE_ALLOCATION_AMBIGUOUS",
          },
        );
      }

      const claims = await input.claimsRepository.listByAllocation(allocation.id);
      if (claims.some((claim) => claim.status !== "voided")) {
        throw new ConflictError(
          "Settlement with recorded or confirmed claims cannot be re-disbursed by this route",
          {
            code: "SETTLEMENT_DISBURSE_ALREADY_STARTED",
          },
        );
      }

      allocationMap.set(allocation.character_id, allocation);
    }

    return input.items.map((item) => {
      const allocation = allocationMap.get(item.characterId);
      if (!allocation) {
        throw new ConflictError(
          "Disbursement recipients do not match existing allocations",
          {
            code: "SETTLEMENT_DISBURSE_ALLOCATION_MISMATCH",
          },
        );
      }

      if (allocation.amount !== item.amount) {
        throw new ConflictError(
          "Disbursement amount does not match the existing allocation amount",
          {
            code: "SETTLEMENT_DISBURSE_AMOUNT_MISMATCH",
          },
        );
      }

      if (item.ratio !== undefined && allocation.ratio !== item.ratio) {
        throw new ConflictError(
          "Disbursement ratio does not match the existing allocation ratio",
          {
            code: "SETTLEMENT_DISBURSE_RATIO_MISMATCH",
          },
        );
      }

      if (item.weight !== undefined && allocation.weight !== item.weight) {
        throw new ConflictError(
          "Disbursement weight does not match the existing allocation weight",
          {
            code: "SETTLEMENT_DISBURSE_WEIGHT_MISMATCH",
          },
        );
      }

      return allocation;
    });
  }

  private async requireSettlement(
    settlementId: number,
    organizationId: number,
  ): Promise<SettlementRecord> {
    const settlement = await new SettlementsRepository(this.db).findById(
      settlementId,
    );

    if (!settlement || settlement.organization_id !== organizationId) {
      throw new NotFoundError("Settlement not found");
    }

    return settlement;
  }

  private async requireCharacter(
    characterId: number,
    organizationId: number,
  ) {
    const character = await new CharactersRepository(this.db).findById(characterId);

    if (!character || character.organization_id !== organizationId) {
      throw new NotFoundError("Character not found");
    }

    return character;
  }
}
