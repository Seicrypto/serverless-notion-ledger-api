import { D1Client } from "../../infrastructure/d1/d1-client";
import { UsersRepository } from "../../repositories/users-repository";
import type { Env } from "../../types/env";

export interface UpdateDisplayNameInput {
  displayName: string;
  userId: number;
}

export interface UpdateDisplayNameResult {
  displayName: string;
  email: string;
  userId: number;
}

export class UpdateDisplayNameService {
  constructor(private readonly env: Env) {}

  async execute(input: UpdateDisplayNameInput): Promise<UpdateDisplayNameResult> {
    const db = new D1Client(this.env.APP_DB);
    const usersRepository = new UsersRepository(db);
    const updated = await usersRepository.update(input.userId, {
      displayName: input.displayName.trim(),
    });

    return {
      displayName: updated.display_name ?? "",
      email: updated.email,
      userId: updated.id,
    };
  }
}
