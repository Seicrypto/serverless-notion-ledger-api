import type { LocaleCode } from "../types/locale";

export type UserStatus =
  | "pending_verification"
  | "pending_approval"
  | "active"
  | "disabled";
export type OrganizationMemberRole = "owner" | "admin" | "member";
export type OrganizationMemberStatus =
  | "pending"
  | "active"
  | "left"
  | "removed";
export type OrganizationMemberPendingKind = "apply" | "invite";
export type OfficialStaffRole = "admin" | "staff";
export type GameType = "game" | "activity";
export type GameSource = "internal" | "steam";
export type GameAliasType =
  | "official"
  | "localized"
  | "community"
  | "nickname";
export type AssetType =
  | "item"
  | "currency"
  | "ticket"
  | "reward"
  | "service"
  | "other";
export type AssetScope = "global" | "organization";
export type AssetStatus = "active" | "merged" | "deprecated";
export type AssetAliasType =
  | "official"
  | "localized"
  | "community"
  | "nickname"
  | "legacy";
export type EventType =
  | "loot"
  | "raid"
  | "activity"
  | "bonus"
  | "salary"
  | "guild_event"
  | "other";
export type EventHolderType =
  | "character"
  | "org_treasury"
  | "market"
  | "external"
  | "custom";
export type EventStatus =
  | "open"
  | "ready_for_settlement"
  | "partially_settled"
  | "settled"
  | "cancelled";
export type EventSourceType = "manual" | "api" | "import";
export type SettlementType =
  | "sale"
  | "bonus"
  | "salary"
  | "reward"
  | "subsidy"
  | "adjustment";
export type SettlementFeeMode = "none" | "percent" | "fixed" | "rule";
export type SettlementPayerType =
  | "character"
  | "org_treasury"
  | "external"
  | "custom";
export type SettlementAllocationMode = "equal" | "weight" | "manual";
export type SettlementStatus =
  | "draft"
  | "calculated"
  | "paying"
  | "paid"
  | "cancelled";
export type SettlementAllocationStatus =
  | "pending"
  | "claimed"
  | "waived"
  | "cancelled";
export type SettlementClaimMethod =
  | "manual"
  | "in_game_mail"
  | "trade"
  | "bank"
  | "other";
export type SettlementClaimStatus = "recorded" | "confirmed" | "voided";
export type MarketScopeType = "global" | "region" | "server" | "cluster";

export interface UserRecord {
  created_at: string;
  display_name: string | null;
  email: string;
  email_verified_at: string | null;
  id: number;
  password_hash: string;
  status: UserStatus;
  updated_at: string;
  vanity: string | null;
}

export interface CreateUserInput {
  displayName?: string | null;
  email: string;
  emailVerifiedAt?: string | null;
  passwordHash: string;
  status?: UserStatus;
  vanity?: string | null;
}

export interface UpdateUserInput {
  displayName?: string | null;
  emailVerifiedAt?: string | null;
  status?: UserStatus;
}

export interface OrganizationRecord {
  created_at: string;
  created_by_user_id: number;
  description: string | null;
  icon_url: string | null;
  id: number;
  name: string;
  slug: string;
  updated_at: string;
  vanity: string | null;
}

export interface CreateOrganizationInput {
  createdByUserId: number;
  description?: string | null;
  iconUrl?: string | null;
  name: string;
  slug: string;
  vanity?: string | null;
}

export interface UpdateOrganizationInput {
  description?: string | null;
  iconUrl?: string | null;
  name?: string;
  slug?: string;
  vanity?: string | null;
}

export interface OrganizationMemberRecord {
  approved_at: string | null;
  created_at: string;
  id: number;
  joined_at: string;
  left_at: string | null;
  organization_id: number;
  removed_at: string | null;
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
  user_id: number;
}

export interface CreateOrganizationMemberInput {
  approvedAt?: string | null;
  joinedAt?: string;
  organizationId: number;
  role?: OrganizationMemberRole;
  status?: OrganizationMemberStatus;
  userId: number;
}

