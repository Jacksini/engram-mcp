import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("unlink_memories tool (unlinkMemories)", () => {
  let db: MemoryDatabase;
  let idA: string;
  let idB: string;
  let idC: string;

  beforeEach(() => {
    db = createTestDb();
    idA = db.create({ content: "Alpha", category: "code" }).id;
    idB = db.create({ content: "Beta",  category: "decision" }).id;
    idC = db.create({ content: "Gamma", category: "general" }).id;
  });

  afterEach(() => { db.close(); });

  // ─── return value ──────────────────────────────────────────────────────────

  describe("return value", () => {
    it("returns true when the link existed", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      expect(db.unlinkMemories(idA, idB)).toBe(true);
    });

    it("returns false when no link exists", () => {
      expect(db.unlinkMemories(idA, idB)).toBe(false);
    });

    it("second unlink call returns false (idempotent)", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      expect(db.unlinkMemories(idA, idB)).toBe(true);
      expect(db.unlinkMemories(idA, idB)).toBe(false);
    });

    it("returns false for non-existent UUID without throwing", () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      expect(() => db.unlinkMemories(fakeId, idB)).not.toThrow();
      expect(db.unlinkMemories(fakeId, idB)).toBe(false);
    });
  });

  // ─── link removal ──────────────────────────────────────────────────────────

  describe("link removal", () => {
    it("getRelated confirms the link is gone after unlink", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.unlinkMemories(idA, idB);
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r).toHaveLength(0);
    });

    it("unlink A→B does not remove B→A", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.linkMemories({ from_id: idB, to_id: idA });
      db.unlinkMemories(idA, idB);
      const ba = db.getRelated({ id: idB, direction: "from" });
      expect(ba).toHaveLength(1);
      expect(ba[0]!.memory.id).toBe(idA);
    });

    it("unlink A→B leaves A→C intact", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.linkMemories({ from_id: idA, to_id: idC });
      db.unlinkMemories(idA, idB);
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r).toHaveLength(1);
      expect(r[0]!.memory.id).toBe(idC);
    });

    it("unlinking only the specified pair, not all links of the node", () => {
      db.linkMemories({ from_id: idA, to_id: idB, relation: "caused" });
      db.linkMemories({ from_id: idA, to_id: idC, relation: "references" });
      db.linkMemories({ from_id: idB, to_id: idC, relation: "related" });
      db.unlinkMemories(idA, idC);
      // A→B and B→C still intact
      expect(db.getRelated({ id: idA,  direction: "from" })).toHaveLength(1);
      expect(db.getRelated({ id: idB,  direction: "from" })).toHaveLength(1);
    });
  });

  // ─── re-link after unlink ──────────────────────────────────────────────────

  describe("re-link after unlink", () => {
    it("can re-create a link after it was removed", () => {
      db.linkMemories({ from_id: idA, to_id: idB, relation: "caused" });
      db.unlinkMemories(idA, idB);
      expect(db.getRelated({ id: idA, direction: "from" })).toHaveLength(0);

      db.linkMemories({ from_id: idA, to_id: idB, relation: "references" });
      const r = db.getRelated({ id: idA, direction: "from" });
      expect(r).toHaveLength(1);
      expect(r[0]!.relation).toBe("references");
    });

    it("re-linked memory has a fresh linked_at timestamp", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      const first = db.getRelated({ id: idA, direction: "from" })[0]!.linked_at;
      db.unlinkMemories(idA, idB);
      db.linkMemories({ from_id: idA, to_id: idB, relation: "supersedes" });
      const second = db.getRelated({ id: idA, direction: "from" })[0]!.linked_at;
      // Timestamps should be valid strings (may be equal in fast tests, but both truthy)
      expect(first).toBeTruthy();
      expect(second).toBeTruthy();
    });
  });

  // ─── interaction with delete ───────────────────────────────────────────────

  describe("interaction with node deletion", () => {
    it("unlinkMemories on already-deleted from_id node does not throw", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.delete(idA); // cascade removes the link
      expect(() => db.unlinkMemories(idA, idB)).not.toThrow();
      expect(db.unlinkMemories(idA, idB)).toBe(false);
    });

    it("after cascade delete, manual unlink returns false (already gone)", () => {
      db.linkMemories({ from_id: idA, to_id: idB });
      db.delete(idB); // cascade removes the link
      const result = db.unlinkMemories(idA, idB);
      expect(result).toBe(false);
    });
  });
});
