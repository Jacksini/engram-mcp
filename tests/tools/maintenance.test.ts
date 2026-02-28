import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("db_maintenance (maintenance)", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("reports integrity_ok=true on a fresh database", () => {
    const result = db.maintenance();
    expect(result.integrity_ok).toBe(true);
  });

  it("returns empty integrity_errors array when database is healthy", () => {
    const result = db.maintenance();
    expect(result.integrity_errors).toEqual([]);
  });

  it("returns wal_checkpoint object with numeric busy, log, checkpointed fields", () => {
    const result = db.maintenance();
    expect(result.wal_checkpoint).toHaveProperty("busy");
    expect(result.wal_checkpoint).toHaveProperty("log");
    expect(result.wal_checkpoint).toHaveProperty("checkpointed");
    expect(typeof result.wal_checkpoint.busy).toBe("number");
    expect(typeof result.wal_checkpoint.log).toBe("number");
    expect(typeof result.wal_checkpoint.checkpointed).toBe("number");
  });

  it("defaults to PASSIVE checkpoint mode (no extra argument needed)", () => {
    // Should not throw with no arguments
    expect(() => db.maintenance()).not.toThrow();
  });

  it("accepts PASSIVE checkpoint mode explicitly", () => {
    const result = db.maintenance("PASSIVE");
    expect(result.integrity_ok).toBe(true);
  });

  it("accepts FULL checkpoint mode", () => {
    const result = db.maintenance("FULL");
    expect(result.integrity_ok).toBe(true);
    expect(result.wal_checkpoint).toHaveProperty("busy");
  });

  it("accepts RESTART checkpoint mode", () => {
    const result = db.maintenance("RESTART");
    expect(result.integrity_ok).toBe(true);
  });

  it("accepts TRUNCATE checkpoint mode", () => {
    const result = db.maintenance("TRUNCATE");
    expect(result.integrity_ok).toBe(true);
  });

  it("returns consistent results when called multiple times", () => {
    const first = db.maintenance();
    const second = db.maintenance();
    expect(first.integrity_ok).toBe(second.integrity_ok);
    expect(first.integrity_errors).toEqual(second.integrity_errors);
  });

  it("integrity check still passes after writing data", () => {
    db.create({ content: "Test memory", category: "general", tags: ["test"] });
    db.create({ content: "Another memory", category: "code" });
    const result = db.maintenance();
    expect(result.integrity_ok).toBe(true);
    expect(result.integrity_errors).toEqual([]);
  });
});
