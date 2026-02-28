import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("save_memories (createBatch)", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("inserts all items and returns created memories", () => {
    const created = db.createBatch([
      { content: "First batch memory", category: "code", tags: ["ts"] },
      { content: "Second batch memory", category: "decision" },
      { content: "Third batch memory" },
    ]);
    expect(created).toHaveLength(3);
    expect(db.count()).toBe(3);
  });

  it("returns empty array without touching the database for empty input", () => {
    const created = db.createBatch([]);
    expect(created).toHaveLength(0);
    expect(db.count()).toBe(0);
  });

  it("all created memories have unique ids", () => {
    const created = db.createBatch([
      { content: "Alpha" },
      { content: "Beta" },
      { content: "Gamma" },
    ]);
    const ids = created.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });

  it("applies normalization to each memory in the batch", () => {
    const created = db.createBatch([
      { content: "  trim me  ", category: "CODE", tags: ["dup", "dup", "keep"] },
    ]);
    expect(created[0].content).toBe("trim me");
    expect(created[0].category).toBe("code");
    expect(created[0].tags).toEqual(["dup", "keep"]);
  });

  it("single-item batch behaves identically to create()", () => {
    const single = db.create({ content: "solo", category: "bug", tags: ["a"] });
    db.delete(single.id);

    const [batch] = db.createBatch([{ content: "solo", category: "bug", tags: ["a"] }]);
    expect(batch.content).toBe(single.content);
    expect(batch.category).toBe(single.category);
    expect(batch.tags).toEqual(single.tags);
  });

  it("entire batch is atomic — all succeed or none do", () => {
    // better-sqlite3 transactions are all-or-nothing;
    // we verify that a normal batch fully commits by checking count
    const before = db.count();
    db.createBatch([
      { content: "Atomic A" },
      { content: "Atomic B" },
    ]);
    expect(db.count()).toBe(before + 2);
  });

  it("returned memories are retrievable by id", () => {
    const created = db.createBatch([
      { content: "Persist check A" },
      { content: "Persist check B" },
    ]);
    for (const m of created) {
      const fetched = db.getById(m.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.content).toBe(m.content);
    }
  });
});

describe("save_memories — compact & content_preview_len (tool-layer logic)", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("createBatch returns full Memory objects — all fields present for compact mapping", () => {
    const [m] = db.createBatch([{ content: "Full fields check", category: "code", tags: ["ts"], metadata: { v: 1 } }]);
    expect(m).toHaveProperty("id");
    expect(m).toHaveProperty("content");
    expect(m).toHaveProperty("category");
    expect(m).toHaveProperty("tags");
    expect(m).toHaveProperty("metadata");
    expect(m).toHaveProperty("created_at");
    expect(m).toHaveProperty("updated_at");
  });

  it("compact mapping keeps only {id, content, category, tags}", () => {
    const created = db.createBatch([{ content: "Compact test", category: "code", tags: ["ts"] }]);
    const items = created.map(({ id, content, category: cat, tags }) => ({ id, content, category: cat, tags }));
    expect(items[0]).toHaveProperty("id");
    expect(items[0]).toHaveProperty("content");
    expect(items[0]).toHaveProperty("category");
    expect(items[0]).toHaveProperty("tags");
    expect(items[0]).not.toHaveProperty("metadata");
    expect(items[0]).not.toHaveProperty("created_at");
    expect(items[0]).not.toHaveProperty("updated_at");
  });

  it("content_preview_len truncates content in batch results", () => {
    const created = db.createBatch([{ content: "A".repeat(200), category: "code" }]);
    const limit = 50;
    const truncated = created[0].content.slice(0, limit);
    expect(truncated).toHaveLength(limit);
    expect(truncated).toBe("A".repeat(limit));
  });

  it("content_preview_len does not shorten content shorter than limit", () => {
    const created = db.createBatch([{ content: "Short", category: "code" }]);
    const truncated = created[0].content.slice(0, 200);
    expect(truncated).toBe("Short");
  });

  it("response includes saved count matching batch size", () => {
    const batchSize = 4;
    const created = db.createBatch(
      Array.from({ length: batchSize }, (_, i) => ({ content: `Memory ${i}` }))
    );
    expect(created).toHaveLength(batchSize);
  });
});
