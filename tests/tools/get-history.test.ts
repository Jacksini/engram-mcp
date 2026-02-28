import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("memory_history (getHistory / versioning)", () => {
  let db: MemoryDatabase;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  // ─── create trigger ───────────────────────────────────────────────────────

  describe("create trigger", () => {
    it("records a 'create' entry when a memory is saved", () => {
      const m = db.create({ content: "Hello world", category: "code" });
      const h = db.getHistory({ memory_id: m.id });
      expect(h.total).toBe(1);
      expect(h.entries[0]!.operation).toBe("create");
    });

    it("history entry matches the created memory", () => {
      const m = db.create({ content: "Test content", category: "decision", tags: ["t1", "t2"] });
      const e = db.getHistory({ memory_id: m.id }).entries[0]!;
      expect(e.memory_id).toBe(m.id);
      expect(e.content).toBe("Test content");
      expect(e.category).toBe("decision");
      expect(e.tags).toEqual(["t1", "t2"]);
    });

    it("history entry has a changed_at timestamp", () => {
      const m = db.create({ content: "TS test" });
      const e = db.getHistory({ memory_id: m.id }).entries[0]!;
      expect(e.changed_at).toBeTruthy();
      expect(new Date(e.changed_at).getTime()).not.toBeNaN();
    });
  });

  // ─── update trigger ───────────────────────────────────────────────────────

  describe("update trigger", () => {
    it("records an 'update' entry when a memory is updated", () => {
      const m = db.create({ content: "Original" });
      db.update(m.id, { content: "Updated" });

      const h = db.getHistory({ memory_id: m.id });
      expect(h.total).toBe(2);
      const ops = h.entries.map((e) => e.operation);
      expect(ops).toContain("update");
    });

    it("update entry captures the new content", () => {
      const m = db.create({ content: "Original" });
      db.update(m.id, { content: "New content here" });

      const h = db.getHistory({ memory_id: m.id });
      const updateEntry = h.entries.find((e) => e.operation === "update")!;
      expect(updateEntry.content).toBe("New content here");
    });

    it("multiple updates create multiple history entries", () => {
      const m = db.create({ content: "V1" });
      db.update(m.id, { content: "V2" });
      db.update(m.id, { content: "V3" });
      db.update(m.id, { content: "V4" });

      const h = db.getHistory({ memory_id: m.id });
      expect(h.total).toBe(4); // create + 3 updates
    });

    it("history entries are ordered newest first", () => {
      const m = db.create({ content: "V1" });
      db.update(m.id, { content: "V2" });
      db.update(m.id, { content: "V3" });

      const h = db.getHistory({ memory_id: m.id });
      const contents = h.entries.map((e) => e.content);
      // Newest (V3) should come first
      expect(contents[0]).toBe("V3");
    });
  });

  // ─── delete trigger ───────────────────────────────────────────────────────

  describe("delete trigger", () => {
    it("records a 'delete' entry when a memory is deleted", () => {
      const m = db.create({ content: "To be deleted" });
      const id = m.id;
      db.delete(id);

      const h = db.getHistory({ memory_id: id });
      expect(h.total).toBe(2); // create + delete
      const ops = h.entries.map((e) => e.operation);
      expect(ops).toContain("delete");
    });

    it("delete entry captures the content before deletion", () => {
      const m = db.create({ content: "Important content" });
      const id = m.id;
      db.delete(id);

      const h = db.getHistory({ memory_id: id });
      const delEntry = h.entries.find((e) => e.operation === "delete")!;
      expect(delEntry.content).toBe("Important content");
    });
  });

  // ─── pagination ───────────────────────────────────────────────────────────

  describe("pagination", () => {
    it("limit restricts the number of returned entries", () => {
      const m = db.create({ content: "V1" });
      db.update(m.id, { content: "V2" });
      db.update(m.id, { content: "V3" });
      db.update(m.id, { content: "V4" });

      const h = db.getHistory({ memory_id: m.id, limit: 2 });
      expect(h.entries).toHaveLength(2);
      expect(h.total).toBe(4); // total still reflects all entries
    });

    it("offset skips entries correctly", () => {
      const m = db.create({ content: "V1" });
      db.update(m.id, { content: "V2" });
      db.update(m.id, { content: "V3" });

      const all = db.getHistory({ memory_id: m.id, limit: 10 });
      const paged = db.getHistory({ memory_id: m.id, limit: 1, offset: 1 });

      expect(paged.entries[0]!.history_id).toBe(all.entries[1]!.history_id);
    });
  });

  // ─── no history ───────────────────────────────────────────────────────────

  it("returns empty result for unknown memory_id", () => {
    const h = db.getHistory({ memory_id: "00000000-0000-0000-0000-000000000000" });
    expect(h.total).toBe(0);
    expect(h.entries).toHaveLength(0);
  });

  // ─── fields ───────────────────────────────────────────────────────────────

  it("entry tags are parsed as an array", () => {
    const m = db.create({ content: "Tagged", tags: ["alpha", "beta"] });
    const e = db.getHistory({ memory_id: m.id }).entries[0]!;
    expect(Array.isArray(e.tags)).toBe(true);
    expect(e.tags).toEqual(["alpha", "beta"]);
  });

  it("entry metadata is parsed as an object", () => {
    const m = db.create({ content: "Meta", metadata: { key: "value" } });
    const e = db.getHistory({ memory_id: m.id }).entries[0]!;
    expect(typeof e.metadata).toBe("object");
    expect((e.metadata as Record<string, string>)["key"]).toBe("value");
  });

  it("entry has a numeric history_id", () => {
    const m = db.create({ content: "ID test" });
    const e = db.getHistory({ memory_id: m.id }).entries[0]!;
    expect(typeof e.history_id).toBe("number");
    expect(e.history_id).toBeGreaterThan(0);
  });

  // ─── isolation ────────────────────────────────────────────────────────────

  it("history of one memory does not appear in history of another", () => {
    const m1 = db.create({ content: "Memory 1" });
    const m2 = db.create({ content: "Memory 2" });
    db.update(m1.id, { content: "Updated M1" });

    const h2 = db.getHistory({ memory_id: m2.id });
    expect(h2.total).toBe(1); // only its own create
    expect(h2.entries[0]!.memory_id).toBe(m2.id);
  });
});
