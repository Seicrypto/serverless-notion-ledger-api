import { D1Client } from "../../infrastructure/d1/d1-client";
import { ResendClient } from "../../infrastructure/resend/resend-client";
import { UsersRepository } from "../../repositories/users-repository";
import type { Env } from "../../types/env";
import { PasswordResetTokenService } from "./password-reset-token-service";

export interface ForgotPasswordInput {
  email: string;
}

export class ForgotPasswordService {
  constructor(private readonly env: Env) {}

  async execute(input: ForgotPasswordInput): Promise<void> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const db = new D1Client(this.env.APP_DB);
    const usersRepository = new UsersRepository(db);
    const user = await usersRepository.findByEmail(normalizedEmail);

    if (!user || user.status !== "active") {
      return;
    }

    const tokenService = new PasswordResetTokenService(this.env);
    const resendClient = new ResendClient(
      this.env.RESEND_API_KEY,
      this.env.RESEND_FROM_EMAIL,
    );
    const resetToken = await tokenService.issueToken({
      email: user.email,
      userId: user.id,
    });

    await resendClient.sendPasswordResetEmail({
      passwordResetUrl: `${this.env.APP_BASE_URL}/auth/reset-password?key=${encodeURIComponent(
        resetToken.key,
      )}&token=${encodeURIComponent(resetToken.token)}`,
      to: user.email,
    });
  }
}
