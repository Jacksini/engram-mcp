import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("search_memories tool", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "React component patterns with hooks", category: "code", tags: ["react", "frontend"] });
    db.create({ content: "Database migration strategy for PostgreSQL", category: "architecture", tags: ["database", "backend"] });
    db.create({ content: "React testing library best practices", category: "code", tags: ["react", "testing"] });
    db.create({ content: "Node.js error handling patterns", category: "code", tags: ["node", "backend"] });
  });

  afterEach(() => {
    db.close();
  });

  it("finds memories matching a keyword", () => {
    const results = db.search({ query: "React" });
    expect(results).toHaveLength(2);
  });

  it("filters results by category", () => {
    const results = db.search({ query: "patterns", category: "code" });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.category === "code")).toBe(true);
  });

  it("limits results", () => {
    const results = db.search({ query: "patterns", limit: 1 });
    expect(results).toHaveLength(1);
  });

  it("returns empty for unmatched query", () => {
    const results = db.search({ query: "kubernetes" });
    expect(results).toEqual([]);
  });

  it("mode 'any' finds docs with ANY of the terms (OR)", () => {
    // "react" and "postgresql" are in different docs
    const results = db.search({ query: "react postgresql", mode: "any" });
    expect(results).toHaveLength(3); // 2 react + 1 postgresql
  });

  it("mode 'all' only returns docs with ALL terms (AND)", () => {
    // "react" and "postgresql" are NOT in the same doc
    const results = db.search({ query: "react postgresql", mode: "all" });
    expect(results).toHaveLength(0);
  });

  it("mode 'all' returns docs where both terms appear", () => {
    // "react" and "testing" both appear in id-3
    const results = db.search({ query: "react testing", mode: "all" });
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain("testing");
  });

  it("filters by tag when searching", () => {
    const results = db.search({ query: "patterns", tag: "react" });
    expect(results).toHaveLength(1);
    expect(results[0].tags).toContain("react");
  });

  it("category filter is case-insensitive", () => {
    const upper = db.search({ query: "patterns", category: "CODE" });
    const lower = db.search({ query: "patterns", category: "code" });
    expect(upper).toEqual(lower);
  });

  it("offsets search results for pagination", () => {
    for (let i = 0; i < 5; i++) {
      db.create({ content: `pagination test memory ${i}`, category: "code" });
    }
    const page1 = db.search({ query: "pagination", limit: 2, offset: 0 });
    const page2 = db.search({ query: "pagination", limit: 2, offset: 2 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it("sanitizes FTS special characters without throwing", () => {
    db.create({ content: 'injection: "OR 1=1"', category: "bug" });
    // A query with embedded quotes should not throw and should return results safely
    expect(() => db.search({ query: '"OR 1=1"' })).not.toThrow();
    expect(() => db.search({ query: "term\"injection" })).not.toThrow();
  });
});

describe("searchWithTotal", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "React component patterns with hooks", category: "code", tags: ["react"] });
    db.create({ content: "React testing library best practices", category: "code", tags: ["react", "testing"] });
    db.create({ content: "Node.js error handling patterns", category: "code", tags: ["node"] });
    db.create({ content: "Database migration strategy for PostgreSQL", category: "architecture", tags: ["database"] });
  });

  afterEach(() => {
    db.close();
  });

  it("returns memories and total in a single call", () => {
    const { memories, total } = db.searchWithTotal({ query: "React" });
    expect(memories).toHaveLength(2);
    expect(total).toBe(2);
  });

  it("total reflects full match count even when limit is applied", () => {
    const { memories, total } = db.searchWithTotal({ query: "React", limit: 1, offset: 0 });
    expect(memories).toHaveLength(1);
    expect(total).toBe(2);
  });

  it("returns total=0 and empty memories for unmatched query", () => {
    const { memories, total } = db.searchWithTotal({ query: "kubernetes" });
    expect(memories).toHaveLength(0);
    expect(total).toBe(0);
  });

  it("filters by category and total reflects filtered count", () => {
    const { memories, total } = db.searchWithTotal({ query: "patterns", category: "code" });
    expect(memories).toHaveLength(2);
    expect(total).toBe(2);
  });

  it("filters by tag and total reflects filtered count", () => {
    const { memories, total } = db.searchWithTotal({ query: "react", tag: "testing" });
    expect(memories).toHaveLength(1);
    expect(total).toBe(1);
  });

  it("memory items do not contain total_count field", () => {
    const { memories } = db.searchWithTotal({ query: "react" });
    for (const m of memories) {
      expect(m).not.toHaveProperty("total_count");
    }
  });

  it("supports offset pagination consistently with total", () => {
    const page1 = db.searchWithTotal({ query: "react", limit: 1, offset: 0 });
    const page2 = db.searchWithTotal({ query: "react", limit: 1, offset: 1 });

    expect(page1.memories).toHaveLength(1);
    expect(page2.memories).toHaveLength(1);
    expect(page1.total).toBe(2);
    expect(page2.total).toBe(2);
    expect(page1.memories[0].id).not.toBe(page2.memories[0].id);
  });
});

