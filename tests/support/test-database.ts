import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SqliteCliClient } from "./sqlite-cli-client";

const execFileAsync = promisify(execFile);

export interface TestDatabaseContext {
  cleanup(): Promise<void>;
  db: SqliteCliClient;
}

export async function createTestDatabase(): Promise<TestDatabaseContext> {
  const root = await mkdtemp(join(tmpdir(), "raidledger-test-"));
  const dbPath = join(root, "test.sqlite");
  const migrationSql = await readFile("migrations/0001_initial_schema.sql", "utf8");
  const migrationPath = join(root, "migration.sql");

  await writeFile(migrationPath, migrationSql, "utf8");
  await execFileAsync("sqlite3", [dbPath, `.read ${migrationPath}`]);

  return {
    db: new SqliteCliClient(dbPath),
    cleanup: async () => {
      await rm(root, { force: true, recursive: true });
    },
  };
}
