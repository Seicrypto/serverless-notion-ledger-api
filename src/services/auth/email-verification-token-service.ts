import { KvJsonRepository } from "../../infrastructure/kv/kv-json-repository";
import { AppError } from "../../lib/errors";
import { hashToken, randomToken } from "../../lib/crypto";
import type { Env } from "../../types/env";

const EMAIL_VERIFICATION_TTL_SECONDS = 15 * 60;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;

interface EmailVerificationResendCooldownPayload {
  createdAt: string;
  retryAfterSeconds: number;
}

export interface EmailVerificationTokenPayload {
  createdAt: string;
  email: string;
  expiresAt: string;
  tokenHash: string;
  userId: number;
}

export interface EmailVerificationTokenIssueResult {
  expiresAt: string;
  key: string;
  token: string;
}

export class EmailVerificationTokenService {
  private readonly repository: KvJsonRepository;

  constructor(private readonly env: Env) {
    this.repository = new KvJsonRepository(env.SNAPSHOT_CACHE);
  }

  async consumeToken(input: {
    key: string;
    token: string;
  }): Promise<EmailVerificationTokenPayload | null> {
    const stored = await this.repository.get<EmailVerificationTokenPayload>(input.key);

    if (!stored) {
      return null;
    }

    const providedHash = await hashToken(input.token);
    if (providedHash !== stored.tokenHash) {
      return null;
    }

    await this.repository.delete(input.key);
    return stored;
  }

  async issueToken(input: {
    email: string;
    userId: number;
    enforceCooldown?: boolean;
  }): Promise<EmailVerificationTokenIssueResult> {
    const token = randomToken(32);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000,
    ).toISOString();
    const key = this.keyFor(input.userId);
    const cooldownKey = this.cooldownKeyFor(input.userId);

    if (input.enforceCooldown) {
      const cooldown =
        await this.repository.get<EmailVerificationResendCooldownPayload>(cooldownKey);

      if (cooldown) {
        throw new AppError(
          "Verification email was sent recently. Please wait before retrying.",
          429,
          {
            code: "EMAIL_VERIFICATION_RESEND_COOLDOWN",
          },
        );
      }
    }

    await this.repository.put<EmailVerificationTokenPayload>(
      key,
      {
        createdAt,
        email: input.email,
        expiresAt,
        tokenHash: await hashToken(token),
        userId: input.userId,
      },
      EMAIL_VERIFICATION_TTL_SECONDS,
    );
    await this.repository.put<EmailVerificationResendCooldownPayload>(
      cooldownKey,
      {
        createdAt,
        retryAfterSeconds: EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      },
      EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    );

    return {
      expiresAt,
      key,
      token,
    };
  }

  keyFor(userId: number): string {
    return `auth:email-verify:${userId}`;
  }

  cooldownKeyFor(userId: number): string {
    return `auth:email-verify:cooldown:${userId}`;
  }
}