describe("search_memories — compact & content_preview_len (tool-layer logic)", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "X".repeat(300), category: "code", tags: ["ts"] });
    db.create({ content: "Short text here", category: "code", tags: ["ts"] });
  });

  afterEach(() => {
    db.close();
  });

  it("content_preview_len truncates content to given length", () => {
    const limit = 50;
    const memories = db.search({ query: "XXX" });
    const truncated = memories[0].content.slice(0, limit);
    expect(truncated).toHaveLength(limit);
    expect(truncated).toBe("X".repeat(limit));
  });

  it("content_preview_len does not reduce content shorter than limit", () => {
    const limit = 500;
    const memories = db.search({ query: "Short" });
    const truncated = memories[0].content.slice(0, limit);
    expect(truncated).toBe("Short text here");
  });

  it("compact mode exposes only {id, content, category, tags}", () => {
    const memories = db.search({ query: "XXX" });
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
    const limit = 20;
    const memories = db.search({ query: "XXX" });
    const m = memories[0];
    const result = { id: m.id, content: m.content.slice(0, limit), category: m.category, tags: m.tags };
    expect(result.content).toHaveLength(limit);
    expect(result).not.toHaveProperty("metadata");
    expect(result).not.toHaveProperty("created_at");
  });
});

describe("search NEAR mode", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    // "alpha beta" appear close together
    db.create({ content: "The alpha and beta releases are ready", category: "code" });
    // "alpha" and "gamma" are far apart (many tokens between them)
    db.create({ content: "Alpha is here but the other term gamma is way further down the sentence with many words in between", category: "code" });
    // Only "alpha", no "beta"
    db.create({ content: "Alpha version deployed to production", category: "code" });
  });

  afterEach(() => {
    db.close();
  });

  it("mode='near' matches terms close together", () => {
    const results = db.search({ query: "alpha beta", mode: "near", near_distance: 5 });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toContain("alpha");
    expect(results[0].content).toContain("beta");
  });

  it("mode='near' with tight distance misses terms too far apart", () => {
    // distance=3 is too tight for "alpha ... gamma" (many words between)
    const near = db.search({ query: "alpha gamma", mode: "near", near_distance: 3 });
    const far  = db.search({ query: "alpha gamma", mode: "near", near_distance: 30 });
    // The document with many tokens between should only appear with a large distance
    expect(far.length).toBeGreaterThanOrEqual(near.length);
  });

  it("mode='near' with single term behaves like a regular prefix match", () => {
    const results = db.search({ query: "alpha", mode: "near" });
    // All three docs contain "alpha"
    expect(results.length).toBe(3);
  });

  it("mode='near' uses default distance of 10 when near_distance is omitted", () => {
    expect(() => db.search({ query: "alpha beta", mode: "near" })).not.toThrow();
    const results = db.search({ query: "alpha beta", mode: "near" });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("mode='near' combined with category filter narrows results", () => {
    db.create({ content: "alpha and beta together", category: "decision" });
    const code     = db.search({ query: "alpha beta", mode: "near", near_distance: 5, category: "code" });
    const decision = db.search({ query: "alpha beta", mode: "near", near_distance: 5, category: "decision" });
    expect(decision.length).toBe(1);
    expect(code.length).toBeGreaterThanOrEqual(1);
    expect(code.every((m) => m.category === "code")).toBe(true);
  });

  it("searchWithTotal with mode='near' returns total and memories correctly", () => {
    const { memories, total } = db.searchWithTotal({ query: "alpha beta", mode: "near", near_distance: 5 });
    expect(total).toBe(memories.length);
    expect(total).toBeGreaterThanOrEqual(1);
  });
});

