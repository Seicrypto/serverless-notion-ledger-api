import { D1Client } from "../../infrastructure/d1/d1-client";
import { AppError } from "../../lib/errors";
import { UsersRepository } from "../../repositories/users-repository";
import type { UserRecord, UserStatus } from "../../repositories/types";
import type { Env } from "../../types/env";

export type ManagedUserTargetStatus = "active" | "disabled";

export class ManageUserStatusService {
  constructor(private readonly env: Env) {}

  async listPendingApprovalUsers(): Promise<UserRecord[]> {
    const db = new D1Client(this.env.APP_DB);
    const usersRepository = new UsersRepository(db);
    const users = await usersRepository.list();
    return users.filter((user) => user.status === "pending_approval");
  }

  async setStatus(
    userId: number,
    targetStatus: ManagedUserTargetStatus,
  ): Promise<UserRecord> {
    const db = new D1Client(this.env.APP_DB);
    const usersRepository = new UsersRepository(db);
    const user = await usersRepository.findById(userId);

    if (!user) {
      throw new AppError("Target user was not found", 404);
    }

    if (targetStatus === "active" && !user.email_verified_at) {
      throw new AppError("User must verify email before activation", 400);
    }

    if (targetStatus === "active") {
      if (
        user.status !== "pending_approval" &&
        user.status !== "disabled" &&
        user.status !== "active"
      ) {
        throw new AppError("User cannot be activated from the current state", 400);
      }
    }

    if (targetStatus === "disabled" && user.status === "pending_verification") {
      throw new AppError("Pending verification users cannot be disabled", 400);
    }

    return usersRepository.update(userId, {
      status: targetStatus satisfies UserStatus,
    });
  }
}
