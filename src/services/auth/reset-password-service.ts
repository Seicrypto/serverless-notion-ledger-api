import { D1Client } from "../../infrastructure/d1/d1-client";
import { hashPassword } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { UsersRepository } from "../../repositories/users-repository";
import type { Env } from "../../types/env";
import { PasswordResetTokenService } from "./password-reset-token-service";

export interface ResetPasswordInput {
  key: string;
  password: string;
  token: string;
}

export interface ResetPasswordResult {
  email: string;
  userId: number;
}

export class ResetPasswordService {
  constructor(private readonly env: Env) {}

  async execute(input: ResetPasswordInput): Promise<ResetPasswordResult> {
    const tokenService = new PasswordResetTokenService(this.env);
    const consumed = await tokenService.consumeToken({
      key: input.key,
      token: input.token,
    });

    if (!consumed) {
      throw new AppError("Password reset link is invalid or expired", 400);
    }

    const db = new D1Client(this.env.APP_DB);
    const usersRepository = new UsersRepository(db);
    const user = await usersRepository.findById(consumed.userId);

    if (!user || user.email !== consumed.email) {
      throw new AppError("Password reset target was not found", 404);
    }

    if (user.status !== "active") {
      throw new AppError("Only active users can reset passwords", 403);
    }

    const updated = await usersRepository.setPasswordHash(
      user.id,
      await hashPassword(input.password, this.env.PASSWORD_PEPPER ?? ""),
    );

    return {
      email: updated.email,
      userId: updated.id,
    };
  }
}
