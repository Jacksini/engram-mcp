import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("export_memories (exportAll)", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "React hooks guide",      category: "code",     tags: ["react"] });
    db.create({ content: "DB migration strategy",  category: "decision", tags: ["backend"] });
    db.create({ content: "Node.js patterns",       category: "code",     tags: ["node"]   });
    db.create({ content: "Architecture overview",  category: "architecture" });
  });

  afterEach(() => { db.close(); });

  it("returns all memories when no filters applied", () => {
    const memories = db.exportAll();
    expect(memories).toHaveLength(4);
  });

  it("returns empty array on empty database", () => {
    const empty = createTestDb();
    expect(empty.exportAll()).toEqual([]);
    empty.close();
  });

  it("filters by category", () => {
    const memories = db.exportAll({ category: "code" });
    expect(memories).toHaveLength(2);
    expect(memories.every(m => m.category === "code")).toBe(true);
  });

  it("filters by tag", () => {
    const memories = db.exportAll({ tag: "react" });
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toContain("React");
  });

  it("respects limit", () => {
    const memories = db.exportAll({ limit: 2 });
    expect(memories).toHaveLength(2);
  });

  it("default order is created_at ascending (oldest first)", () => {
    const memories = db.exportAll();
    const dates = memories.map(m => m.created_at);
    expect(dates).toEqual([...dates].sort());
  });

  it("exported memories have all Memory fields", () => {
    const [m] = db.exportAll({ limit: 1 });
    expect(m).toHaveProperty("id");
    expect(m).toHaveProperty("content");
    expect(m).toHaveProperty("category");
    expect(m).toHaveProperty("tags");
    expect(m).toHaveProperty("metadata");
    expect(m).toHaveProperty("created_at");
    expect(m).toHaveProperty("updated_at");
  });

  it("category + tag combined filter", () => {
    const memories = db.exportAll({ category: "code", tag: "node" });
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toContain("Node.js");
  });
});
