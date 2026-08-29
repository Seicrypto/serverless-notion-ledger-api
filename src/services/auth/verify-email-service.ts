import { D1Client } from "../../infrastructure/d1/d1-client";
import { AppError } from "../../lib/errors";
import { UsersRepository } from "../../repositories/users-repository";
import type { Env } from "../../types/env";
import { EmailVerificationTokenService } from "./email-verification-token-service";

export interface VerifyEmailInput {
  code?: string;
  key: string;
  token?: string;
}

export interface VerifyEmailResult {
  email: string;
  status: "active" | "pending_approval";
  userId: number;
}

export class VerifyEmailService {
  constructor(private readonly env: Env) {}

  async execute(input: VerifyEmailInput): Promise<VerifyEmailResult> {
    const tokenService = new EmailVerificationTokenService(this.env);
    const consumed = await tokenService.consumeToken(input);

    if (!consumed) {
      throw new AppError("Verification link is invalid or expired", 400);
    }

    const db = new D1Client(this.env.APP_DB);
    const usersRepository = new UsersRepository(db);
    const user = await usersRepository.findById(consumed.userId);

    if (!user || user.email !== consumed.email) {
      throw new AppError("Verification target was not found", 404);
    }

    if (user.status === "disabled") {
      throw new AppError("This account has been disabled", 403);
    }

    const nextStatus = user.status === "active" ? "active" : "pending_approval";
    const updated = await usersRepository.update(user.id, {
      emailVerifiedAt: user.email_verified_at ?? new Date().toISOString(),
      status: nextStatus,
    });

    return {
      email: updated.email,
      status: updated.status as "active" | "pending_approval",
      userId: updated.id,
    };
  }
}
