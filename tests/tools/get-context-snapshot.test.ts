import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("get_context_snapshot tool", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("returns zero-state snapshot for an empty database", () => {
    const snap = db.getContextSnapshot();
    expect(snap.total).toBe(0);
    expect(snap.by_category).toEqual({});
    expect(snap.tags_index).toEqual({});
  });

  it("total equals sum of all category counts", () => {
    db.create({ content: "A", category: "code" });
    db.create({ content: "B", category: "code" });
    db.create({ content: "C", category: "decision" });
    db.create({ content: "D", category: "bug" });

    const snap = db.getContextSnapshot();
    const sumFromCategories = Object.values(snap.by_category)
      .reduce((acc, { count }) => acc + count, 0);

    expect(snap.total).toBe(4);
    expect(snap.total).toBe(sumFromCategories);
  });

  it("each category entry has correct count and recent items", () => {
    for (let i = 0; i < 4; i++) {
      db.create({ content: `code item ${i}`, category: "code" });
    }
    db.create({ content: "one arch item", category: "architecture" });

    const snap = db.getContextSnapshot(2);

    expect(snap.by_category["code"].count).toBe(4);
    expect(snap.by_category["code"].recent).toHaveLength(2);
    expect(snap.by_category["architecture"].count).toBe(1);
    expect(snap.by_category["architecture"].recent).toHaveLength(1);
  });

  it("recent items contain only slim fields (no timestamps, no metadata)", () => {
    db.create({ content: "Slim check", category: "code", tags: ["ts"], metadata: { secret: true } });

    const snap = db.getContextSnapshot();
    const item = snap.by_category["code"].recent[0];

    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("content", "Slim check");
    expect(item).toHaveProperty("category", "code");
    expect(item).toHaveProperty("tags");
    expect(item).not.toHaveProperty("metadata");
    expect(item).not.toHaveProperty("created_at");
    expect(item).not.toHaveProperty("updated_at");
  });

  it("tags_index reflects correct frequency across all memories", () => {
    db.create({ content: "A", tags: ["ts", "react"] });
    db.create({ content: "B", tags: ["ts", "node"] });
    db.create({ content: "C", tags: ["react", "css"] });

    const snap = db.getContextSnapshot();

    expect(snap.tags_index["ts"]).toBe(2);
    expect(snap.tags_index["react"]).toBe(2);
    expect(snap.tags_index["node"]).toBe(1);
    expect(snap.tags_index["css"]).toBe(1);
    expect(snap.tags_index["nonexistent"]).toBeUndefined();
  });

  it("recent items are the N most recently created (not oldest)", () => {
    db.create({ content: "oldest" });
    db.create({ content: "middle" });
    db.create({ content: "newest" });

    const snap = db.getContextSnapshot(1);
    expect(snap.by_category["general"].recent[0].content).toBe("newest");
  });

  it("recentPerCategory defaults to 3", () => {
    for (let i = 0; i < 5; i++) {
      db.create({ content: `item ${i}` });
    }
    const snap = db.getContextSnapshot(); // default = 3
    expect(snap.by_category["general"].recent).toHaveLength(3);
  });

  it("content_preview_len truncates content in recent items", () => {
    db.create({ content: "This is a very long content string that should be truncated", category: "code" });
    const snap = db.getContextSnapshot(3, 20);
    const item = snap.by_category["code"].recent[0];
    expect(item.content).toBe("This is a very long ");
    expect(item.content.length).toBe(20);
  });

  it("content_preview_len undefined returns full content", () => {
    const longContent = "Full content that must not be truncated at all";
    db.create({ content: longContent, category: "code" });
    const snap = db.getContextSnapshot(3, undefined);
    expect(snap.by_category["code"].recent[0].content).toBe(longContent);
  });

  it("include_tags_index false returns empty tags_index and skips tag query", () => {
    db.create({ content: "A", tags: ["ts", "react"] });
    db.create({ content: "B", tags: ["node"] });
    const snap = db.getContextSnapshot(3, undefined, false);
    expect(snap.tags_index).toEqual({});
    // categories and total must still be correct
    expect(snap.total).toBe(2);
    expect(snap.by_category["general"].count).toBe(2);
  });

  it("include_tags_index true (default) still returns tags_index", () => {
    db.create({ content: "A", tags: ["ts"] });
    const snap = db.getContextSnapshot(3, undefined, true);
    expect(snap.tags_index["ts"]).toBe(1);
  });
});
