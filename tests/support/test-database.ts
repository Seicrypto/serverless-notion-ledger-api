import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
  const migrationPath = join(root, "migration.sql");
  const migrationFiles = (await readdir("migrations"))
    .filter((entry) => entry.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
  const migrationSqlParts = await Promise.all(
    migrationFiles.map((file) => readFile(join("migrations", file), "utf8")),
  );
  const migrationSql = migrationSqlParts.join("\n\n");

  await writeFile(migrationPath, migrationSql, "utf8");
  await execFileAsync("sqlite3", [dbPath, `.read ${migrationPath}`]);

  return {
    db: new SqliteCliClient(dbPath),
    cleanup: async () => {
      await rm(root, { force: true, recursive: true });
    },
  };
}
