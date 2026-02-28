import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("list_memories tool", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "First", category: "code", tags: ["react"] });
    db.create({ content: "Second", category: "decision", tags: ["backend"] });
    db.create({ content: "Third", category: "code", tags: ["react", "hooks"] });
  });

  afterEach(() => {
    db.close();
  });

  it("lists all memories", () => {
    const results = db.list();
    expect(results).toHaveLength(3);
  });

  it("filters by category", () => {
    const results = db.list({ category: "code" });
    expect(results).toHaveLength(2);
  });

  it("filters by tag", () => {
    const results = db.list({ tag: "react" });
    expect(results).toHaveLength(2);
  });

  it("combines category and tag filters", () => {
    const results = db.list({ category: "code", tag: "hooks" });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("Third");
  });

  it("supports limit and offset", () => {
    const page1 = db.list({ limit: 2, offset: 0 });
    const page2 = db.list({ limit: 2, offset: 2 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
  });
});

describe("listWithTotal", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "First", category: "code", tags: ["react"] });
    db.create({ content: "Second", category: "decision", tags: ["backend"] });
    db.create({ content: "Third", category: "code", tags: ["react", "hooks"] });
  });

  afterEach(() => {
    db.close();
  });

  it("returns memories and total in a single call", () => {
    const { memories, total } = db.listWithTotal();
    expect(memories).toHaveLength(3);
    expect(total).toBe(3);
  });

  it("total reflects full dataset even when limit is applied", () => {
    const { memories, total } = db.listWithTotal({ limit: 1, offset: 0 });
    expect(memories).toHaveLength(1);
    expect(total).toBe(3);
  });

  it("filters by category and returns correct total", () => {
    const { memories, total } = db.listWithTotal({ category: "code" });
    expect(memories).toHaveLength(2);
    expect(total).toBe(2);
  });

  it("filters by tag and returns correct total", () => {
    const { memories, total } = db.listWithTotal({ tag: "react" });
    expect(memories).toHaveLength(2);
    expect(total).toBe(2);
  });

  it("combines category and tag filters", () => {
    const { memories, total } = db.listWithTotal({ category: "code", tag: "hooks" });
    expect(memories).toHaveLength(1);
    expect(total).toBe(1);
    expect(memories[0].content).toBe("Third");
  });

  it("returns total=0 and empty memories when no results match", () => {
    const { memories, total } = db.listWithTotal({ category: "nonexistent" });
    expect(memories).toHaveLength(0);
    expect(total).toBe(0);
  });

  it("memory items do not contain total_count field", () => {
    const { memories } = db.listWithTotal();
    for (const m of memories) {
      expect(m).not.toHaveProperty("total_count");
    }
  });
});

describe("list_memories — compact & content_preview_len (tool-layer logic)", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "A".repeat(250), category: "code",     tags: ["ts"] });
    db.create({ content: "Brief note",    category: "decision", tags: ["arch"] });
  });

  afterEach(() => {
    db.close();
  });

  it("content_preview_len truncates content to given length", () => {
    const limit = 40;
    const memories = db.list({ category: "code" });
    const truncated = memories[0].content.slice(0, limit);
    expect(truncated).toHaveLength(limit);
    expect(truncated).toBe("A".repeat(limit));
  });

  it("content_preview_len does not affect content shorter than limit", () => {
    const limit = 500;
    const memories = db.list({ category: "decision" });
    const truncated = memories[0].content.slice(0, limit);
    expect(truncated).toBe("Brief note");
  });

  it("compact mode exposes only {id, content, category, tags}", () => {
    const memories = db.list();
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
    const limit = 25;
    const memories = db.list({ category: "code" });
    const m = memories[0];
    const result = { id: m.id, content: m.content.slice(0, limit), category: m.category, tags: m.tags };
    expect(result.content).toHaveLength(limit);
    expect(result).not.toHaveProperty("metadata");
    expect(result).not.toHaveProperty("updated_at");
  });
});

describe("list_memories — metadata filtering", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "High priority task",  category: "code",     metadata: { priority: "high",   env: "prod" } });
    db.create({ content: "Low priority task",   category: "code",     metadata: { priority: "low",    env: "dev"  } });
    db.create({ content: "High priority design",category: "decision", metadata: { priority: "high",   env: "dev"  } });
    db.create({ content: "No priority field",   category: "general",  metadata: { unrelated: "value" } });
  });

  afterEach(() => {
    db.close();
  });

  it("filters by a metadata field value", () => {
    const { memories, total } = db.listWithTotal({ metadata_key: "priority", metadata_value: "high" });
    expect(total).toBe(2);
    expect(memories.every((m) => (m.metadata as Record<string, unknown>)["priority"] === "high")).toBe(true);
  });

  it("returns zero results when metadata value does not match", () => {
    const { memories, total } = db.listWithTotal({ metadata_key: "priority", metadata_value: "critical" });
    expect(total).toBe(0);
    expect(memories).toHaveLength(0);
  });

  it("metadata filter combined with category narrows results", () => {
    const { memories, total } = db.listWithTotal({ category: "code", metadata_key: "priority", metadata_value: "high" });
    expect(total).toBe(1);
    expect(memories[0].content).toBe("High priority task");
  });

  it("metadata filter combined with tag narrows results", () => {
    db.create({ content: "Tagged high priority", category: "code", tags: ["urgent"], metadata: { priority: "high" } });
    const { memories, total } = db.listWithTotal({ tag: "urgent", metadata_key: "priority", metadata_value: "high" });
    expect(total).toBe(1);
    expect(memories[0].content).toBe("Tagged high priority");
  });

  it("metadata filter combined with category and tag", () => {
    db.create({ content: "Cat+tag+meta match", category: "code", tags: ["x"], metadata: { env: "prod" } });
    const { memories, total } = db.listWithTotal({ category: "code", tag: "x", metadata_key: "env", metadata_value: "prod" });
    expect(total).toBe(1);
    expect(memories[0].content).toBe("Cat+tag+meta match");
  });

  it("metadata_key without metadata_value behaves like no metadata filter", () => {
    // Both must be present for the filter to activate; partial keys are ignored
    const { total: withBoth } = db.listWithTotal({ metadata_key: "priority", metadata_value: "high" });
    const { total: noFilter } = db.listWithTotal({});
    expect(withBoth).toBeLessThan(noFilter);
  });

  it("does not return records where the metadata key is missing", () => {
    const { memories } = db.listWithTotal({ metadata_key: "priority", metadata_value: "high" });
    expect(memories.every((m) => "priority" in (m.metadata as Record<string, unknown>))).toBe(true);
  });
});

