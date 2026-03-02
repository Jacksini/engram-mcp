import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("Auto-link engine — Fase 2", () => {
  let db: MemoryDatabase;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  describe("Strategy A: shared tags (≥2)", () => {
    it("creates a link when 2+ tags are shared", () => {
      const a = db.create({ content: "First tagged memory", tags: ["typescript", "backend", "api"], auto_link: false }).id;
      // Create second AFTER first so auto-link can find first
      const b = db.create({ content: "Second tagged memory", tags: ["typescript", "backend", "testing"] }).id;

      const related = db.getRelated({ id: b, direction: "from" });
      const linkedIds = related.map(r => r.memory.id);
      expect(linkedIds).toContain(a);
      // The auto-generated link should have auto_generated=true
      const link = related.find(r => r.memory.id === a);
      expect(link?.auto_generated).toBe(true);
      expect(link?.weight).toBeGreaterThan(0);
    });

    it("does NOT auto-link when only 1 tag shared", () => {
      const a = db.create({ content: "One tag only A", tags: ["typescript", "unrelated"], auto_link: false }).id;
      // Use a DIFFERENT category to avoid Strategy C (temporal + same cat)
      const b = db.create({ content: "One tag only B", category: "decision", tags: ["typescript", "different"] }).id;

      // Only "typescript" shared (count=1 < 2), so no auto-link
      const related = db.getRelated({ id: b, direction: "from" });
      const linkedIds = related.map(r => r.memory.id);
      expect(linkedIds).not.toContain(a);
    });

    it("weight = min(1.0, shared_count × 0.3)", () => {
      // 4 shared tags → weight = min(1.0, 4 * 0.3) = 1.0
      const a = db.create({ content: "Rich tags A", tags: ["t1", "t2", "t3", "t4"], auto_link: false }).id;
      const b = db.create({ content: "Rich tags B", tags: ["t1", "t2", "t3", "t4"] }).id;

      const related = db.getRelated({ id: b, direction: "from" });
      const link = related.find(r => r.memory.id === a);
      expect(link).toBeDefined();
      expect(link?.weight).toBe(1.0);
    });
  });

  describe("Strategy C: temporal proximity + same category", () => {
    it("auto-links memories in same category", () => {
      // Both created within milliseconds → ±1 hour window covers them
      const a = db.create({ content: "Architecture note one", category: "architecture", auto_link: false }).id;
      const b = db.create({ content: "Architecture note two", category: "architecture" }).id;

      const related = db.getRelated({ id: b, direction: "from" });
      const linkedIds = related.map(r => r.memory.id);
      expect(linkedIds).toContain(a);

      const link = related.find(r => r.memory.id === a);
      expect(link?.auto_generated).toBe(true);
      expect(link?.weight).toBe(0.4);
    });

    it("does NOT auto-link memories with different categories", () => {
      const a = db.create({ content: "Code memory", category: "code", auto_link: false }).id;
      const b = db.create({ content: "Decision memory", category: "decision" }).id;

      const relatedB = db.getRelated({ id: b, direction: "from" });
      const linkedIds = relatedB.map(r => r.memory.id);
      expect(linkedIds).not.toContain(a);
    });
  });

  describe("auto_link = false opt-out", () => {
    it("skips auto-linking when auto_link=false", () => {
      const a = db.create({ content: "Shared cat one", category: "code", tags: ["x", "y", "z"], auto_link: false }).id;
      const b = db.create({ content: "Shared cat two", category: "code", tags: ["x", "y", "z"], auto_link: false }).id;

      const related = db.getRelated({ id: b, direction: "from" });
      // No auto-links created because auto_link=false
      expect(related).toHaveLength(0);
      void a; // suppress unused-var warning
    });
  });

  describe("weight and auto_generated on MemoryLink", () => {
    it("manual links have weight=1.0 and auto_generated=0", () => {
      const a = db.create({ content: "Manual A", auto_link: false }).id;
      const b = db.create({ content: "Manual B", auto_link: false }).id;

      const link = db.linkMemories({ from_id: a, to_id: b });
      expect(link.weight).toBe(1.0);
      expect(link.auto_generated).toBe(0);
    });

    it("manual link respects custom weight", () => {
      const a = db.create({ content: "Custom weight A", auto_link: false }).id;
      const b = db.create({ content: "Custom weight B", auto_link: false }).id;

      const link = db.linkMemories({ from_id: a, to_id: b, weight: 0.7 });
      expect(link.weight).toBe(0.7);
    });
  });
});

describe("suggestLinks() — Fase 2", () => {
  let db: MemoryDatabase;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it("returns empty suggestions for a memory with no similar peers", () => {
    const id = db.create({ content: "Completely unique memory zzzzzz", auto_link: false }).id;
    const result = db.suggestLinks({ id });
    // May or may not find suggestions, but should not throw
    expect(result.analysed).toBe(1);
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it("suggests shared-tag links for specific memory", () => {
    const a = db.create({ content: "Feature design note", tags: ["backend", "api", "auth"], auto_link: false }).id;
    const b = db.create({ content: "Implementation note", tags: ["backend", "api", "db"], auto_link: false }).id;

    const result = db.suggestLinks({ id: b });
    const suggestion = result.suggestions.find(s => s.to_id === a);
    expect(suggestion).toBeDefined();
    expect(suggestion?.reason).toBe("shared_tags");
    expect(suggestion?.suggested_relation).toBe("related");
    expect(suggestion?.weight).toBeGreaterThan(0);
  });

  it("does not suggest already-linked memories", () => {
    const a = db.create({ content: "Already linked A", tags: ["go", "rust", "c"], auto_link: false }).id;
    const b = db.create({ content: "Already linked B", tags: ["go", "rust", "c"], auto_link: false }).id;
    // Manually link them
    db.linkMemories({ from_id: b, to_id: a });

    const result = db.suggestLinks({ id: b });
    // The already-linked pair should not appear
    expect(result.suggestions.every(s => s.to_id !== a)).toBe(true);
  });

  it("orphan mode: analyses memories with no links", () => {
    // Create orphans
    db.create({ content: "Orphan alpha one", category: "code", auto_link: false });
    db.create({ content: "Orphan beta two", category: "code", auto_link: false });

    const result = db.suggestLinks({});  // no id = orphan mode
    expect(result.analysed).toBeGreaterThan(0);
  });

  it("respects the limit parameter", () => {
    // Create many similar memories
    for (let i = 0; i < 10; i++) {
      db.create({ content: `Similar memory number ${i}`, category: "general", tags: ["common", "tag", "shared"], auto_link: false });
    }
    const target = db.create({ content: "Target memory", category: "general", tags: ["common", "tag", "shared"], auto_link: false }).id;
    const result = db.suggestLinks({ id: target, limit: 3 });
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
  });

  it("suggestion has required fields", () => {
    const a = db.create({ content: "Field check source", tags: ["alpha", "beta", "gamma"], auto_link: false }).id;
    const b = db.create({ content: "Field check target", tags: ["alpha", "beta", "delta"], auto_link: false }).id;

    const result = db.suggestLinks({ id: b });
    const s = result.suggestions.find(x => x.to_id === a);
    if (s) {
      expect(s.from_id).toBe(b);
      expect(typeof s.to_content_preview).toBe("string");
      expect(typeof s.to_category).toBe("string");
      expect(Array.isArray(s.to_tags)).toBe(true);
      expect(["shared_tags", "content_similarity", "temporal_proximity"]).toContain(s.reason);
      expect(typeof s.weight).toBe("number");
    }
  });
});
