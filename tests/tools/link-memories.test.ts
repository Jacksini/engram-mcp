import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("Relations (Ronda 25)", () => {
  let db: MemoryDatabase;
  let idA: string;
  let idB: string;
  let idC: string;

  beforeEach(() => {
    db = createTestDb();
    idA = db.create({ content: "Memory A", category: "code", auto_link: false }).id;
    idB = db.create({ content: "Memory B", category: "decision", auto_link: false }).id;
    idC = db.create({ content: "Memory C", category: "general", auto_link: false }).id;
  });

  afterEach(() => { db.close(); });

  // ─── linkMemories ──────────────────────────────────────────────────────────

  describe("linkMemories()", () => {
    it("creates a link and returns a MemoryLink", () => {
      const link = db.linkMemories({ from_id: idA, to_id: idB });
      expect(link.from_id).toBe(idA);
      expect(link.to_id).toBe(idB);
      expect(link.relation).toBe("related");
      expect(link.created_at).toBeTruthy();
    });

    it("defaults relation to 'related'", () => {
      const link = db.linkMemories({ from_id: idA, to_id: idB });
      expect(link.relation).toBe("related");
    });

    it("stores the provided relation type", () => {
      const link = db.linkMemories({ from_id: idA, to_id: idB, relation: "caused" });
      expect(link.relation).toBe("caused");
    });

    it.each(["caused", "references", "supersedes", "related"] as const)(
      "accepts relation type '%s'",
      (rel) => {
        // Use A→C and A→B to avoid PK conflicts across iterations
        const link = db.linkMemories({ from_id: idA, to_id: idB, relation: rel });
        expect(link.relation).toBe(rel);
      }
    );

    it("upserts: updating relation for an existing (from_id, to_id) pair", () => {
      db.linkMemories({ from_id: idA, to_id: idB, relation: "references" });
      const updated = db.linkMemories({ from_id: idA, to_id: idB, relation: "supersedes" });
      expect(updated.relation).toBe("supersedes");
    });

    it("allows A→B and B→A as independent links", () => {
      const ab = db.linkMemories({ from_id: idA, to_id: idB, relation: "caused" });
      const ba = db.linkMemories({ from_id: idB, to_id: idA, relation: "references" });
      expect(ab.relation).toBe("caused");
      expect(ba.relation).toBe("references");
    });
  });

  // ─── unlinkMemories ────────────────────────────────────────────────────────

  describe("unlinkMemories()", () => {
    it("returns true when the link existed", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      expect(db.unlinkMemories(idA, idB)).toBe(true);
    });

    it("returns false when the link did not exist", () => {
      expect(db.unlinkMemories(idA, idB)).toBe(false);
    });

    it("link is gone after unlinkMemories", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.unlinkMemories(idA, idB);
      const related = db.getRelated({ id: idA, direction: "from" });
      expect(related).toHaveLength(0);
    });

    it("does not remove the reverse link", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.linkMemories({ from_id: idB, to_id: idA });
      db.unlinkMemories(idA, idB);
      const related = db.getRelated({ id: idB, direction: "from" });
      expect(related).toHaveLength(1);
    });
  });

  // ─── getRelated ────────────────────────────────────────────────────────────

  describe("getRelated()", () => {
    beforeEach(() => {
      db.linkMemories({ from_id: idA, to_id: idB, relation: "caused"     });
      db.linkMemories({ from_id: idA, to_id: idC, relation: "references" });
      db.linkMemories({ from_id: idB, to_id: idA, relation: "supersedes" });
    });

    it("direction='from' returns outgoing links", () => {
      const r = db.getRelated({ id: idA, direction: "from" });
      // A → B and A → C
      expect(r).toHaveLength(2);
      expect(r.every(x => x.direction === "from")).toBe(true);
    });

    it("direction='to' returns incoming links", () => {
      const r = db.getRelated({ id: idA, direction: "to" });
      // B → A
      expect(r).toHaveLength(1);
      expect(r[0]!.direction).toBe("to");
      expect(r[0]!.memory.id).toBe(idB);
    });

    it("direction='both' (default) returns all linked memories", () => {
      const r = db.getRelated({ id: idA });
      expect(r).toHaveLength(3);
    });

    it("filter by relation type", () => {
      const r = db.getRelated({ id: idA, relation: "caused" });
      expect(r).toHaveLength(1);
      expect(r[0]!.relation).toBe("caused");
      expect(r[0]!.memory.id).toBe(idB);
    });

    it("returns full Memory objects", () => {
      const r = db.getRelated({ id: idA, direction: "from" });
      const memB = r.find(x => x.memory.id === idB);
      expect(memB).toBeDefined();
      expect(memB!.memory.content).toBe("Memory B");
      expect(Array.isArray(memB!.memory.tags)).toBe(true);
    });

    it("includes linked_at timestamp", () => {
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r[0]!.linked_at).toBeTruthy();
    });

    it("returns empty array when no links exist", () => {
      const _r = db.getRelated({ id: idC });
      // idC has no outgoing links and only A→C which is direction 'to' for idC
      const outgoing = db.getRelated({ id: idC, direction: "from" });
      expect(outgoing).toHaveLength(0);
    });

    it("relation filter with no matches returns empty array", () => {
      // No link of type "supersedes" originates FROM idA
      const r = db.getRelated({ id: idA, relation: "supersedes", direction: "from" });
      expect(r).toHaveLength(0);
    });
  });

  // ─── Cascade delete ────────────────────────────────────────────────────────

  describe("cascade delete", () => {
    it("deleting from_id memory removes the link", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.delete(idA);
      const r = db.getRelated({ id: idB, direction: "to" });
      expect(r).toHaveLength(0);
    });

    it("deleting to_id memory removes the link", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.delete(idB);
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r).toHaveLength(0);
    });

    it("only removes links involving the deleted memory", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.linkMemories({ from_id: idA, to_id: idC });
      db.delete(idB);
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r).toHaveLength(1);
      expect(r[0]!.memory.id).toBe(idC);
    });
  });
});
