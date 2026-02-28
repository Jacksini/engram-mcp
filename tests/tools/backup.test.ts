import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { MemoryDatabase } from "../../src/db/database.js";
import { registerBackup } from "../../src/tools/backup.js";

async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown> = {}
) {
  // @ts-expect-error — accessing internal MCP server registry for tests
  const tool = server._registeredTools[name];
  return tool.handler(args);
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

describe("backup tool", () => {
  describe("with :memory: database", () => {
    let db: MemoryDatabase;
    let server: McpServer;

    beforeEach(() => {
      db = new MemoryDatabase(":memory:");
      server = new McpServer({ name: "test", version: "0.0.0" });
      registerBackup(server, db);
    });

    afterEach(() => { db.close(); });

    it("returns isError for in-memory databases", async () => {
      const result = await callTool(server, "backup");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("memoria");
    });
  });

  describe("with file-based database", () => {
    let db: MemoryDatabase;
    let server: McpServer;
    let dbPath: string;
    let tmpDir: string;

    beforeEach(() => {
      // Create an isolated temp dir per test to avoid filename collisions
      tmpDir = join(tmpdir(), `mi-mcp-backup-test-${randomUUID()}`);
      mkdirSync(tmpDir, { recursive: true });
      dbPath = join(tmpDir, "memories.db");

      db = new MemoryDatabase(dbPath);
      db.create({ content: "test memory for backup" });

      server = new McpServer({ name: "test", version: "0.0.0" });
      registerBackup(server, db);
    });

    afterEach(() => {
      db.close();
      // Clean up the tmp dir and all its files (db + backups)
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns path, size_bytes and created_at", async () => {
      const result = await callTool(server, "backup");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result);
      expect(data.path).toBeTruthy();
      expect(data.path).toContain("memories.backup.");
      expect(data.path).toContain(".db");
      expect(typeof data.size_bytes).toBe("number");
      expect(data.size_bytes).toBeGreaterThan(0);
      expect(data.created_at).toBeTruthy();
      expect(new Date(data.created_at).getTime()).not.toBeNaN();
    });

    it("the backup file actually exists on disk", async () => {
      const result = await callTool(server, "backup");
      const { path } = parseResult(result);
      expect(existsSync(path)).toBe(true);
    });

    it("backup is placed in the same directory as the source db", async () => {
      const result = await callTool(server, "backup");
      const { path } = parseResult(result);
      expect(path.startsWith(tmpDir)).toBe(true);
    });

    it("backup filename uses a timestamp format YYYY-MM-DDThh-mm-ss", async () => {
      const result = await callTool(server, "backup");
      const { path } = parseResult(result);
      // e.g. memories.backup.2026-02-27T19-30-00.db
      expect(path).toMatch(/memories\.backup\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/);
    });

    it("two consecutive backups have different filenames", async () => {
      // Small delay to ensure the timestamp differs (or at minimum different paths)
      const r1 = await callTool(server, "backup");
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const r2 = await callTool(server, "backup");

      expect(parseResult(r1).path).not.toBe(parseResult(r2).path);
    });

    it("db.dbPath is exposed correctly", () => {
      expect(db.dbPath).toBe(dbPath);
    });
  });
});
