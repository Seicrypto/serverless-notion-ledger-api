import test from "node:test";
import assert from "node:assert/strict";
import { OfficialStaffsRepository } from "../src/repositories/official-staffs-repository";
import { UsersRepository } from "../src/repositories/users-repository";
import { createTestDatabase } from "./support/test-database";

test("official staffs repository supports CRUD-like reads over migrated schema", async () => {
  const { cleanup, db } = await createTestDatabase();
  try {
    const users = new UsersRepository(db);
    const repository = new OfficialStaffsRepository(db);
    const admin = await users.create({
      email: "official-admin@example.com",
      passwordHash: "hash-official",
      status: "active",
    });

    const created = await repository.create({
      role: "admin",
      userId: admin.id,
    });

    assert.equal(created.role, "admin");

    const found = await repository.findByUserId(admin.id);
    assert.ok(found);
    assert.equal(found.user_id, admin.id);

    const listed = await repository.listByRole("admin");
    assert.equal(listed.length, 1);
  } finally {
    await cleanup();
  }
});
