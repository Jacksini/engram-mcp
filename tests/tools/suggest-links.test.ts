import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";
import { registerSuggestLinks } from "../../src/tools/suggest-links.js";

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

async function callTool(server: McpServer, args: Record<string, unknown>) {
  // @ts-expect-error - internal registry used in tests
  const tool = server._registeredTools["suggest_links"];
  return tool.handler(args);
}

describe("suggest_links tool", () => {
  let db: MemoryDatabase;
  let server: McpServer;

  beforeEach(() => {
    db = createTestDb();
    server = new McpServer({ name: "test", version: "0.0.0" });
    registerSuggestLinks(server, db);
  });

  afterEach(() => {
    db.close();
  });

  it("returns suggestions for a specific memory id", async () => {
    const candidateId = db.create({
      content: "Feature design for backend API auth",
      tags: ["backend", "api", "auth"],
      auto_link: false,
    }).id;

    const sourceId = db.create({
      content: "Implementation details for backend API and cache",
      tags: ["backend", "api", "cache"],
      auto_link: false,
    }).id;

    const result = await callTool(server, { id: sourceId, limit: 20 });
    const payload = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(payload.analysed).toBe(1);
    expect(Array.isArray(payload.suggestions)).toBe(true);
    expect(payload.suggestions.some((s: { to_id: string; from_id: string }) => s.to_id === candidateId && s.from_id === sourceId)).toBe(true);
  });

  it("supports orphan mode when id is omitted", async () => {
    db.create({ content: "Orphan alpha", category: "code", auto_link: false });
    db.create({ content: "Orphan beta", category: "decision", auto_link: false });

    const result = await callTool(server, { limit: 10 });
    const payload = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(typeof payload.analysed).toBe("number");
    expect(payload.analysed).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(payload.suggestions)).toBe(true);
  });

  it("respects limit in returned suggestions", async () => {
    for (let i = 0; i < 8; i++) {
      db.create({
        content: `Peer memory ${i} backend api cache`,
        tags: ["backend", "api", "cache"],
        auto_link: false,
      });
    }

    const sourceId = db.create({
      content: "Target backend api cache memory",
      tags: ["backend", "api", "cache"],
      auto_link: false,
    }).id;

    const result = await callTool(server, { id: sourceId, limit: 3 });
    const payload = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(payload.suggestions.length).toBeLessThanOrEqual(3);
  });
});