export interface CharacterRecord {
  claimed_by_user_id: number | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by_user_id: number | null;
  game_id: number | null;
  id: number;
  is_active: number;
  name: string;
  notes: string | null;
  organization_id: number;
  slug: string | null;
  updated_at: string;
  vanity: string | null;
}

export interface CreateCharacterInput {
  claimedByUserId?: number | null;
  gameId?: number | null;
  isActive?: boolean;
  name: string;
  notes?: string | null;
  organizationId: number;
  slug?: string | null;
  vanity?: string | null;
}

export interface UpdateCharacterInput {
  claimedByUserId?: number | null;
  gameId?: number | null;
  isActive?: boolean;
  name?: string;
  notes?: string | null;
  slug?: string | null;
  vanity?: string | null;
}

export interface OrganizationMemberPendingActionRecord {
  character_id: number | null;
  created_at: string;
  expires_at: string | null;
  id: number;
  invited_by_user_id: number | null;
  kind: OrganizationMemberPendingKind;
  member_id: number;
  requested_character_name: string | null;
  requested_character_notes: string | null;
  requested_character_slug: string | null;
  requested_game_id: number | null;
  updated_at: string;
}

export interface CreateOrganizationMemberPendingActionInput {
  characterId?: number | null;
  expiresAt?: string | null;
  invitedByUserId?: number | null;
  kind: OrganizationMemberPendingKind;
  memberId: number;
  requestedCharacterName?: string | null;
  requestedCharacterNotes?: string | null;
  requestedCharacterSlug?: string | null;
  requestedGameId?: number | null;
}

export interface GameRecord {
  created_at: string;
  description: string | null;
  icon_url: string | null;
  id: number;
  is_active: number;
  name: string;
  slug: string;
  source: GameSource;
  source_id: string | null;
  type: GameType;
  updated_at: string;
}

export interface CreateGameInput {
  description?: string | null;
  iconUrl?: string | null;
  isActive?: boolean;
  name: string;
  slug: string;
  source?: GameSource;
  sourceId?: string | null;
  type?: GameType;
}

export interface UpdateGameInput {
  description?: string | null;
  iconUrl?: string | null;
  isActive?: boolean;
  name?: string;
  slug?: string;
  source?: GameSource;
  sourceId?: string | null;
  type?: GameType;
}

export interface GameAliasRecord {
  alias: string;
  alias_type: GameAliasType;
  created_at: string;
  game_id: number;
  id: number;
  locale: LocaleCode | null;
  sort_order: number;
  updated_at: string;
}

export interface CreateGameAliasInput {
  alias: string;
  aliasType?: GameAliasType;
  gameId: number;
  locale?: LocaleCode | null;
  sortOrder?: number;
}

export interface OrganizationGameRecord {
  created_at: string;
  display_name: string | null;
  game_id: number;
  id: number;
  is_primary: number;
  organization_id: number;
  sort_order: number;
  updated_at: string;
}

export interface CreateOrganizationGameInput {
  displayName?: string | null;
  gameId: number;
  isPrimary?: boolean;
  organizationId: number;
  sortOrder?: number;
}