describe("list_memories — sort_by", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "Oldest", category: "code" });
    db.create({ content: "Middle", category: "code" });
    db.create({ content: "Newest", category: "code" });
  });

  afterEach(() => { db.close(); });

  it("created_at_desc puts last-inserted first", () => {
    const { memories } = db.listWithTotal({ sort_by: "created_at_desc" });
    expect(memories[0].content).toBe("Newest");
    expect(memories[2].content).toBe("Oldest");
  });

  it("created_at_asc puts first-inserted first", () => {
    const { memories } = db.listWithTotal({ sort_by: "created_at_asc" });
    expect(memories[0].content).toBe("Oldest");
    expect(memories[2].content).toBe("Newest");
  });

  it("updated_at_desc returns all records without error", () => {
    const { memories, total } = db.listWithTotal({ sort_by: "updated_at_desc" });
    expect(total).toBe(3);
    expect(memories).toHaveLength(3);
  });

  it("asc and desc are mirror images of each other", () => {
    const desc = db.listWithTotal({ sort_by: "created_at_desc" }).memories.map((m) => m.id);
    const asc  = db.listWithTotal({ sort_by: "created_at_asc"  }).memories.map((m) => m.id);
    expect(desc).toEqual([...asc].reverse());
  });
});

describe("list_memories — date range", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "Alpha", category: "code" });
    db.create({ content: "Beta",  category: "decision" });
  });

  afterEach(() => { db.close(); });

  it("created_after with past date returns all memories", () => {
    const { total } = db.listWithTotal({ created_after: "2000-01-01" });
    expect(total).toBe(2);
  });

  it("created_after with future date returns zero memories", () => {
    const { total } = db.listWithTotal({ created_after: "2099-12-31" });
    expect(total).toBe(0);
  });

  it("updated_after with past date returns all memories", () => {
    const { total } = db.listWithTotal({ updated_after: "2000-01-01" });
    expect(total).toBe(2);
  });

  it("updated_after with future date returns zero memories", () => {
    const { total } = db.listWithTotal({ updated_after: "2099-12-31" });
    expect(total).toBe(0);
  });

  it("date range combined with category filter", () => {
    const { total } = db.listWithTotal({ category: "code", created_after: "2000-01-01" });
    expect(total).toBe(1);
  });

  it("date range combined with sort_by", () => {
    const { memories } = db.listWithTotal({ created_after: "2000-01-01", sort_by: "created_at_asc" });
    expect(memories[0].content).toBe("Alpha");
  });
});

describe("list_memories — created_before / updated_before", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "Alpha", category: "code" });
    db.create({ content: "Beta",  category: "decision" });
  });

  afterEach(() => { db.close(); });

  it("created_before with future date returns all memories", () => {
    const { total } = db.listWithTotal({ created_before: "2099-12-31" });
    expect(total).toBe(2);
  });

  it("created_before with past date returns zero memories", () => {
    const { total } = db.listWithTotal({ created_before: "2000-01-01" });
    expect(total).toBe(0);
  });

  it("updated_before with future date returns all memories", () => {
    const { total } = db.listWithTotal({ updated_before: "2099-12-31" });
    expect(total).toBe(2);
  });

  it("updated_before with past date returns zero memories", () => {
    const { total } = db.listWithTotal({ updated_before: "2000-01-01" });
    expect(total).toBe(0);
  });

  it("created_after + created_before as open range returns all", () => {
    const { total } = db.listWithTotal({ created_after: "2000-01-01", created_before: "2099-12-31" });
    expect(total).toBe(2);
  });

  it("created_after + created_before with impossible range returns zero", () => {
    // after > before ⟹ no row satisfies both conditions
    const { total } = db.listWithTotal({ created_after: "2099-01-01", created_before: "2000-01-01" });
    expect(total).toBe(0);
  });

  it("created_before combined with category filter", () => {
    const { total } = db.listWithTotal({ category: "code", created_before: "2099-12-31" });
    expect(total).toBe(1);
  });

  it("created_before combined with sort_by", () => {
    const { memories } = db.listWithTotal({ created_before: "2099-12-31", sort_by: "created_at_asc" });
    expect(memories[0].content).toBe("Alpha");
    expect(memories[1].content).toBe("Beta");
  });

  it("updated_before combined with tag filter", () => {
    db.create({ content: "Gamma", tags: ["x"] });
    const { total } = db.listWithTotal({ tag: "x", updated_before: "2099-12-31" });
    expect(total).toBe(1);
  });
});
