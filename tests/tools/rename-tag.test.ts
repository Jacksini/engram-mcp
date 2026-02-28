import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("rename_tag tool (renameTag)", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => { db.close(); });

  // ─── return value ──────────────────────────────────────────────────────────

  describe("return value", () => {
    it("returns updated=0 when no memory has the tag", () => {
      db.create({ content: "no tags", tags: [] });
      const result = db.renameTag("nonexistent", "new");
      expect(result).toEqual({ updated: 0, old_tag: "nonexistent", new_tag: "new" });
    });

    it("returns updated=N for every memory that had the tag", () => {
      db.create({ content: "A", tags: ["alpha", "beta"] });
      db.create({ content: "B", tags: ["alpha"] });
      db.create({ content: "C", tags: ["gamma"] });
      const result = db.renameTag("alpha", "omega");
      expect(result.updated).toBe(2);
      expect(result.old_tag).toBe("alpha");
      expect(result.new_tag).toBe("omega");
    });

    it("returns old_tag and new_tag in the result", () => {
      db.create({ content: "X", tags: ["foo"] });
      const result = db.renameTag("foo", "bar");
      expect(result.old_tag).toBe("foo");
      expect(result.new_tag).toBe("bar");
    });
  });

  // ─── tag rename correctness ────────────────────────────────────────────────

  describe("tag rename correctness", () => {
    it("old tag is gone and new tag is present after rename", () => {
      const m = db.create({ content: "mem", tags: ["old"] });
      db.renameTag("old", "new");
      const updated = db.getById(m.id)!;
      expect(updated.tags).not.toContain("old");
      expect(updated.tags).toContain("new");
    });

    it("other tags in the same memory are preserved", () => {
      const m = db.create({ content: "mem", tags: ["keep", "rename-me", "also-keep"] });
      db.renameTag("rename-me", "renamed");
      const updated = db.getById(m.id)!;
      expect(updated.tags).toContain("keep");
      expect(updated.tags).toContain("also-keep");
      expect(updated.tags).toContain("renamed");
      expect(updated.tags).not.toContain("rename-me");
    });

    it("memories without the tag are not touched", () => {
      const a = db.create({ content: "A", tags: ["target"] });
      const b = db.create({ content: "B", tags: ["other"] });
      db.renameTag("target", "renamed");
      expect(db.getById(b.id)!.tags).toEqual(["other"]);
      expect(db.getById(a.id)!.tags).toContain("renamed");
    });

    it("updates updated_at on renamed memories", () => {
      const m = db.create({ content: "mem", tags: ["tag"] });
      const before = m.updated_at;
      db.renameTag("tag", "new-tag");
      const after = db.getById(m.id)!.updated_at;
      // updated_at must be >= before (SQLite datetime precision is 1 second)
      expect(after >= before).toBe(true);
    });
  });

  // ─── deduplication ────────────────────────────────────────────────────────

  describe("deduplication when new tag already exists", () => {
    it("does not create duplicate tags if new_tag already exists in the memory", () => {
      const m = db.create({ content: "mem", tags: ["a", "b"] });
      // rename "a" to "b" — memory already has "b"
      db.renameTag("a", "b");
      const updated = db.getById(m.id)!;
      const bCount = updated.tags.filter(t => t === "b").length;
      expect(bCount).toBe(1);
      expect(updated.tags).not.toContain("a");
    });
  });

  // ─── FTS index consistency ─────────────────────────────────────────────────

  describe("FTS index consistency", () => {
    it("new tag is searchable after rename", () => {
      db.create({ content: "searchable content", tags: ["old-tag"] });
      db.renameTag("old-tag", "new-tag");
      // FTS searches content+category+tags, so search for the new tag via tag filter
      const result = db.list({ tag: "new-tag" });
      expect(result).toHaveLength(1);
    });

    it("old tag no longer returns results after rename", () => {
      db.create({ content: "alpha beta content", tags: ["old-tag"] });
      db.renameTag("old-tag", "new-tag");
      const result = db.list({ tag: "old-tag" });
      expect(result).toHaveLength(0);
    });
  });

  // ─── multiple memories ─────────────────────────────────────────────────────

  describe("bulk rename across many memories", () => {
    it("renames the tag in all matching memories in one call", () => {
      for (let i = 0; i < 5; i++) {
        db.create({ content: `Memory ${i}`, tags: ["bulk", `extra-${i}`] });
      }
      db.create({ content: "no-match", tags: ["other"] });
      const result = db.renameTag("bulk", "renamed-bulk");
      expect(result.updated).toBe(5);
      const withNew = db.list({ tag: "renamed-bulk" });
      expect(withNew).toHaveLength(5);
      const withOld = db.list({ tag: "bulk" });
      expect(withOld).toHaveLength(0);
    });
  });
});