export interface UpdateOrganizationGameInput {
  displayName?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface OfficialStaffRecord {
  created_at: string;
  id: number;
  role: OfficialStaffRole;
  updated_at: string;
  user_id: number;
}

export interface CreateOfficialStaffInput {
  role?: OfficialStaffRole;
  userId: number;
}

export interface AssetRecord {
  asset_key: string;
  created_at: string;
  created_by_user_id: number | null;
  game_id: number;
  icon_url: string | null;
  id: number;
  is_default_settlement_unit: number;
  merged_at: string | null;
  merged_by_user_id: number | null;
  metadata_json: string | null;
  name: string;
  normalized_name: string;
  organization_id: number | null;
  rarity_label: string | null;
  scope: AssetScope;
  asset_type: AssetType;
  canonical_asset_id: number | null;
  status: AssetStatus;
  updated_at: string;
}

export interface CreateAssetInput {
  assetKey: string;
  scope?: AssetScope;
  assetType?: AssetType;
  canonicalAssetId?: number | null;
  createdByUserId?: number | null;
  gameId: number;
  iconUrl?: string | null;
  isDefaultSettlementUnit?: boolean;
  metadataJson?: string | null;
  mergedAt?: string | null;
  mergedByUserId?: number | null;
  name: string;
  normalizedName: string;
  organizationId?: number | null;
  rarityLabel?: string | null;
  status?: AssetStatus;
}

export interface UpdateAssetInput {
  assetKey?: string;
  scope?: AssetScope;
  assetType?: AssetType;
  canonicalAssetId?: number | null;
  gameId?: number;
  iconUrl?: string | null;
  isDefaultSettlementUnit?: boolean;
  metadataJson?: string | null;
  mergedAt?: string | null;
  mergedByUserId?: number | null;
  name?: string;
  normalizedName?: string;
  organizationId?: number | null;
  rarityLabel?: string | null;
  status?: AssetStatus;
}

export interface EventRecord {
  asset_id: number | null;
  created_at: string;
  created_by_user_id: number | null;
  event_key: string;
  event_type: EventType;
  game_id: number | null;
  holder_ref: string | null;
  holder_type: EventHolderType;
  id: number;
  notes: string | null;
  occurred_at: string;
  organization_id: number;
  source_type: EventSourceType;
  status: EventStatus;
  title: string;
  updated_at: string;
}

export interface CreateEventInput {
  assetId?: number | null;
  createdByUserId?: number | null;
  eventKey: string;
  eventType?: EventType;
  gameId?: number | null;
  holderRef?: string | null;
  holderType?: EventHolderType;
  notes?: string | null;
  occurredAt: string;
  organizationId: number;
  sourceType?: EventSourceType;
  status?: EventStatus;
  title: string;
}

export interface UpdateEventInput {
  assetId?: number | null;
  eventKey?: string;
  eventType?: EventType;
  gameId?: number | null;
  holderRef?: string | null;
  holderType?: EventHolderType;
  notes?: string | null;
  occurredAt?: string;
  sourceType?: EventSourceType;
  status?: EventStatus;
  title?: string;
}

export interface EventParticipantRecord {
  character_id: number | null;
  created_at: string;
  event_id: number;
  id: number;
  joined_at: string | null;
  left_at: string | null;
  role_label: string | null;
  updated_at: string;
  weight: number;
}

export interface CreateEventParticipantInput {
  characterId?: number | null;
  eventId: number;
  joinedAt?: string | null;
  leftAt?: string | null;
  roleLabel?: string | null;
  weight?: number;
}

export interface UpdateEventParticipantInput {
  characterId?: number | null;
  joinedAt?: string | null;
  leftAt?: string | null;
  roleLabel?: string | null;
  weight?: number;
}

export interface SettlementRecord {
  allocation_mode: SettlementAllocationMode;
  created_at: string;
  created_by_user_id: number | null;
  decided_at: string;
  event_id: number | null;
  fee_amount: number | null;
  fee_mode: SettlementFeeMode;
  fee_percent: number | null;
  fee_rule_key: string | null;
  gross_amount: number;
  id: number;
  net_amount: number;
  notes: string | null;
  organization_id: number;
  payer_ref: string | null;
  payer_type: SettlementPayerType;
  settlement_key: string;
  settlement_type: SettlementType;
  status: SettlementStatus;
  title: string;
  unit_asset_id: number | null;
  updated_at: string;
}

export interface CreateSettlementInput {
  allocationMode?: SettlementAllocationMode;
  createdByUserId?: number | null;
  decidedAt: string;
  eventId?: number | null;
  feeAmount?: number | null;
  feeMode?: SettlementFeeMode;
  feePercent?: number | null;
  feeRuleKey?: string | null;
  grossAmount: number;
  netAmount: number;
  notes?: string | null;
  organizationId: number;
  payerRef?: string | null;
  payerType?: SettlementPayerType;
  settlementKey: string;
  settlementType?: SettlementType;
  status?: SettlementStatus;
  title: string;
  unitAssetId?: number | null;
}

export interface UpdateSettlementInput {
  allocationMode?: SettlementAllocationMode;
  decidedAt?: string;
  eventId?: number | null;
  feeAmount?: number | null;
  feeMode?: SettlementFeeMode;
  feePercent?: number | null;
  feeRuleKey?: string | null;
  grossAmount?: number;
  netAmount?: number;
  notes?: string | null;
  payerRef?: string | null;
  payerType?: SettlementPayerType;
  settlementKey?: string;
  settlementType?: SettlementType;
  status?: SettlementStatus;
  title?: string;
  unitAssetId?: number | null;
}

export interface AssetAliasRecord {
  alias: string;
  alias_type: AssetAliasType;
  asset_id: number;
  created_at: string;
  id: number;
  is_primary: number;
  locale: LocaleCode | null;
  normalized_alias: string;
  region_code: string | null;
  updated_at: string;
}

export interface CreateAssetAliasInput {
  alias: string;
  aliasType?: AssetAliasType;
  assetId: number;
  isPrimary?: boolean;
  locale?: LocaleCode | null;
  normalizedAlias: string;
  regionCode?: string | null;
}

export interface UpdateAssetAliasInput {
  alias?: string;
  aliasType?: AssetAliasType;
  isPrimary?: boolean;
  locale?: LocaleCode | null;
  normalizedAlias?: string;
  regionCode?: string | null;
}

export interface MarketScopeRecord {
  created_at: string;
  game_id: number;
  id: number;
  is_active: number;
  name: string;
  region_code: string | null;
  scope_key: string;
  scope_type: MarketScopeType;
  server_code: string | null;
  updated_at: string;
}

export interface CreateMarketScopeInput {
  gameId: number;
  isActive?: boolean;
  name: string;
  regionCode?: string | null;
  scopeKey: string;
  scopeType?: MarketScopeType;
  serverCode?: string | null;
}

export interface UpdateMarketScopeInput {
  isActive?: boolean;
  name?: string;
  regionCode?: string | null;
  scopeKey?: string;
  scopeType?: MarketScopeType;
  serverCode?: string | null;
}

export interface SettlementAllocationRecord {
  amount: number;
  character_id: number | null;
  created_at: string;
  id: number;
  ratio: number | null;
  settlement_id: number;
  status: SettlementAllocationStatus;
  updated_at: string;
  weight: number;
}

export interface CreateSettlementAllocationInput {
  amount: number;
  characterId?: number | null;
  ratio?: number | null;
  settlementId: number;
  status?: SettlementAllocationStatus;
  weight?: number;
}

export interface UpdateSettlementAllocationInput {
  amount?: number;
  characterId?: number | null;
  ratio?: number | null;
  status?: SettlementAllocationStatus;
  weight?: number;
}

export interface SettlementClaimRecord {
  amount: number;
  claimed_at: string;
  claimed_by_character_id: number | null;
  confirmed_at: string | null;
  confirmed_by_user_id: number | null;
  created_at: string;
  id: number;
  method: SettlementClaimMethod;
  notes: string | null;
  settlement_allocation_id: number;
  status: SettlementClaimStatus;
  updated_at: string;
  voided_at: string | null;
  voided_by_user_id: number | null;
}

export interface CreateSettlementClaimInput {
  amount: number;
  claimedAt: string;
  claimedByCharacterId?: number | null;
  confirmedAt?: string | null;
  confirmedByUserId?: number | null;
  method?: SettlementClaimMethod;
  notes?: string | null;
  settlementAllocationId: number;
  status?: SettlementClaimStatus;
  voidedAt?: string | null;
  voidedByUserId?: number | null;
}

export interface UpdateSettlementClaimInput {
  amount?: number;
  claimedAt?: string;
  claimedByCharacterId?: number | null;
  confirmedAt?: string | null;
  confirmedByUserId?: number | null;
  method?: SettlementClaimMethod;
  notes?: string | null;
  status?: SettlementClaimStatus;
  voidedAt?: string | null;
  voidedByUserId?: number | null;
}
