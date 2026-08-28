import {
  requireTargetOrganizationManager,
  requireTargetOrganizationMember,
  requireTargetOrganizationOwner,
} from "../organizations/middleware";

export const requireLedgerMember = requireTargetOrganizationMember;

export const requireLedgerManager = requireTargetOrganizationManager;

export const requireLedgerOwner = requireTargetOrganizationOwner;
