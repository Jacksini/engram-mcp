import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("update_memory tool", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("updates content of existing memory", () => {
    const mem = db.create({ content: "Old content" });
    const updated = db.update(mem.id, { content: "New content" });

    expect(updated!.content).toBe("New content");
    expect(updated!.id).toBe(mem.id);
  });

  it("updates category without changing content", () => {
    const mem = db.create({ content: "Keep this", category: "general" });
    const updated = db.update(mem.id, { category: "decision" });

    expect(updated!.content).toBe("Keep this");
    expect(updated!.category).toBe("decision");
  });

  it("returns null for non-existent memory", () => {
    const result = db.update("fake-id", { content: "X" });
    expect(result).toBeNull();
  });

  it("returns null for a well-formed UUID that does not exist (Zod enforces UUID at tool layer)", () => {
    const result = db.update("00000000-0000-0000-0000-000000000000", { content: "X" });
    expect(result).toBeNull();
  });

  it("returns null for a non-UUID format string without throwing", () => {
    expect(() => db.update("not-a-uuid", { content: "X" })).not.toThrow();
    expect(db.update("not-a-uuid", { content: "X" })).toBeNull();
  });

  it("updated memory is searchable with new content", () => {
    const mem = db.create({ content: "Original text about Python" });
    db.update(mem.id, { content: "Updated text about Rust" });

    const pythonResults = db.search({ query: "Python" });
    const rustResults = db.search({ query: "Rust" });

    expect(pythonResults).toHaveLength(0);
    expect(rustResults).toHaveLength(1);
  });
});
