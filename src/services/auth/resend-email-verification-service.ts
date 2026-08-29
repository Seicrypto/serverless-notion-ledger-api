import { D1Client } from "../../infrastructure/d1/d1-client";
import { ResendClient } from "../../infrastructure/resend/resend-client";
import { UsersRepository } from "../../repositories/users-repository";
import type { Env } from "../../types/env";
import { EmailVerificationTokenService } from "./email-verification-token-service";

export interface ResendEmailVerificationInput {
  email: string;
}

export interface ResendEmailVerificationResult {
  email: string;
  resent: boolean;
  status: "pending_verification" | null;
}

export class ResendEmailVerificationService {
  constructor(private readonly env: Env) {}

  async execute(
    input: ResendEmailVerificationInput,
  ): Promise<ResendEmailVerificationResult> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const db = new D1Client(this.env.APP_DB);
    const usersRepository = new UsersRepository(db);
    const resendClient = new ResendClient(
      this.env.RESEND_API_KEY,
      this.env.RESEND_FROM_EMAIL,
    );
    const user = await usersRepository.findByEmail(normalizedEmail);

    if (!user || user.status !== "pending_verification") {
      console.info(
        JSON.stringify({
          email: normalizedEmail,
          status: user?.status ?? null,
          step: "ignored-non-pending-user",
          topic: "auth.resend-verification",
          userId: user?.id ?? null,
        }),
      );
      return {
        email: normalizedEmail,
        resent: false,
        status: null,
      };
    }

    const emailVerificationTokenService = new EmailVerificationTokenService(this.env);
    let verificationToken;

    try {
      verificationToken = await emailVerificationTokenService.issueToken({
        email: user.email,
        enforceCooldown: true,
        userId: user.id,
      });
    } catch (error) {
      console.warn(
        JSON.stringify({
          email: user.email,
          error: error instanceof Error ? error.message : String(error),
          step: "cooldown-blocked",
          topic: "auth.resend-verification",
          userId: user.id,
        }),
      );
      throw error;
    }

    console.info(
      JSON.stringify({
        email: user.email,
        expiresAt: verificationToken.expiresAt,
        key: verificationToken.key,
        step: "verification-token-issued",
        topic: "auth.resend-verification",
        userId: user.id,
      }),
    );

    try {
      await resendClient.sendVerificationEmail({
        to: user.email,
        verificationUrl: `${this.env.APP_BASE_URL}/auth/verify-email?key=${encodeURIComponent(
          verificationToken.key,
        )}&token=${encodeURIComponent(verificationToken.token)}`,
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          email: user.email,
          error: error instanceof Error ? error.message : String(error),
          step: "send-verification-email-failed",
          topic: "auth.resend-verification",
          userId: user.id,
        }),
      );
      throw error;
    }

    console.info(
      JSON.stringify({
        email: user.email,
        step: "verification-email-sent",
        topic: "auth.resend-verification",
        userId: user.id,
      }),
    );

    return {
      email: user.email,
      resent: true,
      status: "pending_verification",
    };
  }
}
