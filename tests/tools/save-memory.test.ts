import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("save_memory tool", () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("saves a memory with minimal input", () => {
    const memory = db.create({ content: "Remember this pattern" });

    expect(memory.id).toBeDefined();
    expect(memory.content).toBe("Remember this pattern");
    expect(memory.category).toBe("general");
    expect(memory.tags).toEqual([]);
  });

  it("saves a memory with category and tags", () => {
    const memory = db.create({
      content: "Use ESM imports",
      category: "convention",
      tags: ["typescript", "imports"],
    });

    expect(memory.category).toBe("convention");
    expect(memory.tags).toEqual(["typescript", "imports"]);
  });

  it("saves a memory with metadata", () => {
    const memory = db.create({
      content: "API endpoint pattern",
      metadata: { file: "src/routes.ts", line: 42 },
    });

    expect(memory.metadata).toEqual({ file: "src/routes.ts", line: 42 });
  });
});
