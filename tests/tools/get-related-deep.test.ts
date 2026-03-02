import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("getRelatedDeep() — Fase 2 Multi-hop Traversal", () => {
  let db: MemoryDatabase;
  // Chain: A → B → C → D  (depth 1, 2, 3 from A)
  let idA: string;
  let idB: string;
  let idC: string;
  let idD: string;
  // Separate branch: A → E
  let idE: string;

  beforeEach(() => {
    db = createTestDb();
    idA = db.create({ content: "Alpha root", category: "code", auto_link: false }).id;
    idB = db.create({ content: "Beta second", category: "decision", auto_link: false }).id;
    idC = db.create({ content: "Gamma third", category: "bug", auto_link: false }).id;
    idD = db.create({ content: "Delta fourth", category: "general", auto_link: false }).id;
    idE = db.create({ content: "Epsilon branch", category: "code", auto_link: false }).id;

    // Build A → B → C → D chain
    db.linkMemories({ from_id: idA, to_id: idB, relation: "caused" });
    db.linkMemories({ from_id: idB, to_id: idC, relation: "references" });
    db.linkMemories({ from_id: idC, to_id: idD, relation: "related" });
    // Branch: A → E
    db.linkMemories({ from_id: idA, to_id: idE, relation: "related" });
  });

  afterEach(() => { db.close(); });

  it("depth=1 returns only direct links", () => {
    const result = db.getRelatedDeep({ id: idA, max_depth: 1 });
    const ids = result.results.map(r => r.memory.id);
    expect(ids).toContain(idB);
    expect(ids).toContain(idE);
    expect(ids).not.toContain(idC);
    expect(ids).not.toContain(idD);
    expect(result.results.every(r => r.depth === 1)).toBe(true);
  });

  it("depth=2 reaches B and C (and E)", () => {
    const result = db.getRelatedDeep({ id: idA, max_depth: 2 });
    const ids = result.results.map(r => r.memory.id);
    expect(ids).toContain(idB);
    expect(ids).toContain(idC);
    expect(ids).toContain(idE);
    expect(ids).not.toContain(idD);
  });

  it("depth=3 reaches the full chain", () => {
    const result = db.getRelatedDeep({ id: idA, max_depth: 3 });
    const ids = result.results.map(r => r.memory.id);
    expect(ids).toContain(idB);
    expect(ids).toContain(idC);
    expect(ids).toContain(idD);
    expect(ids).toContain(idE);
  });

  it("returns correct depth values", () => {
    const result = db.getRelatedDeep({ id: idA, max_depth: 3 });
    const b = result.results.find(r => r.memory.id === idB);
    const c = result.results.find(r => r.memory.id === idC);
    const d = result.results.find(r => r.memory.id === idD);
    expect(b?.depth).toBe(1);
    expect(c?.depth).toBe(2);
    expect(d?.depth).toBe(3);
  });

  it("relation filter limits traversal", () => {
    const result = db.getRelatedDeep({ id: idA, max_depth: 3, relation: "caused" });
    const ids = result.results.map(r => r.memory.id);
    // Only A→B has relation "caused"; B→C is "references"
    expect(ids).toContain(idB);
    expect(ids).not.toContain(idC);
    expect(ids).not.toContain(idD);
  });

  it("does not include the start memory itself", () => {
    const result = db.getRelatedDeep({ id: idA, max_depth: 3 });
    expect(result.results.map(r => r.memory.id)).not.toContain(idA);
  });

  it("prevents infinite cycles", () => {
    // Create a cycle: D → A
    db.linkMemories({ from_id: idD, to_id: idA, relation: "related" });
    // Should not loop forever
    const result = db.getRelatedDeep({ id: idA, max_depth: 5 });
    expect(result.total).toBeGreaterThan(0);
    // A should not appear in the results (it's the start node, cycle blocked by path check)
    expect(result.results.map(r => r.memory.id)).not.toContain(idA);
  });

  it("returns empty results for a memory with no links", () => {
    const isolated = db.create({ content: "Isolated", auto_link: false }).id;
    const result = db.getRelatedDeep({ id: isolated, max_depth: 3 });
    expect(result.total).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it("result contains weight and auto_generated flags", () => {
    const result = db.getRelatedDeep({ id: idA, max_depth: 1 });
    for (const r of result.results) {
      expect(typeof r.weight).toBe("number");
      expect(typeof r.auto_generated).toBe("boolean");
    }
  });

  it("respects the limit parameter", () => {
    const result = db.getRelatedDeep({ id: idA, max_depth: 5, limit: 2 });
    expect(result.results.length).toBeLessThanOrEqual(2);
  });
});