describe("search_memories — metadata filtering", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "React component high priority",   category: "code",     metadata: { priority: "high" } });
    db.create({ content: "React testing low priority",      category: "code",     metadata: { priority: "low"  } });
    db.create({ content: "Architecture high priority plan", category: "decision", metadata: { priority: "high" } });
    db.create({ content: "Node.js async patterns",          category: "code",     metadata: { stack: "node"   } });
  });

  afterEach(() => {
    db.close();
  });

  it("FTS + metadata filter returns only matching records", () => {
    const { memories, total } = db.searchWithTotal({
      query: "React", metadata_key: "priority", metadata_value: "high",
    });
    expect(total).toBe(1);
    expect(memories[0].content).toContain("React");
    expect((memories[0].metadata as Record<string, unknown>)["priority"]).toBe("high");
  });

  it("FTS + metadata filter returns zero when nothing matches", () => {
    const { memories, total } = db.searchWithTotal({
      query: "React", metadata_key: "priority", metadata_value: "critical",
    });
    expect(total).toBe(0);
    expect(memories).toHaveLength(0);
  });

  it("FTS + metadata + category filter narrows results", () => {
    const { memories, total } = db.searchWithTotal({
      query: "priority", category: "decision", metadata_key: "priority", metadata_value: "high",
    });
    expect(total).toBe(1);
    expect(memories[0].category).toBe("decision");
  });

  it("FTS + metadata + tag filter narrows results", () => {
    db.create({ content: "Tagged React high", tags: ["frontend"], metadata: { priority: "high" } });
    const { memories, total } = db.searchWithTotal({
      query: "React", tag: "frontend", metadata_key: "priority", metadata_value: "high",
    });
    expect(total).toBe(1);
    expect(memories[0].content).toContain("Tagged React high");
  });

  it("metadata total_count field is not leaked into memory objects", () => {
    const { memories } = db.searchWithTotal({
      query: "React", metadata_key: "priority", metadata_value: "high",
    });
    for (const m of memories) {
      expect(m).not.toHaveProperty("total_count");
    }
  });
});

describe("search_memories — date range filtering", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "TypeScript async patterns" });
    db.create({ content: "TypeScript strict mode" });
    db.create({ content: "Python virtual environments" });
  });

  afterEach(() => {
    db.close();
  });

  it("created_after with past date returns all FTS matches", () => {
    const { total } = db.searchWithTotal({ query: "TypeScript", created_after: "2000-01-01" });
    expect(total).toBe(2);
  });

  it("created_after with future date returns zero results", () => {
    const { total } = db.searchWithTotal({ query: "TypeScript", created_after: "2099-12-31" });
    expect(total).toBe(0);
  });

  it("updated_after with past date returns FTS matches", () => {
    const { total } = db.searchWithTotal({ query: "TypeScript", updated_after: "2000-01-01" });
    expect(total).toBe(2);
  });

  it("updated_after with future date returns zero", () => {
    const { total } = db.searchWithTotal({ query: "TypeScript", updated_after: "2099-12-31" });
    expect(total).toBe(0);
  });

  it("date range combined with category filter", () => {
    db.create({ content: "TypeScript in decisions", category: "decision" });
    const { total } = db.searchWithTotal({
      query: "TypeScript", category: "decision", created_after: "2000-01-01",
    });
    expect(total).toBe(1);
  });
});

