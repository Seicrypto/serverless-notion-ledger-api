import { execFile, spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WRANGLER_BIN = join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");

export interface LocalD1TestContext {
  cleanup(): Promise<void>;
  databasePath: string;
  persistRoot: string;
}

export async function createLocalD1TestContext(): Promise<LocalD1TestContext> {
  const persistRoot = await mkdtemp(join(tmpdir(), "raidledger-d1-local-"));

  await runWrangler([
    "d1",
    "migrations",
    "apply",
    "APP_DB",
    "--local",
    "--persist-to",
    persistRoot,
  ], {
    homeOverride: persistRoot,
  });

  const databasePath = await findDatabaseFile(persistRoot);

  return {
    databasePath,
    persistRoot,
    cleanup: async () => {
      await rm(persistRoot, { force: true, recursive: true });
    },
  };
}

export async function runWrangler(
  args: string[],
  options: {
    homeOverride?: string;
  } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WRANGLER_BIN, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: options.homeOverride ?? process.env.HOME,
        NO_D1_WARNING: "true",
        XDG_CONFIG_HOME: options.homeOverride ?? process.env.XDG_CONFIG_HOME,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(
        new Error(
          `Wrangler command failed (${args.join(" ")}):\n${stderr || stdout}`,
        ),
      );
    });
  });
}

async function findDatabaseFile(root: string): Promise<string> {
  const queue = [root];
  const candidates: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (
        entry.name.endsWith(".sqlite") ||
        entry.name.endsWith(".sqlite3") ||
        entry.name.endsWith(".db")
      ) {
        const fileStat = await stat(fullPath);

        if (fileStat.size > 0) {
          candidates.push(fullPath);
        }
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(`No local D1 database file found under ${root}`);
  }

  for (const candidate of candidates.sort()) {
    const tableNames = await readTableNames(candidate);

    if (
      tableNames.has("users") &&
      tableNames.has("organizations") &&
      tableNames.has("games")
    ) {
      return candidate;
    }
  }

  throw new Error(
    `No local D1 database file with application tables found under ${root}. Candidates: ${candidates.join(", ")}`,
  );
}

async function readTableNames(databasePath: string): Promise<Set<string>> {
  try {
    const { stdout } = await execFileAsync("sqlite3", [
      "-json",
      databasePath,
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name ASC;",
    ]);

    const trimmed = stdout.trim();
    const rows = trimmed ? (JSON.parse(trimmed) as Array<{ name: string }>) : [];

    return new Set(rows.map((row) => row.name));
  } catch {
    return new Set();
  }
}
