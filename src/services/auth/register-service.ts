import { D1Client } from "../../infrastructure/d1/d1-client";
import { ResendClient } from "../../infrastructure/resend/resend-client";
import { AppError, ConflictError } from "../../lib/errors";
import { hashPassword } from "../../lib/crypto";
import { generateInitialUserVanity } from "../../lib/vanity";
import { OfficialStaffsRepository } from "../../repositories/official-staffs-repository";
import { UserProfilesRepository } from "../../repositories/user-profiles-repository";
import { UsersRepository } from "../../repositories/users-repository";
import type { UserRecord, UserStatus } from "../../repositories/types";
import type { Env } from "../../types/env";
import type { SupportedFrontendLanguage } from "../../types/locale";
import { normalizeFrontendLanguage } from "../../types/locale";
import { EmailVerificationTokenService } from "./email-verification-token-service";
import { isOfficialAdminEmail } from "./official-email-allowlist";

export interface RegisterUserInput {
  displayName?: string;
  email: string;
  lang?: string;
  password: string;
}

export interface RegisterUserResult {
  email: string;
  requiresEmailVerification: boolean;
  status: UserStatus;
  userId: number;
}

export class RegistrationConflictError extends ConflictError {
  constructor(
    readonly registration: {
      canResendVerification: boolean;
      email: string;
      requiresEmailVerification: boolean;
      status: UserStatus;
    },
  ) {
    super(buildRegistrationConflictMessage(registration.status), {
      code: "EMAIL_ALREADY_REGISTERED",
    });
    this.name = "RegistrationConflictError";
  }
}

function buildRegistrationConflictMessage(status: UserStatus): string {
  switch (status) {
    case "pending_verification":
      return "This email is already registered and still pending verification.";
    case "pending_approval":
      return "This email is already registered and pending approval.";
    case "active":
      return "This email is already registered.";
    case "disabled":
      return "This email belongs to a disabled account.";
  }
}

function toRegistrationConflict(existing: UserRecord): RegistrationConflictError {
  return new RegistrationConflictError({
    canResendVerification: existing.status === "pending_verification",
    email: existing.email,
    requiresEmailVerification: existing.status === "pending_verification",
    status: existing.status,
  });
}

export class RegisterService {
  constructor(private readonly env: Env) {}

  private buildVerificationUrl(input: {
    code: string;
    email: string;
    key: string;
    lang: SupportedFrontendLanguage;
    token: string;
  }): string {
    const baseUrl = this.env.APP_FRONTEND_URL ?? this.env.APP_BASE_URL;
    const url = new URL(`/${input.lang}/account-status`, baseUrl);
    url.searchParams.set("mode", "verify-email");
    url.searchParams.set("status", "pending_verification");
    url.searchParams.set("email", input.email);
    url.searchParams.set("key", input.key);
    url.searchParams.set("token", input.token);
    url.searchParams.set("code", input.code);
    return url.toString();
  }

  private buildApiVerificationUrl(input: { key: string; token: string }): string {
    const url = new URL("/auth/verify-email", this.env.APP_BASE_URL);
    url.searchParams.set("key", input.key);
    url.searchParams.set("token", input.token);
    return url.toString();
  }

  private resolvePreferredLocale(lang?: string): SupportedFrontendLanguage {
    return normalizeFrontendLanguage(lang);
  }

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
    const userProfilesRepository = new UserProfilesRepository(db);
    const officialStaffsRepository = new OfficialStaffsRepository(db);
    const resendClient = new ResendClient(
      this.env.RESEND_API_KEY,
      this.env.RESEND_FROM_EMAIL,
    );
    const emailVerificationTokenService = new EmailVerificationTokenService(this.env);
    const normalizedEmail = input.email.trim().toLowerCase();
    const preferredLocale = this.resolvePreferredLocale(input.lang);
    const existing = await usersRepository.findByEmail(normalizedEmail);

    if (existing) {
      console.info(
        JSON.stringify({
          email: normalizedEmail,
          status: existing.status,
          step: "duplicate-email",
          topic: "auth.register",
          userId: existing.id,
        }),
      );
      throw toRegistrationConflict(existing);
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
    await userProfilesRepository.upsert({
      preferredLocale,
      userId: user.id,
    });

    console.info(
      JSON.stringify({
        email: user.email,
        isOfficial,
        status: user.status,
        step: "user-created",
        topic: "auth.register",
        userId: user.id,
      }),
    );

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
      enforceCooldown: false,
      userId: user.id,
    });

    console.info(
      JSON.stringify({
        email: user.email,
        expiresAt: verificationToken.expiresAt,
        key: verificationToken.key,
        step: "verification-token-issued",
        topic: "auth.register",
        userId: user.id,
      }),
    );

    try {
      await resendClient.sendVerificationEmail({
        fallbackVerificationUrl: this.buildApiVerificationUrl(verificationToken),
        to: user.email,
        verificationCode: verificationToken.code,
        verificationUrl: this.buildVerificationUrl({
          ...verificationToken,
          email: user.email,
          lang: preferredLocale,
        }),
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          email: user.email,
          error: error instanceof Error ? error.message : String(error),
          step: "send-verification-email-failed",
          topic: "auth.register",
          userId: user.id,
        }),
      );
      throw error;
    }

    console.info(
      JSON.stringify({
        email: user.email,
        step: "verification-email-sent",
        topic: "auth.register",
        userId: user.id,
      }),
    );

    return {
      email: user.email,
      requiresEmailVerification: true,
      status: user.status,
      userId: user.id,
    };
  }
}
