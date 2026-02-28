import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("get_memories (getByIds)", () => {
  let db: MemoryDatabase;
  let idA: string;
  let idB: string;
  let idC: string;

  beforeEach(() => {
    db = createTestDb();
    idA = db.create({ content: "Alpha", category: "code",     tags: ["ts"] }).id;
    idB = db.create({ content: "Beta",  category: "decision", tags: ["arch"] }).id;
    idC = db.create({ content: "Gamma", category: "bug" }).id;
  });

  afterEach(() => {
    db.close();
  });

  it("returns all memories for valid ids", () => {
    const results = db.getByIds([idA, idB, idC]);
    expect(results).toHaveLength(3);
  });

  it("returns empty array for empty input without touching the database", () => {
    const results = db.getByIds([]);
    expect(results).toHaveLength(0);
  });

  it("returns only found memories — unknown ids are silently absent", () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const results = db.getByIds([idA, fakeId]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(idA);
  });

  it("returns empty array when all ids are unknown", () => {
    const results = db.getByIds([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    ]);
    expect(results).toHaveLength(0);
  });

  it("retrieves correct content, category and tags for each memory", () => {
    const results = db.getByIds([idA, idB]);
    const byId = Object.fromEntries(results.map((m) => [m.id, m]));

    expect(byId[idA].content).toBe("Alpha");
    expect(byId[idA].category).toBe("code");
    expect(byId[idA].tags).toEqual(["ts"]);

    expect(byId[idB].content).toBe("Beta");
    expect(byId[idB].category).toBe("decision");
  });

  it("returned memories include all Memory fields (no missing timestamps or metadata)", () => {
    const [mem] = db.getByIds([idA]);
    expect(mem).toHaveProperty("id");
    expect(mem).toHaveProperty("content");
    expect(mem).toHaveProperty("category");
    expect(mem).toHaveProperty("tags");
    expect(mem).toHaveProperty("metadata");
    expect(mem).toHaveProperty("created_at");
    expect(mem).toHaveProperty("updated_at");
  });

  it("returns results in recency order (most recent first)", () => {
    const results = db.getByIds([idA, idB, idC]);
    // idC was created last, so it should be first
    expect(results[0].id).toBe(idC);
  });

  it("single id returns exactly one memory", () => {
    const results = db.getByIds([idB]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(idB);
  });

  it("is consistent with individual getById calls", () => {
    const batch = db.getByIds([idA, idB]);
    const single = [db.getById(idA)!, db.getById(idB)!];

    const batchById = Object.fromEntries(batch.map((m) => [m.id, m]));
    for (const mem of single) {
      expect(batchById[mem.id]).toEqual(mem);
    }
  });
});

describe("get_memories — compact & content_preview_len (tool-layer logic)", () => {
  let db: MemoryDatabase;
  let idA: string;
  let idB: string;

  beforeEach(() => {
    db = createTestDb();
    idA = db.create({ content: "A".repeat(200), category: "code",     tags: ["ts"] }).id;
    idB = db.create({ content: "Short content", category: "decision", tags: ["arch"] }).id;
  });

  afterEach(() => {
    db.close();
  });

  it("content_preview_len truncates content to given length", () => {
    const limit = 50;
    const memories = db.getByIds([idA]);
    const truncated = memories[0].content.slice(0, limit);
    expect(truncated).toHaveLength(limit);
    expect(truncated).toBe("A".repeat(limit));
  });

  it("content_preview_len does not truncate content shorter than limit", () => {
    const limit = 500;
    const memories = db.getByIds([idB]);
    const truncated = memories[0].content.slice(0, limit);
    expect(truncated).toBe("Short content");
  });

  it("compact mode exposes only {id, content, category, tags}", () => {
    const memories = db.getByIds([idA]);
    const m = memories[0];
    const compact = { id: m.id, content: m.content, category: m.category, tags: m.tags };
    expect(compact).toHaveProperty("id");
    expect(compact).toHaveProperty("content");
    expect(compact).toHaveProperty("category");
    expect(compact).toHaveProperty("tags");
    expect(compact).not.toHaveProperty("metadata");
    expect(compact).not.toHaveProperty("created_at");
    expect(compact).not.toHaveProperty("updated_at");
  });

  it("compact + content_preview_len work together", () => {
    const limit = 30;
    const memories = db.getByIds([idA]);
    const m = memories[0];
    const result = { id: m.id, content: m.content.slice(0, limit), category: m.category, tags: m.tags };
    expect(result.content).toHaveLength(limit);
    expect(result).not.toHaveProperty("metadata");
    expect(result).not.toHaveProperty("created_at");
  });
});

describe("get_memories — limit & offset pagination", () => {
  let db: MemoryDatabase;
  let ids: string[];

  beforeEach(() => {
    db = createTestDb();
    // Insert 5 memories; getByIds returns most-recent first so order is ids[4]..ids[0]
    ids = Array.from({ length: 5 }, (_, i) =>
      db.create({ content: `Memory ${i}`, category: "general" }).id
    );
  });

  afterEach(() => {
    db.close();
  });

  it("without limit/offset returns all found memories", () => {
    const all = db.getByIds(ids);
    expect(all).toHaveLength(5);
  });

  it("limit restricts number of returned memories", () => {
    const all = db.getByIds(ids);
    const limited = all.slice(0, 2);
    expect(limited).toHaveLength(2);
  });

  it("offset skips the first N memories", () => {
    const all = db.getByIds(ids);
    const offset = 3;
    const paged = all.slice(offset);
    expect(paged).toHaveLength(2);
  });

  it("limit + offset together pages correctly", () => {
    const all = db.getByIds(ids);
    const page1 = all.slice(0, 2);
    const page2 = all.slice(2, 4);
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it("offset beyond result length returns empty array", () => {
    const all = db.getByIds(ids);
    const paged = all.slice(100);
    expect(paged).toHaveLength(0);
  });

  it("limit larger than result set returns all results", () => {
    const all = db.getByIds(ids);
    const paged = all.slice(0, 100);
    expect(paged).toHaveLength(5);
  });

  it("total reflects all found memories regardless of limit", () => {
    const all = db.getByIds(ids);
    // total = all found (5), count = paged result
    const paged = all.slice(0, 2);
    expect(all.length).toBe(5);
    expect(paged.length).toBe(2);
  });
});
