import { D1Client } from "../../infrastructure/d1/d1-client";
import { ResendClient } from "../../infrastructure/resend/resend-client";
import { UsersRepository } from "../../repositories/users-repository";
import type { Env } from "../../types/env";
import { EmailVerificationTokenService } from "./email-verification-token-service";

export interface ResendEmailVerificationInput {
  email: string;
}

export class ResendEmailVerificationService {
  constructor(private readonly env: Env) {}

  async execute(input: ResendEmailVerificationInput): Promise<void> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const db = new D1Client(this.env.APP_DB);
    const usersRepository = new UsersRepository(db);
    const resendClient = new ResendClient(
      this.env.RESEND_API_KEY,
      this.env.RESEND_FROM_EMAIL,
    );
    const user = await usersRepository.findByEmail(normalizedEmail);

    if (!user || user.status !== "pending_verification") {
      return;
    }

    const emailVerificationTokenService = new EmailVerificationTokenService(this.env);
    const verificationToken = await emailVerificationTokenService.issueToken({
      email: user.email,
      userId: user.id,
    });

    await resendClient.sendVerificationEmail({
      to: user.email,
      verificationUrl: `${this.env.APP_BASE_URL}/auth/verify-email?key=${encodeURIComponent(
        verificationToken.key,
      )}&token=${encodeURIComponent(verificationToken.token)}`,
    });
  }
}
