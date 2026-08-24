import type { DatabaseClient } from "../../infrastructure/database/database-client";
import { CharactersRepository } from "../../repositories/characters-repository";
import type { CharacterRecord } from "../../repositories/types";

export class OrganizationCharacterLifecycleService {
  constructor(private readonly db: DatabaseClient) {}

  async softDeleteCharacter(
    characterId: number,
    deletedByUserId?: number | null,
  ): Promise<CharacterRecord> {
    const repository = new CharactersRepository(this.db);
    return repository.delete(characterId, {
      deletedByUserId,
    });
  }

  async restoreCharacter(characterId: number): Promise<CharacterRecord> {
    const repository = new CharactersRepository(this.db);
    return repository.restore(characterId);
  }
}
