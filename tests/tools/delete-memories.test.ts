import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("delete_memories (deleteBatch)", () => {
  let db: MemoryDatabase;
  let idA: string;
  let idB: string;
  let idC: string;

  beforeEach(() => {
    db = createTestDb();
    idA = db.create({ content: "Alpha", category: "code" }).id;
    idB = db.create({ content: "Beta",  category: "code" }).id;
    idC = db.create({ content: "Gamma", category: "decision" }).id;
  });

  afterEach(() => {
    db.close();
  });

  it("deletes all provided ids and reports correct count", () => {
    const result = db.deleteBatch([idA, idB]);
    expect(result.deleted).toBe(2);
    expect(result.notFound).toHaveLength(0);
    expect(db.count()).toBe(1);
  });

  it("returns empty result without touching the database for empty input", () => {
    const result = db.deleteBatch([]);
    expect(result.deleted).toBe(0);
    expect(result.notFound).toHaveLength(0);
    expect(db.count()).toBe(3);
  });

  it("reports unknown ids in notFound without failing", () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const result = db.deleteBatch([idA, fakeId]);
    expect(result.deleted).toBe(1);
    expect(result.notFound).toEqual([fakeId]);
    expect(db.count()).toBe(2);
  });

  it("deletes a single id correctly", () => {
    const result = db.deleteBatch([idC]);
    expect(result.deleted).toBe(1);
    expect(result.notFound).toHaveLength(0);
    expect(db.getById(idC)).toBeNull();
  });

  it("all-unknown input deletes nothing", () => {
    const result = db.deleteBatch([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    ]);
    expect(result.deleted).toBe(0);
    expect(result.notFound).toHaveLength(2);
    expect(db.count()).toBe(3);
  });

  it("deleted memories are no longer retrievable by id", () => {
    db.deleteBatch([idA, idB, idC]);
    expect(db.getById(idA)).toBeNull();
    expect(db.getById(idB)).toBeNull();
    expect(db.getById(idC)).toBeNull();
  });

  it("is atomic — on success all deletes commit together", () => {
    const before = db.count();
    db.deleteBatch([idA, idB]);
    // both must be gone, not just one
    expect(db.count()).toBe(before - 2);
    expect(db.getById(idA)).toBeNull();
    expect(db.getById(idB)).toBeNull();
  });
});
