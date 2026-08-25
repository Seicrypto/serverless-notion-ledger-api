import { D1Client } from "../../infrastructure/d1/d1-client";
import { ResendClient } from "../../infrastructure/resend/resend-client";
import { ConflictError } from "../../lib/errors";
import { hashPassword } from "../../lib/crypto";
import { generateInitialUserVanity } from "../../lib/vanity";
import { OfficialStaffsRepository } from "../../repositories/official-staffs-repository";
import { UsersRepository } from "../../repositories/users-repository";
import type { UserStatus } from "../../repositories/types";
import type { Env } from "../../types/env";
import { EmailVerificationTokenService } from "./email-verification-token-service";
import { isOfficialAdminEmail } from "./official-email-allowlist";

export interface RegisterUserInput {
  displayName?: string;
  email: string;
  password: string;
}

export interface RegisterUserResult {
  email: string;
  requiresEmailVerification: boolean;
  status: UserStatus;
  userId: number;
}

export class RegisterService {
  constructor(private readonly env: Env) {}

  private async reserveInitialVanity(
    usersRepository: UsersRepository,
    displayName?: string | null,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const vanity = generateInitialUserVanity(displayName);
      const existing = await usersRepository.findByVanity(vanity);

      if (!existing) {
        return vanity;
      }
    }

    throw new Error("Failed to allocate user vanity");
  }

  async execute(input: RegisterUserInput): Promise<RegisterUserResult> {
    const db = new D1Client(this.env.APP_DB);
    const usersRepository = new UsersRepository(db);
    const officialStaffsRepository = new OfficialStaffsRepository(db);
    const resendClient = new ResendClient(
      this.env.RESEND_API_KEY,
      this.env.RESEND_FROM_EMAIL,
    );
    const emailVerificationTokenService = new EmailVerificationTokenService(this.env);
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await usersRepository.findByEmail(normalizedEmail);

    if (existing) {
      throw new ConflictError("Email is already registered");
    }

    const isOfficial = isOfficialAdminEmail(
      normalizedEmail,
      this.env.OFFICIAL_ADMIN_EMAILS,
    );
    const timestamp = new Date().toISOString();
    const vanity = await this.reserveInitialVanity(
      usersRepository,
      input.displayName,
    );
    const user = await usersRepository.create({
      displayName: input.displayName?.trim() || null,
      email: normalizedEmail,
      emailVerifiedAt: isOfficial ? timestamp : null,
      passwordHash: await hashPassword(
        input.password,
        this.env.PASSWORD_PEPPER ?? "",
      ),
      status: isOfficial ? "active" : "pending_verification",
      vanity,
    });

    if (isOfficial) {
      await officialStaffsRepository.create({
        role: "admin",
        userId: user.id,
      });

      return {
        email: user.email,
        requiresEmailVerification: false,
        status: user.status,
        userId: user.id,
      };
    }

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

    return {
      email: user.email,
      requiresEmailVerification: true,
      status: user.status,
      userId: user.id,
    };
  }
}
