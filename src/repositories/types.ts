export type UserStatus =
  | "pending_verification"
  | "pending_approval"
  | "active"
  | "disabled";
export type OrganizationMemberRole = "owner" | "admin" | "member";
export type OfficialStaffRole = "admin" | "staff";

export interface UserRecord {
  created_at: string;
  display_name: string | null;
  email: string;
  email_verified_at: string | null;
  id: number;
  password_hash: string;
  status: UserStatus;
  updated_at: string;
}

export interface CreateUserInput {
  displayName?: string | null;
  email: string;
  emailVerifiedAt?: string | null;
  passwordHash: string;
  status?: UserStatus;
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
}

export interface CreateOrganizationInput {
  createdByUserId: number;
  description?: string | null;
  iconUrl?: string | null;
  name: string;
  slug: string;
}

export interface UpdateOrganizationInput {
  description?: string | null;
  iconUrl?: string | null;
  name?: string;
  slug?: string;
}

export interface OrganizationMemberRecord {
  created_at: string;
  id: number;
  joined_at: string;
  organization_id: number;
  role: OrganizationMemberRole;
  user_id: number;
}

export interface CreateOrganizationMemberInput {
  joinedAt?: string;
  organizationId: number;
  role?: OrganizationMemberRole;
  userId: number;
}

export interface CharacterRecord {
  claimed_by_user_id: number | null;
  created_at: string;
  id: number;
  is_active: number;
  name: string;
  notes: string | null;
  organization_id: number;
  slug: string | null;
  updated_at: string;
}

export interface CreateCharacterInput {
  claimedByUserId?: number | null;
  isActive?: boolean;
  name: string;
  notes?: string | null;
  organizationId: number;
  slug?: string | null;
}

export interface UpdateCharacterInput {
  claimedByUserId?: number | null;
  isActive?: boolean;
  name?: string;
  notes?: string | null;
  slug?: string | null;
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
