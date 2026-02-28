import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("get_stats (getStats)", () => {
  let db: MemoryDatabase;

  afterEach(() => { db.close(); });

  describe("empty database", () => {
    beforeEach(() => { db = createTestDb(); });

    it("returns total=0", () => {
      expect(db.getStats().total).toBe(0);
    });

    it("returns empty by_category", () => {
      expect(db.getStats().by_category).toEqual({});
    });

    it("returns empty top_tags", () => {
      expect(db.getStats().top_tags).toEqual([]);
    });

    it("oldest and newest are null", () => {
      const stats = db.getStats();
      expect(stats.oldest).toBeNull();
      expect(stats.newest).toBeNull();
    });

    it("avg_content_len is 0", () => {
      expect(db.getStats().avg_content_len).toBe(0);
    });

    it("memories_without_tags is 0", () => {
      expect(db.getStats().memories_without_tags).toBe(0);
    });

    it("memories_without_metadata is 0", () => {
      expect(db.getStats().memories_without_metadata).toBe(0);
    });
  });

  describe("with data", () => {
    beforeEach(() => {
      db = createTestDb();
      db.create({ content: "Alpha",    category: "code",     tags: ["ts", "react"],  metadata: { v: 1 } });
      db.create({ content: "Beta",     category: "code",     tags: ["ts"]                              });
      db.create({ content: "Gamma",    category: "decision", tags: ["backend"]                         });
      db.create({ content: "Delta",    category: "decision"                                             });
      db.create({ content: "Epsilon",  category: "bug",      tags: ["ts", "ci"]                       });
    });

    it("total equals number of memories created", () => {
      expect(db.getStats().total).toBe(5);
    });

    it("by_category has correct counts", () => {
      const { by_category } = db.getStats();
      expect(by_category["code"]).toBe(2);
      expect(by_category["decision"]).toBe(2);
      expect(by_category["bug"]).toBe(1);
    });

    it("by_category does not include categories with 0", () => {
      const { by_category } = db.getStats();
      expect(by_category["architecture"]).toBeUndefined();
    });

    it("top_tags lists ts as most frequent", () => {
      const { top_tags } = db.getStats();
      expect(top_tags[0].tag).toBe("ts");
      expect(top_tags[0].count).toBe(3);
    });

    it("top_tags is ordered by count descending", () => {
      const { top_tags } = db.getStats();
      for (let i = 1; i < top_tags.length; i++) {
        expect(top_tags[i - 1].count).toBeGreaterThanOrEqual(top_tags[i].count);
      }
    });

    it("oldest and newest are Memory objects", () => {
      const { oldest, newest } = db.getStats();
      expect(oldest).not.toBeNull();
      expect(newest).not.toBeNull();
      expect(oldest).toHaveProperty("id");
      expect(newest).toHaveProperty("id");
    });

    it("oldest.content is the first inserted memory", () => {
      expect(db.getStats().oldest?.content).toBe("Alpha");
    });

    it("newest.content is the last inserted memory", () => {
      expect(db.getStats().newest?.content).toBe("Epsilon");
    });

    it("oldest and newest are different when more than 1 memory", () => {
      const { oldest, newest } = db.getStats();
      expect(oldest!.id).not.toBe(newest!.id);
    });

    it("avg_content_len is a positive integer", () => {
      const avg = db.getStats().avg_content_len;
      expect(avg).toBeGreaterThan(0);
      expect(Number.isInteger(avg)).toBe(true);
    });

    it("memories_without_tags counts memories with no tags", () => {
      // Delta has no tags
      expect(db.getStats().memories_without_tags).toBe(1);
    });

    it("memories_without_metadata counts memories with empty metadata", () => {
      // Only Alpha has metadata: {v:1}; rest have {}
      expect(db.getStats().memories_without_metadata).toBe(4);
    });

    it("single memory: oldest and newest are the same", () => {
      const single = createTestDb();
      single.create({ content: "Solo" });
      const { oldest, newest } = single.getStats();
      expect(oldest!.id).toBe(newest!.id);
      single.close();
    });
  });
});
