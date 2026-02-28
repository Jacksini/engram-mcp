import { MemoryDatabase } from "../../src/db/database.js";

export function createTestDb(): MemoryDatabase {
  return new MemoryDatabase(":memory:");
}
