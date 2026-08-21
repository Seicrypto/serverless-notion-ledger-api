import { KvJsonRepository } from "../../infrastructure/kv/kv-json-repository";
import { hashToken, randomToken } from "../../lib/crypto";
import type { Env } from "../../types/env";

const EMAIL_VERIFICATION_TTL_SECONDS = 15 * 60;

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
  }): Promise<EmailVerificationTokenIssueResult> {
    const tokenId = randomToken(12);
    const token = randomToken(32);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000,
    ).toISOString();
    const key = this.keyFor(input.userId, tokenId);

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

    return {
      expiresAt,
      key,
      token,
    };
  }

  keyFor(userId: number, tokenId: string): string {
    return `auth:email-verify:${userId}:${tokenId}`;
  }
}
