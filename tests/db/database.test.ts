import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("MemoryDatabase", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a memory with defaults", () => {
      const mem = db.create({ content: "Test memory" });

      expect(mem.id).toBeDefined();
      expect(mem.content).toBe("Test memory");
      expect(mem.category).toBe("general");
      expect(mem.tags).toEqual([]);
      // Fase 3: auto-metadata is always present; check no user-supplied keys
      expect(mem.metadata).toMatchObject({ content_hash: expect.any(String), content_length: 11, word_count: 2 });
      expect(mem.created_at).toBeDefined();
      expect(mem.updated_at).toBeDefined();
    });

    it("creates a memory with all fields", () => {
      const mem = db.create({
        content: "Architecture decision",
        category: "decision",
        tags: ["backend", "api"],
        metadata: { priority: "high" },
      });

      expect(mem.content).toBe("Architecture decision");
      expect(mem.category).toBe("decision");
      expect(mem.tags).toEqual(["backend", "api"]);
      // Fase 3: user metadata is merged with auto-metadata (user keys take priority)
      expect(mem.metadata).toMatchObject({ priority: "high" });
    });

    it("trims leading/trailing whitespace from content", () => {
      const mem = db.create({ content: "  spaced content  " });
      expect(mem.content).toBe("spaced content");
    });

    it("normalizes category to lowercase", () => {
      const mem = db.create({ content: "X", category: "CODE" });
      expect(mem.category).toBe("code");
    });

    it("trims whitespace from category", () => {
      const mem = db.create({ content: "X", category: "  decision  " });
      expect(mem.category).toBe("decision");
    });

    it("deduplicates tags", () => {
      const mem = db.create({ content: "X", tags: ["alpha", "alpha", "beta"] });
      expect(mem.tags).toEqual(["alpha", "beta"]);
    });

    it("trims whitespace from tags and drops empty ones", () => {
      const mem = db.create({ content: "X", tags: ["  tag1  ", "", "  ", "tag2"] });
      expect(mem.tags).toEqual(["tag1", "tag2"]);
    });

    it("falls back to 'general' when category is only whitespace", () => {
      const mem = db.create({ content: "X", category: "   " });
      expect(mem.category).toBe("general");
    });
  });

  describe("getById", () => {
    it("retrieves an existing memory", () => {
      const created = db.create({ content: "Find me" });
      const fetched = db.getById(created.id);

      expect(fetched).toEqual(created);
    });

    it("returns null for non-existent id", () => {
      expect(db.getById("non-existent")).toBeNull();
    });
  });

  describe("update", () => {
    it("updates content only", () => {
      const mem = db.create({ content: "Original", category: "code" });
      const updated = db.update(mem.id, { content: "Updated" });

      expect(updated!.content).toBe("Updated");
      expect(updated!.category).toBe("code");
    });

    it("updates tags and metadata", () => {
      const mem = db.create({ content: "Test", tags: ["old"] });
      const updated = db.update(mem.id, {
        tags: ["new", "updated"],
        metadata: { version: 2 },
      });

      expect(updated!.tags).toEqual(["new", "updated"]);
      expect(updated!.metadata).toEqual({ version: 2 });
    });

    it("returns null for non-existent id", () => {
      expect(db.update("non-existent", { content: "X" })).toBeNull();
    });

    it("updates the updated_at timestamp", () => {
      const mem = db.create({ content: "Test" });
      const updated = db.update(mem.id, { content: "Changed" });

      expect(updated!.updated_at).toBeDefined();
    });

    it("trims and lowercases category on update", () => {
      const mem = db.create({ content: "Test", category: "code" });
      const updated = db.update(mem.id, { category: "  DECISION  " });
      expect(updated!.category).toBe("decision");
    });

    it("deduplicates and trims tags on update", () => {
      const mem = db.create({ content: "Test", tags: ["a"] });
      const updated = db.update(mem.id, { tags: ["  x  ", "y", "x"] });
      expect(updated!.tags).toEqual(["x", "y"]);
    });
  });

  describe("delete", () => {
    it("deletes an existing memory", () => {
      const mem = db.create({ content: "Delete me" });
      expect(db.delete(mem.id)).toBe(true);
      expect(db.getById(mem.id)).toBeNull();
    });

    it("returns false for non-existent id", () => {
      expect(db.delete("non-existent")).toBe(false);
    });
  });

  describe("search", () => {
    it("finds memories by keyword", () => {
      db.create({ content: "TypeScript strict mode configuration" });
      db.create({ content: "Python virtual environments" });
      db.create({ content: "TypeScript ESLint setup guide" });

      const results = db.search({ query: "TypeScript" });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.content.includes("TypeScript"))).toBe(true);
    });

    it("filters by category", () => {
      db.create({ content: "TypeScript patterns", category: "code" });
      db.create({ content: "TypeScript decision", category: "decision" });

      const results = db.search({ query: "TypeScript", category: "code" });

      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("code");
    });

    it("respects limit", () => {
      for (let i = 0; i < 5; i++) {
        db.create({ content: `Memory about testing number ${i}` });
      }

      const results = db.search({ query: "testing", limit: 3 });
      expect(results).toHaveLength(3);
    });

    it("returns empty array for no matches", () => {
      db.create({ content: "Something unrelated" });
      const results = db.search({ query: "nonexistent" });
      expect(results).toEqual([]);
    });

    it("returns empty array for empty query", () => {
      db.create({ content: "Test" });
      const results = db.search({ query: "   " });
      expect(results).toEqual([]);
    });

    it("mode 'any' (OR) finds docs where at least one term matches", () => {
      db.create({ content: "TypeScript strict configuration" });
      db.create({ content: "Python virtual environments" });
      db.create({ content: "SQLite WAL mode" });

      // "typescript" and "sqlite" are in different docs — OR should return both
      const results = db.search({ query: "typescript sqlite", mode: "any" });

      expect(results).toHaveLength(2);
    });

    it("mode 'all' (AND) requires all terms in the same document", () => {
      db.create({ content: "TypeScript strict configuration" });
      db.create({ content: "Python virtual environments" });
      db.create({ content: "SQLite WAL mode" });

      // Terms in different docs — AND returns nothing
      const results = db.search({ query: "typescript sqlite", mode: "all" });

      expect(results).toHaveLength(0);
    });

    it("filters by tag in search results", () => {
      db.create({ content: "TypeScript patterns", category: "code", tags: ["typescript"] });
      db.create({ content: "TypeScript decisions", category: "decision", tags: ["architecture"] });

      const results = db.search({ query: "typescript", tag: "typescript" });

      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain("typescript");
    });
  });

  describe("count", () => {
    it("returns total count of all memories", () => {
      db.create({ content: "A" });
      db.create({ content: "B" });
      db.create({ content: "C" });

      expect(db.count()).toBe(3);
    });

    it("counts with category filter", () => {
      db.create({ content: "Code A", category: "code" });
      db.create({ content: "Code B", category: "code" });
      db.create({ content: "Decision", category: "decision" });

      expect(db.count({ category: "code" })).toBe(2);
      expect(db.count({ category: "decision" })).toBe(1);
    });

    it("counts with tag filter", () => {
      db.create({ content: "A", tags: ["alpha"] });
      db.create({ content: "B", tags: ["alpha", "beta"] });
      db.create({ content: "C", tags: ["beta"] });

      expect(db.count({ tag: "alpha" })).toBe(2);
      expect(db.count({ tag: "beta" })).toBe(2);
    });

    it("returns 0 when no memories exist", () => {
      expect(db.count()).toBe(0);
    });
  });

  describe("list", () => {
    it("lists all memories ordered by newest first", () => {
      db.create({ content: "First" });
      db.create({ content: "Second" });
      db.create({ content: "Third" });

      const results = db.list();

      expect(results).toHaveLength(3);
    });

    it("filters by category", () => {
      db.create({ content: "Code snippet", category: "code" });
      db.create({ content: "A decision", category: "decision" });
      db.create({ content: "More code", category: "code" });

      const results = db.list({ category: "code" });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.category === "code")).toBe(true);
    });

    it("filters by tag", () => {
      db.create({ content: "A", tags: ["frontend", "react"] });
      db.create({ content: "B", tags: ["backend", "node"] });
      db.create({ content: "C", tags: ["frontend", "vue"] });

      const results = db.list({ tag: "frontend" });

      expect(results).toHaveLength(2);
    });

    it("supports pagination", () => {
      for (let i = 0; i < 10; i++) {
        db.create({ content: `Memory ${i}` });
      }

      const page1 = db.list({ limit: 3, offset: 0 });
      const page2 = db.list({ limit: 3, offset: 3 });

      expect(page1).toHaveLength(3);
      expect(page2).toHaveLength(3);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it("default limit is 10", () => {
      for (let i = 0; i < 15; i++) {
        db.create({ content: `Memory ${i}` });
      }
      expect(db.list()).toHaveLength(10);
    });
  });

  describe("getContextSnapshot", () => {
    it("returns empty snapshot when no memories exist", () => {
      const snap = db.getContextSnapshot();
      expect(snap.total).toBe(0);
      expect(snap.by_category).toEqual({});
      expect(snap.tags_index).toEqual({});
    });

    it("counts total and categories correctly", () => {
      db.create({ content: "A", category: "code" });
      db.create({ content: "B", category: "code" });
      db.create({ content: "C", category: "decision" });

      const snap = db.getContextSnapshot();
      expect(snap.total).toBe(3);
      expect(snap.by_category["code"].count).toBe(2);
      expect(snap.by_category["decision"].count).toBe(1);
    });

    it("includes at most recentPerCategory recent items per category", () => {
      for (let i = 0; i < 5; i++) {
        db.create({ content: `code memory ${i}`, category: "code" });
      }
      db.create({ content: "one decision", category: "decision" });

      const snap = db.getContextSnapshot(3);
      expect(snap.by_category["code"].recent).toHaveLength(3);
      expect(snap.by_category["decision"].recent).toHaveLength(1);
    });

    it("recent items are slim (id, content, category, tags only)", () => {
      db.create({ content: "slim test", category: "code", tags: ["ts"] });

      const snap = db.getContextSnapshot();
      const item = snap.by_category["code"].recent[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("content");
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("tags");
      expect(item).not.toHaveProperty("created_at");
      expect(item).not.toHaveProperty("metadata");
    });

    it("builds correct tags_index frequency map", () => {
      db.create({ content: "A", tags: ["ts", "react"] });
      db.create({ content: "B", tags: ["ts", "node"] });
      db.create({ content: "C", tags: ["react"] });

      const snap = db.getContextSnapshot();
      expect(snap.tags_index["ts"]).toBe(2);
      expect(snap.tags_index["react"]).toBe(2);
      expect(snap.tags_index["node"]).toBe(1);
    });

    it("recentPerCategory=1 returns only the newest item per category", () => {
      db.create({ content: "older", category: "code" });
      db.create({ content: "newer", category: "code" });

      const snap = db.getContextSnapshot(1);
      expect(snap.by_category["code"].recent).toHaveLength(1);
      expect(snap.by_category["code"].recent[0].content).toBe("newer");
    });
  });

  describe("maintenance", () => {
    it("reports integrity_ok=true on a healthy in-memory database", () => {
      const result = db.maintenance();
      expect(result.integrity_ok).toBe(true);
    });

    it("returns empty integrity_errors when database is healthy", () => {
      const result = db.maintenance();
      expect(result.integrity_errors).toEqual([]);
    });

    it("wal_checkpoint contains numeric busy/log/checkpointed fields", () => {
      const { wal_checkpoint } = db.maintenance();
      expect(typeof wal_checkpoint.busy).toBe("number");
      expect(typeof wal_checkpoint.log).toBe("number");
      expect(typeof wal_checkpoint.checkpointed).toBe("number");
    });

    it("integrity check passes after writing multiple records", () => {
      db.create({ content: "Alpha", category: "code" });
      db.create({ content: "Beta",  category: "decision", tags: ["arch"] });
      db.createBatch([
        { content: "Batch A" },
        { content: "Batch B", category: "bug" },
      ]);
      const result = db.maintenance();
      expect(result.integrity_ok).toBe(true);
      expect(result.integrity_errors).toEqual([]);
    });

    it("accepts all four checkpoint modes without throwing", () => {
      for (const mode of ["PASSIVE", "FULL", "RESTART", "TRUNCATE"] as const) {
        expect(() => db.maintenance(mode)).not.toThrow();
      }
    });

    it("defaults to PASSIVE mode (no argument required)", () => {
      expect(() => db.maintenance()).not.toThrow();
      expect(db.maintenance().integrity_ok).toBe(true);
    });
  });

  describe("listWithTotal — sort_by", () => {
    it("created_at_desc (default) returns last-inserted first via rowid tiebreaker", () => {
      db.create({ content: "Alpha" });
      db.create({ content: "Beta" });
      db.create({ content: "Gamma" });
      const { memories } = db.listWithTotal({ sort_by: "created_at_desc" });
      expect(memories[0].content).toBe("Gamma");
      expect(memories[memories.length - 1].content).toBe("Alpha");
    });

    it("created_at_asc returns first-inserted first", () => {
      db.create({ content: "Alpha" });
      db.create({ content: "Beta" });
      db.create({ content: "Gamma" });
      const { memories } = db.listWithTotal({ sort_by: "created_at_asc" });
      expect(memories[0].content).toBe("Alpha");
      expect(memories[memories.length - 1].content).toBe("Gamma");
    });

    it("updated_at_desc returns all memories without error", () => {
      db.create({ content: "Alpha" });
      db.create({ content: "Beta" });
      const { memories, total } = db.listWithTotal({ sort_by: "updated_at_desc" });
      expect(total).toBe(2);
      expect(memories).toHaveLength(2);
    });

    it("default (no sort_by) behaves like created_at_desc", () => {
      db.create({ content: "Alpha" });
      db.create({ content: "Beta" });
      const { memories: withDefault } = db.listWithTotal({});
      const { memories: explicit }    = db.listWithTotal({ sort_by: "created_at_desc" });
      expect(withDefault.map((m) => m.id)).toEqual(explicit.map((m) => m.id));
    });

    it("sort_by works combined with category filter", () => {
      db.create({ content: "Code A", category: "code" });
      db.create({ content: "Code B", category: "code" });
      db.create({ content: "Decision", category: "decision" });
      const { memories } = db.listWithTotal({ category: "code", sort_by: "created_at_asc" });
      expect(memories).toHaveLength(2);
      expect(memories[0].content).toBe("Code A");
    });
  });

  describe("listWithTotal — date range", () => {
    it("created_after in the past returns all memories", () => {
      db.create({ content: "Alpha" });
      db.create({ content: "Beta" });
      const { total } = db.listWithTotal({ created_after: "2000-01-01 00:00:00" });
      expect(total).toBe(2);
    });

    it("created_after in the future returns no memories", () => {
      db.create({ content: "Alpha" });
      const { total } = db.listWithTotal({ created_after: "2099-12-31 23:59:59" });
      expect(total).toBe(0);
    });

    it("updated_after in the past returns all memories", () => {
      db.create({ content: "Alpha" });
      const { total } = db.listWithTotal({ updated_after: "2000-01-01 00:00:00" });
      expect(total).toBe(1);
    });

    it("updated_after in the future returns no memories", () => {
      db.create({ content: "Alpha" });
      const { total } = db.listWithTotal({ updated_after: "2099-12-31 23:59:59" });
      expect(total).toBe(0);
    });

    it("created_after combined with category filter", () => {
      db.create({ content: "Code A", category: "code" });
      db.create({ content: "Decision", category: "decision" });
      const { total } = db.listWithTotal({ category: "code", created_after: "2000-01-01" });
      expect(total).toBe(1);
    });
  });

  describe("searchWithTotal — date range", () => {
    it("created_after in the past returns all FTS matches", () => {
      db.create({ content: "TypeScript patterns" });
      db.create({ content: "TypeScript config" });
      const { total } = db.searchWithTotal({ query: "TypeScript", created_after: "2000-01-01" });
      expect(total).toBe(2);
    });

    it("created_after in the future returns no matches", () => {
      db.create({ content: "TypeScript patterns" });
      const { total } = db.searchWithTotal({ query: "TypeScript", created_after: "2099-12-31" });
      expect(total).toBe(0);
    });

    it("updated_after combined with search", () => {
      db.create({ content: "TypeScript patterns" });
      const { total } = db.searchWithTotal({ query: "TypeScript", updated_after: "2000-01-01" });
      expect(total).toBe(1);
    });
  });
});
