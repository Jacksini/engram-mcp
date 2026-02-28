import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("restore_memory (restoreMemory)", () => {
  let db: MemoryDatabase;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  // ─── basic restore ────────────────────────────────────────────────────────

  it("restores memory content to a previous version", () => {
    const m = db.create({ content: "Original content", category: "code" });

    // Get the create history entry
    const h1 = db.getHistory({ memory_id: m.id });
    const createEntry = h1.entries.find((e) => e.operation === "create")!;

    // Update the memory
    db.update(m.id, { content: "Updated content" });

    // Restore to original
    const restored = db.restoreMemory({ memory_id: m.id, history_id: createEntry.history_id });

    expect(restored).not.toBeNull();
    expect(restored!.id).toBe(m.id);
    expect(restored!.content).toBe("Original content");
    expect(restored!.category).toBe("code");
  });

  it("restored memory is reflected in getById", () => {
    const m = db.create({ content: "V1", category: "general" });
    const createEntry = db.getHistory({ memory_id: m.id }).entries[0]!;

    db.update(m.id, { content: "V2" });
    db.restoreMemory({ memory_id: m.id, history_id: createEntry.history_id });

    const current = db.getById(m.id)!;
    expect(current.content).toBe("V1");
  });

  it("restores tags and category correctly", () => {
    const m = db.create({ content: "Tagged", category: "decision", tags: ["alpha", "beta"] });
    const createEntry = db.getHistory({ memory_id: m.id }).entries[0]!;

    db.update(m.id, { category: "code", tags: ["gamma"] });
    const restored = db.restoreMemory({ memory_id: m.id, history_id: createEntry.history_id });

    expect(restored!.category).toBe("decision");
    expect(restored!.tags).toEqual(["alpha", "beta"]);
  });

  it("restores metadata correctly", () => {
    const m = db.create({ content: "Meta memory", metadata: { version: 1 } });
    const createEntry = db.getHistory({ memory_id: m.id }).entries[0]!;

    db.update(m.id, { metadata: { version: 2, extra: "data" } });
    const restored = db.restoreMemory({ memory_id: m.id, history_id: createEntry.history_id });

    expect((restored!.metadata as Record<string, number>)["version"]).toBe(1);
    expect((restored!.metadata as Record<string, unknown>)["extra"]).toBeUndefined();
  });

  // ─── restore is itself tracked ────────────────────────────────────────────

  it("a restore operation is tracked as a new 'update' history entry", () => {
    const m = db.create({ content: "V1" });
    const createEntry = db.getHistory({ memory_id: m.id }).entries[0]!;

    db.update(m.id, { content: "V2" });
    db.restoreMemory({ memory_id: m.id, history_id: createEntry.history_id });

    // Should now have: create, update(V2), update(restore to V1)
    const h = db.getHistory({ memory_id: m.id });
    expect(h.total).toBe(3);
  });

  it("restoring multiple times accumulates history entries", () => {
    const m = db.create({ content: "A" });
    const hA = db.getHistory({ memory_id: m.id }).entries[0]!;

    db.update(m.id, { content: "B" });
    db.restoreMemory({ memory_id: m.id, history_id: hA.history_id }); // back to A
    db.restoreMemory({ memory_id: m.id, history_id: hA.history_id }); // again

    const h = db.getHistory({ memory_id: m.id });
    expect(h.total).toBe(4);
  });

  // ─── can restore to any snapshot ──────────────────────────────────────────

  it("can restore to an intermediate update snapshot", () => {
    const m = db.create({ content: "V1" });
    db.update(m.id, { content: "V2" });
    db.update(m.id, { content: "V3" });

    const h = db.getHistory({ memory_id: m.id });
    // entries: [V3(update), V2(update), V1(create)] — newest first
    const v2Entry = h.entries.find((e) => e.content === "V2")!;

    const restored = db.restoreMemory({ memory_id: m.id, history_id: v2Entry.history_id });
    expect(restored!.content).toBe("V2");
  });

  // ─── error cases ──────────────────────────────────────────────────────────

  it("returns null when memory does not exist", () => {
    const result = db.restoreMemory({
      memory_id: "00000000-0000-0000-0000-000000000000",
      history_id: 1,
    });
    expect(result).toBeNull();
  });

  it("returns null when history_id does not exist for that memory", () => {
    const m = db.create({ content: "Exists" });
    const result = db.restoreMemory({ memory_id: m.id, history_id: 99999 });
    expect(result).toBeNull();
  });

  it("returns null when history_id belongs to a different memory", () => {
    const m1 = db.create({ content: "Memory 1" });
    const m2 = db.create({ content: "Memory 2" });

    const m1HistoryId = db.getHistory({ memory_id: m1.id }).entries[0]!.history_id;

    // Try to restore m2 using m1's history_id — should fail
    const result = db.restoreMemory({ memory_id: m2.id, history_id: m1HistoryId });
    expect(result).toBeNull();
  });

  it("returns null when memory has been deleted", () => {
    const m = db.create({ content: "Will be deleted" });
    const hEntry = db.getHistory({ memory_id: m.id }).entries[0]!;
    db.delete(m.id);

    const result = db.restoreMemory({ memory_id: m.id, history_id: hEntry.history_id });
    expect(result).toBeNull();
  });

  // ─── return value shape ───────────────────────────────────────────────────

  it("returned memory has all standard Memory fields", () => {
    const m = db.create({ content: "Full fields", category: "architecture", tags: ["x"] });
    const entry = db.getHistory({ memory_id: m.id }).entries[0]!;
    db.update(m.id, { content: "Changed" });

    const restored = db.restoreMemory({ memory_id: m.id, history_id: entry.history_id })!;
    expect(restored.id).toBeDefined();
    expect(restored.content).toBeDefined();
    expect(restored.category).toBeDefined();
    expect(Array.isArray(restored.tags)).toBe(true);
    expect(typeof restored.metadata).toBe("object");
    expect(restored.created_at).toBeDefined();
    expect(restored.updated_at).toBeDefined();
  });
});
