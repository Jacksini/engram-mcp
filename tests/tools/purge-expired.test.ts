import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

// Helper: ISO datetime clearly in the past
const PAST = "2000-01-01T00:00:00Z";
// Helper: ISO datetime clearly in the future
const FUTURE = "2099-12-31T23:59:59Z";

describe("TTL / expires_at behavior", () => {
  let db: MemoryDatabase;

  afterEach(() => { db.close(); });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe("create() with expires_at", () => {
    beforeEach(() => { db = createTestDb(); });

    it("stores expires_at when provided", () => {
      const m = db.create({ content: "Expiring", category: "general", expires_at: FUTURE });
      expect(m.expires_at).toBe(FUTURE);
    });

    it("stores null expires_at by default", () => {
      const m = db.create({ content: "No expiry", category: "general" });
      expect(m.expires_at).toBeNull();
    });

    it("stores null when expires_at is explicitly null", () => {
      const m = db.create({ content: "Explicit null", category: "general", expires_at: null });
      expect(m.expires_at).toBeNull();
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe("update() with expires_at", () => {
    beforeEach(() => { db = createTestDb(); });

    it("sets expires_at on a memory that had none", () => {
      const m = db.create({ content: "No expiry", category: "general" });
      const updated = db.update(m.id, { expires_at: FUTURE });
      expect(updated!.expires_at).toBe(FUTURE);
    });

    it("clears expires_at when updated with null", () => {
      const m = db.create({ content: "Will expire", category: "general", expires_at: FUTURE });
      const updated = db.update(m.id, { expires_at: null });
      expect(updated!.expires_at).toBeNull();
    });

    it("keeps existing expires_at when expires_at not provided in update", () => {
      const m = db.create({ content: "Will expire", category: "general", expires_at: FUTURE });
      const updated = db.update(m.id, { content: "Updated content" });
      expect(updated!.expires_at).toBe(FUTURE);
    });
  });

  // ─── list / search filtering ───────────────────────────────────────────────

  describe("list filtering — expired memories excluded", () => {
    let aliveId: string;
    let expiredId: string;
    let noExpiryId: string;

    beforeEach(() => {
      db = createTestDb();
      aliveId    = db.create({ content: "Future",   category: "general", expires_at: FUTURE }).id;
      expiredId  = db.create({ content: "Past",     category: "general", expires_at: PAST   }).id;
      noExpiryId = db.create({ content: "No expiry",category: "general"                     }).id;
    });

    it("list() includes non-expired and null-expiry memories", () => {
      const result = db.list({});
      const ids = result.map(m => m.id);
      expect(ids).toContain(aliveId);
      expect(ids).toContain(noExpiryId);
    });

    it("list() excludes expired memories", () => {
      const result = db.list({});
      const ids = result.map(m => m.id);
      expect(ids).not.toContain(expiredId);
    });

    it("count() excludes expired memories", () => {
      expect(db.count()).toBe(2);
    });

    it("search() excludes expired memories", () => {
      const result = db.search({ query: "Past" });
      const ids = result.map(m => m.id);
      expect(ids).not.toContain(expiredId);
    });

    it("search() includes future-expiry memories", () => {
      const result = db.search({ query: "Future" });
      const ids = result.map(m => m.id);
      expect(ids).toContain(aliveId);
    });
  });

  // ─── get_context_snapshot filtering ────────────────────────────────────────

  describe("getContextSnapshot() excludes expired memories", () => {
    beforeEach(() => {
      db = createTestDb();
      db.create({ content: "Alive",   category: "general", tags: ["keep"], expires_at: FUTURE });
      db.create({ content: "Expired", category: "code",    tags: ["gone"], expires_at: PAST   });
    });

    it("total reflects only non-expired count", () => {
      const snap = db.getContextSnapshot();
      expect(snap.total).toBe(1);
    });

    it("expired tag does not appear in tags_index", () => {
      const snap = db.getContextSnapshot();
      const tags = Object.keys(snap.tags_index as Record<string, number>);
      expect(tags).not.toContain("gone");
    });
  });

  // ─── purgeExpired() ────────────────────────────────────────────────────────

  describe("purgeExpired()", () => {
    beforeEach(() => {
      db = createTestDb();
    });

    it("returns {purged:0, ids:[]} when nothing has expired", () => {
      db.create({ content: "Alive", category: "general", expires_at: FUTURE });
      db.create({ content: "No expiry", category: "general" });
      const result = db.purgeExpired();
      expect(result.purged).toBe(0);
      expect(result.ids).toHaveLength(0);
    });

    it("returns the correct count of purged rows", () => {
      db.create({ content: "Expired A", category: "general", expires_at: PAST });
      db.create({ content: "Expired B", category: "general", expires_at: PAST });
      db.create({ content: "Alive",     category: "general", expires_at: FUTURE });
      const result = db.purgeExpired();
      expect(result.purged).toBe(2);
    });

    it("returns the IDs of purged rows", () => {
      const mA = db.create({ content: "Expired A", category: "general", expires_at: PAST });
      const mB = db.create({ content: "Expired B", category: "general", expires_at: PAST });
      const result = db.purgeExpired();
      expect(result.ids).toContain(mA.id);
      expect(result.ids).toContain(mB.id);
    });

    it("physically removes expired rows from the DB", () => {
      const m = db.create({ content: "Expired", category: "general", expires_at: PAST });
      db.purgeExpired();
      expect(db.getById(m.id)).toBeNull();
    });

    it("does not remove non-expired or null-expiry rows", () => {
      const mAlive = db.create({ content: "Alive",     category: "general", expires_at: FUTURE });
      const mNone  = db.create({ content: "No expiry", category: "general"                     });
      db.create({ content: "Expired", category: "general", expires_at: PAST });
      db.purgeExpired();
      expect(db.getById(mAlive.id)).not.toBeNull();
      expect(db.getById(mNone.id)).not.toBeNull();
    });

    it("count() drops to zero after purging all expired", () => {
      db.create({ content: "Exp A", category: "general", expires_at: PAST });
      db.create({ content: "Exp B", category: "general", expires_at: PAST });
      db.purgeExpired();
      expect(db.count()).toBe(0);
    });

    it("is idempotent — second call returns {purged:0}", () => {
      db.create({ content: "Expired", category: "general", expires_at: PAST });
      db.purgeExpired();
      const second = db.purgeExpired();
      expect(second.purged).toBe(0);
    });
  });
});