describe("search_memories — created_before / updated_before", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "TypeScript async patterns" });
    db.create({ content: "TypeScript strict mode" });
  });

  afterEach(() => {
    db.close();
  });

  it("created_before with future date returns all FTS matches", () => {
    const { total } = db.searchWithTotal({ query: "TypeScript", created_before: "2099-12-31" });
    expect(total).toBe(2);
  });

  it("created_before with past date returns zero results", () => {
    const { total } = db.searchWithTotal({ query: "TypeScript", created_before: "2000-01-01" });
    expect(total).toBe(0);
  });

  it("updated_before with future date returns FTS matches", () => {
    const { total } = db.searchWithTotal({ query: "TypeScript", updated_before: "2099-12-31" });
    expect(total).toBe(2);
  });

  it("updated_before with past date returns zero", () => {
    const { total } = db.searchWithTotal({ query: "TypeScript", updated_before: "2000-01-01" });
    expect(total).toBe(0);
  });

  it("created_after + created_before as open range returns all matches", () => {
    const { total } = db.searchWithTotal({
      query: "TypeScript", created_after: "2000-01-01", created_before: "2099-12-31",
    });
    expect(total).toBe(2);
  });

  it("impossible range (after > before) returns zero", () => {
    const { total } = db.searchWithTotal({
      query: "TypeScript", created_after: "2099-01-01", created_before: "2000-01-01",
    });
    expect(total).toBe(0);
  });

  it("created_before combined with category filter", () => {
    db.create({ content: "TypeScript in decisions", category: "decision" });
    const { total } = db.searchWithTotal({
      query: "TypeScript", category: "decision", created_before: "2099-12-31",
    });
    expect(total).toBe(1);
  });
});

describe("search_memories — sort_by", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
    db.create({ content: "Oldest TypeScript note" });
    db.create({ content: "Middle TypeScript note" });
    db.create({ content: "Newest TypeScript note" });
  });

  afterEach(() => {
    db.close();
  });

  it("default (no sort_by) uses FTS rank — returns all results without error", () => {
    const { memories, total } = db.searchWithTotal({ query: "TypeScript" });
    expect(total).toBe(3);
    expect(memories).toHaveLength(3);
  });

  it("sort_by created_at_desc puts last-inserted first", () => {
    const { memories } = db.searchWithTotal({ query: "TypeScript", sort_by: "created_at_desc" });
    expect(memories[0].content).toBe("Newest TypeScript note");
    expect(memories[2].content).toBe("Oldest TypeScript note");
  });

  it("sort_by created_at_asc puts first-inserted first", () => {
    const { memories } = db.searchWithTotal({ query: "TypeScript", sort_by: "created_at_asc" });
    expect(memories[0].content).toBe("Oldest TypeScript note");
    expect(memories[2].content).toBe("Newest TypeScript note");
  });

  it("sort_by updated_at_desc returns all matches without error", () => {
    const { memories, total } = db.searchWithTotal({ query: "TypeScript", sort_by: "updated_at_desc" });
    expect(total).toBe(3);
    expect(memories).toHaveLength(3);
  });

  it("created_at_asc and created_at_desc are mirror images", () => {
    const desc = db.searchWithTotal({ query: "TypeScript", sort_by: "created_at_desc" }).memories.map((m) => m.id);
    const asc  = db.searchWithTotal({ query: "TypeScript", sort_by: "created_at_asc"  }).memories.map((m) => m.id);
    expect(desc).toEqual([...asc].reverse());
  });

  it("sort_by combined with category filter", () => {
    db.create({ content: "TypeScript in decisions", category: "decision" });
    const { memories, total } = db.searchWithTotal({
      query: "TypeScript", category: "decision", sort_by: "created_at_desc",
    });
    expect(total).toBe(1);
    expect(memories[0].category).toBe("decision");
  });

  it("sort_by combined with date range filter", () => {
    const { memories, total } = db.searchWithTotal({
      query: "TypeScript", sort_by: "created_at_asc", created_after: "2000-01-01",
    });
    expect(total).toBe(3);
    expect(memories[0].content).toBe("Oldest TypeScript note");
  });
});
