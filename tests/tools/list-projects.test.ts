import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";
import { registerListProjects } from "../../src/tools/list-projects.js";

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

async function callTool(server: McpServer) {
  // @ts-expect-error - internal registry used in tests
  const tool = server._registeredTools["list_projects"];
  return tool.handler({});
}

describe("list_projects tool", () => {
  let db: MemoryDatabase;
  let server: McpServer;

  beforeEach(() => {
    db = createTestDb();
    server = new McpServer({ name: "test", version: "0.0.0" });
    registerListProjects(server, db);
  });

  afterEach(() => {
    db.close();
  });

  it("returns an empty projects list for an empty database", async () => {
    const result = await callTool(server);

    expect(result.isError).toBeUndefined();
    expect(parseResult(result)).toEqual({
      projects: [],
      default_project: db.defaultProject,
    });
  });

  it("returns projects with memory counts", async () => {
    db.create({ content: "default 1", project: "default" });
    db.create({ content: "default 2", project: "default" });
    db.create({ content: "p2 1", project: "p2" });
    db.create({ content: "p3 1", project: "p3" });
    db.create({ content: "p3 2", project: "p3" });
    db.create({ content: "p3 3", project: "p3" });

    const result = await callTool(server);
    const payload = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(payload.default_project).toBe("default");
    expect(payload.projects).toEqual(
      expect.arrayContaining([
        { project: "default", count: 2 },
        { project: "p2", count: 1 },
        { project: "p3", count: 3 },
      ])
    );
    expect(payload.projects[0]!.count).toBeGreaterThanOrEqual(payload.projects[1]!.count);
  });
});
