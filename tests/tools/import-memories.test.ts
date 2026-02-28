import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("import_memories — mode: insert", () => {
  let db: MemoryDatabase;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it("inserts all valid rows and returns correct count", () => {
    const result = db.importBatch([
      { content: "First import",  category: "code",     tags: ["ts"] },
      { content: "Second import", category: "decision" },
    ], "insert");
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.ids).toHaveLength(2);
    expect(db.count()).toBe(2);
  });

  it("returns empty result for empty input without touching the DB", () => {
    const result = db.importBatch([], "insert");
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.ids).toHaveLength(0);
  });

  it("skips rows with empty or blank content", () => {
    const result = db.importBatch([
      { content: "Valid row" },
      { content: "" },
      { content: "   " },
    ], "insert");
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(2);
    expect(db.count()).toBe(1);
  });

  it("always generates a fresh UUID even if id is provided in insert mode", () => {
    const fixedId = "00000000-1111-0000-0000-000000000001";
    const result = db.importBatch([{ id: fixedId, content: "With explicit id" }], "insert");
    // The inserted row must have a NEW id (not fixedId)
    expect(result.ids[0]).not.toBe(fixedId);
    // The original fixedId should not exist
    expect(db.getById(fixedId)).toBeNull();
  });

  it("applies normalization (trim + lowercase category + dedup tags)", () => {
    const result = db.importBatch([
      { content: "  trimmed  ", category: "CODE", tags: ["dup", "dup", "keep"] },
    ], "insert");
    const m = db.getById(result.ids[0])!;
    expect(m.content).toBe("trimmed");
    expect(m.category).toBe("code");
    expect(m.tags).toEqual(["dup", "keep"]);
  });

  it("all inserted memories are retrievable by id", () => {
    const result = db.importBatch([
      { content: "Persist A" },
      { content: "Persist B" },
    ], "insert");
    for (const id of result.ids) {
      expect(db.getById(id)).not.toBeNull();
    }
  });

  it("mode defaults to insert when omitted", () => {
    const result = db.importBatch([{ content: "Default mode" }]);
    expect(result.imported).toBe(1);
    expect(db.count()).toBe(1);
  });
});

describe("import_memories — mode: upsert", () => {
  let db: MemoryDatabase;
  let existingId: string;

  beforeEach(() => {
    db = createTestDb();
    existingId = db.create({ content: "Original content", category: "code", tags: ["old"] }).id;
  });
  afterEach(() => { db.close(); });

  it("updates existing memory when id is found", () => {
    const result = db.importBatch([
      { id: existingId, content: "Updated content", category: "decision", tags: ["new"] },
    ], "upsert");
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    const m = db.getById(existingId)!;
    expect(m.content).toBe("Updated content");
    expect(m.category).toBe("decision");
    expect(m.tags).toEqual(["new"]);
  });

  it("inserts as new memory when id is not found in upsert", () => {
    const unknownId = "00000000-0000-0000-0000-aaaaaaaaaaaa";
    const result = db.importBatch([
      { id: unknownId, content: "New memory via upsert" },
    ], "upsert");
    expect(result.imported).toBe(1);
    // The unknown id did not exist → inserted with a new id
    expect(db.getById(unknownId)).toBeNull();
    // New entry was created
    expect(db.count()).toBe(2);
  });

  it("inserts as new when id is absent in upsert mode", () => {
    const result = db.importBatch([
      { content: "No id in upsert" },
    ], "upsert");
    expect(result.imported).toBe(1);
    expect(db.count()).toBe(2);
  });

  it("upsert is idempotent — re-importing same id updates timestamps but keeps data", () => {
    db.importBatch([{ id: existingId, content: "Pass 1" }], "upsert");
    db.importBatch([{ id: existingId, content: "Pass 2" }], "upsert");
    const m = db.getById(existingId)!;
    expect(m.content).toBe("Pass 2");
    expect(db.count()).toBe(1);
  });

  it("mixed batch: some existing ids, some new", () => {
    const fakeId = "00000000-0000-0000-0000-bbbbbbbbbbbb";
    const result = db.importBatch([
      { id: existingId, content: "Updated existing" },
      { id: fakeId,     content: "Will be inserted as new" },
    ], "upsert");
    expect(result.imported).toBe(2);
    expect(db.count()).toBe(2);
  });
});
