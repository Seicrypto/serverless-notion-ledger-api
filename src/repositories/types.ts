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
