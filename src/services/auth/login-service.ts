import { D1Client } from "../../infrastructure/d1/d1-client";
import { verifyPassword } from "../../lib/crypto";
import { ForbiddenError, UnauthorizedError } from "../../lib/errors";
import { signSessionJwt } from "../../lib/jwt";
import { UsersRepository } from "../../repositories/users-repository";
import type { Env } from "../../types/env";

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  email: string;
  token: string;
  userId: number;
}

export class LoginService {
  constructor(private readonly env: Env) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const db = new D1Client(this.env.APP_DB);
    const usersRepository = new UsersRepository(db);
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await usersRepository.findByEmail(normalizedEmail);

    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const passwordValid = await verifyPassword(
      input.password,
      user.password_hash,
      this.env.PASSWORD_PEPPER ?? "",
    );

    if (!passwordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.status === "pending_verification") {
      throw new ForbiddenError("Please verify your email before logging in");
    }

    if (user.status === "pending_approval") {
      throw new ForbiddenError("Your account is pending approval");
    }

    if (user.status === "disabled") {
      throw new ForbiddenError("Your account has been disabled");
    }

    const token = await signSessionJwt({
      email: user.email,
      secret: this.env.JWT_SECRET,
      subject: String(user.id),
    });

    return {
      email: user.email,
      token,
      userId: user.id,
    };
  }
}
