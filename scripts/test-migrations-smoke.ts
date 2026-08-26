import assert from "node:assert/strict";
import { SqliteCliClient } from "../tests/support/sqlite-cli-client";
import { createLocalD1TestContext } from "./d1-local-test-utils";

async function main() {
  const context = await createLocalD1TestContext();

  try {
    const db = new SqliteCliClient(context.databasePath);

    const tables = await db.all<{ name: string }>(
      `SELECT name
       FROM sqlite_schema
       WHERE type = 'table'
       ORDER BY name ASC`,
    );
    const tableNames = new Set(tables.map((row) => row.name));

    for (const requiredTable of [
      "users",
      "official_staffs",
      "organizations",
      "organization_members",
      "characters",
      "games",
      "organization_games",
      "game_aliases",
      "assets",
      "events",
      "event_participants",
      "settlements",
      "settlement_allocations",
      "settlement_claims",
    ]) {
      assert.ok(tableNames.has(requiredTable), `Missing table: ${requiredTable}`);
    }

    await assertHasColumns(db, "users", ["vanity"]);
    await assertHasColumns(db, "organizations", ["vanity"]);
    await assertHasColumns(db, "games", ["source", "source_id"]);
    await assertHasColumns(db, "game_aliases", ["alias", "locale", "alias_type"]);
    await assertHasColumns(db, "organization_members", [
      "status",
      "approved_at",
      "left_at",
      "removed_at",
    ]);
    await assertHasColumns(db, "characters", [
      "game_id",
      "deleted_at",
      "deleted_by_user_id",
    ]);
    await assertHasColumns(db, "assets", [
      "asset_key",
      "normalized_name",
      "canonical_asset_id",
      "metadata_json",
    ]);
    await assertHasColumns(db, "events", [
      "event_key",
      "holder_type",
      "holder_ref",
      "source_type",
    ]);
    await assertHasColumns(db, "settlements", [
      "settlement_key",
      "fee_mode",
      "fee_rule_key",
      "allocation_mode",
    ]);
    await assertHasColumns(db, "settlement_allocations", [
      "weight",
      "ratio",
      "amount",
      "status",
    ]);
    await assertHasColumns(db, "settlement_claims", [
      "settlement_allocation_id",
      "claimed_by_character_id",
      "status",
      "confirmed_at",
      "voided_at",
      "method",
    ]);

    const spiritVale = await db.first<{
      name: string;
      slug: string;
      source: string;
      source_id: string | null;
    }>(
      `SELECT name, slug, source, source_id
       FROM games
       WHERE slug = ?`,
      "spiritvale",
    );

    assert.ok(spiritVale, "SpiritVale seed should exist");
    assert.equal(spiritVale.name, "SpiritVale");
    assert.equal(spiritVale.source, "steam");
    assert.equal(spiritVale.source_id, "3767850");

    console.log("Migration smoke test passed.");
  } finally {
    await context.cleanup();
  }
}

async function assertHasColumns(
  db: SqliteCliClient,
  tableName: string,
  requiredColumns: string[],
) {
  const columns = await db.all<{ name: string }>(`PRAGMA table_info(${tableName})`);
  const columnNames = new Set(columns.map((column) => column.name));

  for (const requiredColumn of requiredColumns) {
    assert.ok(
      columnNames.has(requiredColumn),
      `Missing column ${tableName}.${requiredColumn}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
