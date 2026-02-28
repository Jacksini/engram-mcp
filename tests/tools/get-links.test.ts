import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("get_links tool (listLinks)", () => {
  let db: MemoryDatabase;
  let idA: string;
  let idB: string;
  let idC: string;
  let idD: string;

  beforeEach(() => {
    db = createTestDb();
    idA = db.create({ content: "A", category: "code" }).id;
    idB = db.create({ content: "B", category: "decision" }).id;
    idC = db.create({ content: "C", category: "general" }).id;
    idD = db.create({ content: "D", category: "architecture" }).id;
    // Build a small graph: A→B (caused), A→C (references), B→C (supersedes), D→A (related)
    db.linkMemories({ from_id: idA, to_id: idB, relation: "caused" });
    db.linkMemories({ from_id: idA, to_id: idC, relation: "references" });
    db.linkMemories({ from_id: idB, to_id: idC, relation: "supersedes" });
    db.linkMemories({ from_id: idD, to_id: idA, relation: "related" });
  });

  afterEach(() => { db.close(); });

  // ─── no filters (list all) ─────────────────────────────────────────────────

  describe("no filters", () => {
    it("returns all links in the graph", () => {
      const result = db.listLinks({});
      expect(result.total).toBe(4);
      expect(result.links).toHaveLength(4);
    });

    it("result shape includes total, offset, limit, links", () => {
      const result = db.listLinks({});
      expect(typeof result.total).toBe("number");
      expect(typeof result.offset).toBe("number");
      expect(typeof result.limit).toBe("number");
      expect(Array.isArray(result.links)).toBe(true);
    });

    it("each link has from_id, to_id, relation, created_at", () => {
      const result = db.listLinks({});
      for (const link of result.links) {
        expect(typeof link.from_id).toBe("string");
        expect(typeof link.to_id).toBe("string");
        expect(typeof link.relation).toBe("string");
        expect(typeof link.created_at).toBe("string");
      }
    });

    it("returns empty when no links exist", () => {
      // Delete all links by removing memories (cascade)
      const freshDb = createTestDb();
      const result = freshDb.listLinks({});
      expect(result.total).toBe(0);
      expect(result.links).toHaveLength(0);
      freshDb.close();
    });
  });

  // ─── filter by from_id ─────────────────────────────────────────────────────

  describe("filter by from_id", () => {
    it("returns only links originating from the specified node", () => {
      const result = db.listLinks({ from_id: idA });
      expect(result.total).toBe(2);
      expect(result.links.every(l => l.from_id === idA)).toBe(true);
    });

    it("returns 0 when from_id has no outgoing links", () => {
      const result = db.listLinks({ from_id: idC }); // C has no outgoing links
      expect(result.total).toBe(0);
    });

    it("total reflects filter, not full table count", () => {
      const all = db.listLinks({});
      const filtered = db.listLinks({ from_id: idA });
      expect(filtered.total).toBeLessThan(all.total);
    });
  });

  // ─── filter by to_id ───────────────────────────────────────────────────────

  describe("filter by to_id", () => {
    it("returns only links pointing to the specified node", () => {
      const result = db.listLinks({ to_id: idC });
      expect(result.total).toBe(2); // A→C and B→C
      expect(result.links.every(l => l.to_id === idC)).toBe(true);
    });

    it("returns 0 when to_id has no incoming links", () => {
      const result = db.listLinks({ to_id: idD }); // D has no incoming links
      expect(result.total).toBe(0);
    });
  });

  // ─── filter by relation ────────────────────────────────────────────────────

  describe("filter by relation", () => {
    it("returns only links with the specified relation", () => {
      const result = db.listLinks({ relation: "caused" });
      expect(result.total).toBe(1);
      expect(result.links[0]!.relation).toBe("caused");
      expect(result.links[0]!.from_id).toBe(idA);
      expect(result.links[0]!.to_id).toBe(idB);
    });

    it("returns 0 when no link has that relation", () => {
      const result = db.listLinks({ relation: "supersedes", from_id: idA });
      expect(result.total).toBe(0);
    });

    it("combining from_id + relation narrows results correctly", () => {
      const result = db.listLinks({ from_id: idA, relation: "references" });
      expect(result.total).toBe(1);
      expect(result.links[0]!.to_id).toBe(idC);
    });
  });

  // ─── pagination ────────────────────────────────────────────────────────────

  describe("pagination", () => {
    it("limit restricts the number of returned links", () => {
      const result = db.listLinks({ limit: 2 });
      expect(result.links).toHaveLength(2);
      expect(result.total).toBe(4); // total still shows full count
    });

    it("offset skips the first N links", () => {
      const all = db.listLinks({});
      const paged = db.listLinks({ offset: 2 });
      expect(paged.links).toHaveLength(all.total - 2);
    });

    it("limit + offset together paginate correctly", () => {
      const page1 = db.listLinks({ limit: 2, offset: 0 });
      const page2 = db.listLinks({ limit: 2, offset: 2 });
      expect(page1.links).toHaveLength(2);
      expect(page2.links).toHaveLength(2);
      // No overlap in IDs
      const ids1 = page1.links.map(l => `${l.from_id}→${l.to_id}`);
      const ids2 = page2.links.map(l => `${l.from_id}→${l.to_id}`);
      expect(ids1.some(id => ids2.includes(id))).toBe(false);
    });

    it("offset beyond total returns empty links but correct total", () => {
      const result = db.listLinks({ offset: 100 });
      expect(result.links).toHaveLength(0);
      expect(result.total).toBe(4);
    });

    it("default limit is 50", () => {
      const result = db.listLinks({});
      expect(result.limit).toBe(50);
    });

    it("reflects provided offset in result", () => {
      const result = db.listLinks({ offset: 2 });
      expect(result.offset).toBe(2);
    });
  });

  // ─── combined filters ──────────────────────────────────────────────────────

  describe("combined filters", () => {
    it("from_id + to_id returns exactly that edge or empty", () => {
      const result = db.listLinks({ from_id: idA, to_id: idB });
      expect(result.total).toBe(1);
      expect(result.links[0]!.relation).toBe("caused");
    });

    it("from_id + to_id that don't share a link returns 0", () => {
      const result = db.listLinks({ from_id: idB, to_id: idD });
      expect(result.total).toBe(0);
    });
  });
});
