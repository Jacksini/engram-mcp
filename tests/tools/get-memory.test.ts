import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("get_memory tool", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("retrieves an existing memory by id", () => {
    const created = db.create({ content: "Important decision" });
    const result = db.getById(created.id);

    expect(result).not.toBeNull();
    expect(result!.content).toBe("Important decision");
  });

  it("returns null for non-existent id", () => {
    const result = db.getById("does-not-exist");
    expect(result).toBeNull();
  });

  it("returns null for a non-UUID format string without throwing (Zod enforces UUID at tool layer)", () => {
    expect(() => db.getById("not-a-uuid")).not.toThrow();
    expect(db.getById("not-a-uuid")).toBeNull();
  });

  it("returns null for a well-formed UUID that does not exist in the database", () => {
    const result = db.getById("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});
