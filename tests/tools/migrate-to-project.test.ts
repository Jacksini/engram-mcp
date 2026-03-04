import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";
import { registerMigrateToProject } from "../../src/tools/migrate-to-project.js";

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

async function callTool(server: McpServer, args: Record<string, unknown>) {
  // @ts-expect-error - internal registry used in tests
  const tool = server._registeredTools["migrate_to_project"];
  return tool.handler(args);
}

describe("migrate_to_project tool", () => {
  let db: MemoryDatabase;
  let server: McpServer;

  beforeEach(() => {
    db = createTestDb();
    server = new McpServer({ name: "test", version: "0.0.0" });
    registerMigrateToProject(server, db);
  });

  afterEach(() => {
    db.close();
  });

  it("migrates only tagged memories from source project", async () => {
    const sourceTagged = db.create({ content: "tagged", tags: ["inventra"], project: "default" });
    const sourceOther = db.create({ content: "other", tags: ["other"], project: "default" });
    const otherProjectTagged = db.create({ content: "legacy", tags: ["inventra"], project: "legacy" });

    const result = await callTool(server, {
      tag: "inventra",
      source_project: "default",
      project: "inventra",
    });

    expect(result.isError).toBeUndefined();
    expect(parseResult(result)).toEqual({
      migrated: 1,
      tag: "inventra",
      source_project: "default",
      project: "inventra",
    });

    expect(db.getById(sourceTagged.id)!.project).toBe("inventra");
    expect(db.getById(sourceOther.id)!.project).toBe("default");
    expect(db.getById(otherProjectTagged.id)!.project).toBe("legacy");
  });

  it("returns migrated=0 when source and destination are the same", async () => {
    db.create({ content: "same project", tags: ["inventra"], project: "default" });

    const result = await callTool(server, {
      tag: "inventra",
      source_project: "default",
      project: "default",
    });

    expect(result.isError).toBeUndefined();
    expect(parseResult(result).migrated).toBe(0);
  });

});
