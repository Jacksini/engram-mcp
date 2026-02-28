import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("delete_memory tool", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("deletes an existing memory", () => {
    const mem = db.create({ content: "To be deleted" });
    const result = db.delete(mem.id);

    expect(result).toBe(true);
    expect(db.getById(mem.id)).toBeNull();
  });

  it("returns false for non-existent memory", () => {
    expect(db.delete("non-existent")).toBe(false);
  });

  it("returns false for a well-formed UUID that does not exist (Zod enforces UUID at tool layer)", () => {
    expect(db.delete("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("returns false for a non-UUID format string without throwing", () => {
    expect(() => db.delete("not-a-uuid")).not.toThrow();
    expect(db.delete("not-a-uuid")).toBe(false);
  });

  it("deleted memory is no longer searchable", () => {
    const mem = db.create({ content: "Searchable content about JavaScript" });
    expect(db.search({ query: "JavaScript" })).toHaveLength(1);

    db.delete(mem.id);
    expect(db.search({ query: "JavaScript" })).toHaveLength(0);
  });
});
