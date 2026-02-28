import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("get_related tool (getRelated)", () => {
  let db: MemoryDatabase;
  let idA: string;
  let idB: string;
  let idC: string;
  let idD: string;

  beforeEach(() => {
    db = createTestDb();
    idA = db.create({ content: "Node A", category: "code" }).id;
    idB = db.create({ content: "Node B", category: "decision" }).id;
    idC = db.create({ content: "Node C", category: "general" }).id;
    idD = db.create({ content: "Node D", category: "architecture" }).id;
  });

  afterEach(() => { db.close(); });

  // ─── direction='from' ──────────────────────────────────────────────────────

  describe("direction='from' (outgoing)", () => {
    it("returns all outgoing links for a node", () => {
      db.linkMemories({ from_id: idA, to_id: idB, relation: "caused" });
      db.linkMemories({ from_id: idA, to_id: idC, relation: "references" });
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r).toHaveLength(2);
    });

    it("every result has direction='from'", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.linkMemories({ from_id: idA, to_id: idC });
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r.every(x => x.direction === "from")).toBe(true);
    });

    it("does not include incoming links in direction='from'", () => {
      db.linkMemories({ from_id: idB, to_id: idA, relation: "caused" }); // B → A (incoming for A)
      db.linkMemories({ from_id: idA, to_id: idC, relation: "references" }); // A → C (outgoing)
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r).toHaveLength(1);
      expect(r[0]!.memory.id).toBe(idC);
    });

    it("returns empty array when node has no outgoing links", () => {
      db.linkMemories({ from_id: idB, to_id: idA }); // only incoming for A
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r).toHaveLength(0);
    });
  });

  // ─── direction='to' ────────────────────────────────────────────────────────

  describe("direction='to' (incoming)", () => {
    it("returns all incoming links for a node", () => {
      db.linkMemories({ from_id: idB, to_id: idA, relation: "caused" });
      db.linkMemories({ from_id: idC, to_id: idA, relation: "references" });
      const r = db.getRelated({ id: idA, direction: "to" });
      expect(r).toHaveLength(2);
    });

    it("every result has direction='to'", () => {
      db.linkMemories({ from_id: idB, to_id: idA });
      const r = db.getRelated({ id: idA, direction: "to" });
      expect(r.every(x => x.direction === "to")).toBe(true);
    });

    it("does not include outgoing links in direction='to'", () => {
      db.linkMemories({ from_id: idA, to_id: idC }); // outgoing for A
      db.linkMemories({ from_id: idB, to_id: idA }); // incoming for A
      const r = db.getRelated({ id: idA, direction: "to" });
      expect(r).toHaveLength(1);
      expect(r[0]!.memory.id).toBe(idB);
    });

    it("returns empty array when node has no incoming links", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      const r = db.getRelated({ id: idB, direction: "from" });
      expect(r).toHaveLength(0);
    });
  });

  // ─── direction='both' (default) ───────────────────────────────────────────

  describe("direction='both' (default)", () => {
    it("default direction is 'both'", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.linkMemories({ from_id: idC, to_id: idA });
      const explicit = db.getRelated({ id: idA, direction: "both" });
      const defaultDir = db.getRelated({ id: idA });
      expect(defaultDir).toHaveLength(explicit.length);
    });

    it("combines outgoing and incoming links", () => {
      db.linkMemories({ from_id: idA, to_id: idB, relation: "caused" });    // outgoing
      db.linkMemories({ from_id: idC, to_id: idA, relation: "references" }); // incoming
      const r = db.getRelated({ id: idA });
      expect(r).toHaveLength(2);
      const directions = r.map(x => x.direction);
      expect(directions).toContain("from");
      expect(directions).toContain("to");
    });

    it("returns empty for isolated node (no links at all)", () => {
      const r = db.getRelated({ id: idD });
      expect(r).toHaveLength(0);
    });
  });

  // ─── relation filter ───────────────────────────────────────────────────────

  describe("relation filter", () => {
    beforeEach(() => {
      db.linkMemories({ from_id: idA, to_id: idB, relation: "caused" });
      db.linkMemories({ from_id: idA, to_id: idC, relation: "references" });
      db.linkMemories({ from_id: idA, to_id: idD, relation: "caused" });
    });

    it("filters by relation type and returns only matching links", () => {
      const r = db.getRelated({ id: idA, relation: "caused" });
      expect(r).toHaveLength(2);
      expect(r.every(x => x.relation === "caused")).toBe(true);
    });

    it("filtering by a relation with no matches returns empty array", () => {
      const r = db.getRelated({ id: idA, relation: "supersedes" });
      expect(r).toHaveLength(0);
    });

    it("combining relation filter with direction='from' narrows results", () => {
      db.linkMemories({ from_id: idB, to_id: idA, relation: "caused" }); // incoming caused
      const r = db.getRelated({ id: idA, relation: "caused", direction: "from" });
      // A→B and A→D (outgoing caused only, not B→A)
      expect(r).toHaveLength(2);
      expect(r.every(x => x.direction === "from")).toBe(true);
    });

    it("combining relation filter with direction='to' narrows results", () => {
      db.linkMemories({ from_id: idB, to_id: idA, relation: "caused" }); // incoming caused
      const r = db.getRelated({ id: idA, relation: "caused", direction: "to" });
      expect(r).toHaveLength(1);
      expect(r[0]!.direction).toBe("to");
      expect(r[0]!.memory.id).toBe(idB);
    });
  });

  // ─── result shape ──────────────────────────────────────────────────────────

  describe("result shape", () => {
    it("each result contains a full Memory object", () => {
      db.linkMemories({ from_id: idA, to_id: idB, relation: "caused" });
      const r = db.getRelated({ id: idA, direction: "from" });
      const item = r[0]!;
      expect(item.memory.id).toBe(idB);
      expect(item.memory.content).toBe("Node B");
      expect(item.memory.category).toBe("decision");
      expect(Array.isArray(item.memory.tags)).toBe(true);
      expect(item.memory.created_at).toBeTruthy();
    });

    it("each result contains relation type", () => {
      db.linkMemories({ from_id: idA, to_id: idB, relation: "references" });
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r[0]!.relation).toBe("references");
    });

    it("each result contains linked_at timestamp", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r[0]!.linked_at).toBeTruthy();
      expect(typeof r[0]!.linked_at).toBe("string");
    });
  });

  // ─── graph topology ────────────────────────────────────────────────────────

  describe("graph topology", () => {
    it("chain A→B→C: getRelated on B returns both A (incoming) and C (outgoing)", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.linkMemories({ from_id: idB, to_id: idC });
      const r = db.getRelated({ id: idB });
      expect(r).toHaveLength(2);
    });

    it("star: A links to B, C, D — getRelated A from returns 3", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.linkMemories({ from_id: idA, to_id: idC });
      db.linkMemories({ from_id: idA, to_id: idD });
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r).toHaveLength(3);
    });

    it("after upsert (relation change), result reflects new relation", () => {
      db.linkMemories({ from_id: idA, to_id: idB, relation: "references" });
      db.linkMemories({ from_id: idA, to_id: idB, relation: "supersedes" }); // upsert
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r).toHaveLength(1);
      expect(r[0]!.relation).toBe("supersedes");
    });
  });
});
