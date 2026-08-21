import { D1Client } from "../../infrastructure/d1/d1-client";
import { ForbiddenError, UnauthorizedError } from "../../lib/errors";
import { verifySessionJwt } from "../../lib/jwt";
import { OfficialStaffsRepository } from "../../repositories/official-staffs-repository";
import { UsersRepository } from "../../repositories/users-repository";
import type { OfficialStaffRecord, UserRecord } from "../../repositories/types";
import type { Env } from "../../types/env";

export interface AuthenticatedSession {
  staff: OfficialStaffRecord | null;
  user: UserRecord;
}

export class SessionAuthService {
  constructor(private readonly env: Env) {}

  async requireActiveUser(token?: string): Promise<AuthenticatedSession> {
    if (!token) {
      throw new UnauthorizedError("Authentication required");
    }

    const payload = await verifySessionJwt({
      secret: this.env.JWT_SECRET,
      token,
    });

    if (!payload) {
      throw new UnauthorizedError("Session is invalid or expired");
    }

    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedError("Session subject is invalid");
    }

    const db = new D1Client(this.env.APP_DB);
    const usersRepository = new UsersRepository(db);
    const officialStaffsRepository = new OfficialStaffsRepository(db);
    const user = await usersRepository.findById(userId);

    if (!user) {
      throw new UnauthorizedError("Authenticated user was not found");
    }

    if (user.status !== "active") {
      throw new ForbiddenError("Your account is not active");
    }

    const staff = await officialStaffsRepository.findByUserId(user.id);

    return { staff, user };
  }

  async requireOfficialAdmin(token?: string): Promise<AuthenticatedSession> {
    const session = await this.requireActiveUser(token);

    if (!session.staff || session.staff.role !== "admin") {
      throw new ForbiddenError("Official admin access is required");
    }

    return session;
  }
}
