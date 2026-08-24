import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { OrganizationMembersRepository } from "../../repositories/organization-members-repository";
import type { OrganizationMemberRecord } from "../../repositories/types";

export class OrganizationMemberLifecycleService {
  constructor(private readonly db: DatabaseClient) {}

  async leaveMember(memberId: number): Promise<OrganizationMemberRecord> {
    const repository = new OrganizationMembersRepository(this.db);
    return repository.softLeave(memberId);
  }

  async removeMember(memberId: number): Promise<OrganizationMemberRecord> {
    const repository = new OrganizationMembersRepository(this.db);
    return repository.softRemove(memberId);
  }

  async reactivateMember(
    memberId: number,
    options: {
      status?: "pending" | "active";
    } = {},
  ): Promise<OrganizationMemberRecord> {
    const repository = new OrganizationMembersRepository(this.db);
    return repository.reactivate(memberId, options);
  }
}
