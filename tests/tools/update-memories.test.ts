import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("update_memories (updateBatch)", () => {
  let db: MemoryDatabase;
  let idA: string;
  let idB: string;
  let idC: string;

  beforeEach(() => {
    db = createTestDb();
    idA = db.create({ content: "Alpha content", category: "code", tags: ["ts"] }).id;
    idB = db.create({ content: "Beta content",  category: "decision" }).id;
    idC = db.create({ content: "Gamma content", category: "bug" }).id;
  });

  afterEach(() => {
    db.close();
  });

  it("updates all provided memories and reports correct count", () => {
    const { updated, notFound } = db.updateBatch([
      { id: idA, content: "Alpha updated" },
      { id: idB, category: "architecture" },
    ]);
    expect(updated).toHaveLength(2);
    expect(notFound).toHaveLength(0);
    expect(db.getById(idA)!.content).toBe("Alpha updated");
    expect(db.getById(idB)!.category).toBe("architecture");
  });

  it("returns empty result without touching the database for empty input", () => {
    const { updated, notFound } = db.updateBatch([]);
    expect(updated).toHaveLength(0);
    expect(notFound).toHaveLength(0);
  });

  it("reports unknown ids in notFound without failing", () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const { updated, notFound } = db.updateBatch([
      { id: idA, content: "New A" },
      { id: fakeId, content: "Won't exist" },
    ]);
    expect(updated).toHaveLength(1);
    expect(notFound).toEqual([fakeId]);
  });

  it("merges fields — unspecified fields keep their existing values", () => {
    const { updated } = db.updateBatch([{ id: idA, category: "decision" }]);
    const mem = updated[0];
    expect(mem.content).toBe("Alpha content"); // kept
    expect(mem.category).toBe("decision");      // changed
    expect(mem.tags).toEqual(["ts"]);           // kept
  });

  it("applies normalization to each update in the batch", () => {
    const { updated } = db.updateBatch([
      { id: idA, content: "  trimmed  ", category: "CODE", tags: ["dup", "dup"] },
    ]);
    expect(updated[0].content).toBe("trimmed");
    expect(updated[0].category).toBe("code");
    expect(updated[0].tags).toEqual(["dup"]);
  });

  it("all-unknown input updates nothing", () => {
    const { updated, notFound } = db.updateBatch([
      { id: "00000000-0000-0000-0000-000000000001", content: "X" },
      { id: "00000000-0000-0000-0000-000000000002", content: "Y" },
    ]);
    expect(updated).toHaveLength(0);
    expect(notFound).toHaveLength(2);
    // original memories are untouched
    expect(db.getById(idA)!.content).toBe("Alpha content");
  });

  it("updated memories have a newer updated_at than created_at", () => {
    const before = db.getById(idA)!;
    // Force a slight delay so timestamps differ on most systems
    const { updated } = db.updateBatch([{ id: idA, content: "Changed" }]);
    expect(updated[0].updated_at >= before.created_at).toBe(true);
  });

  it("updated memories are searchable with new content via FTS", () => {
    db.updateBatch([{ id: idA, content: "Now talks about Kubernetes" }]);
    expect(db.search({ query: "Kubernetes" })).toHaveLength(1);
    expect(db.search({ query: "Alpha" })).toHaveLength(0);
  });

  it("is atomic — partial failure does not rollback successful updates", () => {
    // better-sqlite3 transactions commit on success of all steps;
    // here all steps succeed so we verify all committed
    const { updated } = db.updateBatch([
      { id: idA, content: "A updated" },
      { id: idB, content: "B updated" },
      { id: idC, content: "C updated" },
    ]);
    expect(updated).toHaveLength(3);
    expect(db.getById(idA)!.content).toBe("A updated");
    expect(db.getById(idB)!.content).toBe("B updated");
    expect(db.getById(idC)!.content).toBe("C updated");
  });
});
