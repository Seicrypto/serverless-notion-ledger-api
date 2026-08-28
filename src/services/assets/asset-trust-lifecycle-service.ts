import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { AssetsRepository } from "../../repositories/assets-repository";
import type { AssetRecord, AssetStatus } from "../../repositories/types";

interface AssetUsageRow {
  organization_id: number | null;
  user_id: number | null;
}

export interface AssetTrustEvidence {
  distinctOrganizationCount: number;
  distinctUserCountWithinOwningOrganization: number;
  totalUsageCount: number;
}

export class AssetTrustLifecycleService {
  private readonly assetsRepository: AssetsRepository;

  constructor(
    private readonly db: DatabaseClient,
    options: {
      assetsRepository?: AssetsRepository;
    } = {},
  ) {
    this.assetsRepository = options.assetsRepository ?? new AssetsRepository(db);
  }

  resolveInitialStatus(): AssetStatus {
    return "candidate";
  }

  async recomputeStatus(assetId: number): Promise<AssetRecord> {
    const asset = await this.assetsRepository.findById(assetId);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    if (asset.status === "merged" || asset.status === "deprecated") {
      return asset;
    }

    const evidence = await this.collectEvidence(assetId, asset.organization_id);
    const nextStatus = this.resolveStatusFromEvidence(evidence);

    if (nextStatus === asset.status) {
      return asset;
    }

    return this.assetsRepository.update(asset.id, {
      status: nextStatus,
    });
  }

  isVisibleForOrganization(
    asset: AssetRecord,
    organizationId?: number | null,
  ): boolean {
    if (asset.status === "merged" || asset.status === "deprecated") {
      return false;
    }

    if (asset.status === "active") {
      return true;
    }

    if (asset.scope === "organization") {
      return asset.organization_id === (organizationId ?? null);
    }

    return asset.status === "org_verified";
  }

  isSuggestibleForOrganization(
    asset: AssetRecord,
    organizationId?: number | null,
  ): boolean {
    if (asset.status === "merged" || asset.status === "deprecated") {
      return false;
    }

    if (asset.status === "active") {
      return true;
    }

    if (asset.scope === "organization" && asset.organization_id === (organizationId ?? null)) {
      return true;
    }

    return asset.status === "org_verified";
  }

  async collectEvidence(
    assetId: number,
    owningOrganizationId?: number | null,
  ): Promise<AssetTrustEvidence> {
    const rows = await this.db.all<AssetUsageRow>(
      `SELECT organization_id, created_by_user_id AS user_id
       FROM events
       WHERE asset_id = ?
       UNION ALL
       SELECT organization_id, created_by_user_id AS user_id
       FROM settlements
       WHERE unit_asset_id = ?`,
      assetId,
      assetId,
    );

    const organizationIds = new Set<number>();
    const owningOrganizationUsers = new Set<number>();

    for (const row of rows) {
      if (row.organization_id !== null) {
        organizationIds.add(row.organization_id);
      }

      if (
        owningOrganizationId !== null &&
        owningOrganizationId !== undefined &&
        row.organization_id === owningOrganizationId &&
        row.user_id !== null
      ) {
        owningOrganizationUsers.add(row.user_id);
      }
    }

    return {
      distinctOrganizationCount: organizationIds.size,
      distinctUserCountWithinOwningOrganization: owningOrganizationUsers.size,
      totalUsageCount: rows.length,
    };
  }

  private resolveStatusFromEvidence(evidence: AssetTrustEvidence): AssetStatus {
    if (evidence.distinctOrganizationCount >= 2) {
      return "active";
    }

    if (evidence.distinctUserCountWithinOwningOrganization >= 2) {
      return "org_verified";
    }

    return "candidate";
  }
}
