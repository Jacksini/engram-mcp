import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";
import { registerUpdateLink } from "../../src/tools/update-link.js";

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>
) {
  // @ts-expect-error — accessing internal MCP server registry for tests
  const tool = server._registeredTools[name];
  return tool.handler(args);
}

describe("update_link tool", () => {
  let db: MemoryDatabase;
  let server: McpServer;
  let idA: string;
  let idB: string;
  let idC: string;

  beforeEach(() => {
    db = createTestDb();
    server = new McpServer({ name: "test", version: "0.0.0" });
    registerUpdateLink(server, db);

    idA = db.create({ content: "Memory A" }).id;
    idB = db.create({ content: "Memory B" }).id;
    idC = db.create({ content: "Memory C" }).id;
  });

  afterEach(() => { db.close(); });

  it("updates the relation of an existing link and returns the updated link", async () => {
    db.linkMemories({ from_id: idA, to_id: idB, relation: "related" });

    const result = await callTool(server, "update_link", {
      from_id: idA,
      to_id: idB,
      relation: "caused",
    });

    expect(result.isError).toBeUndefined();
    const link = parseResult(result);
    expect(link.from_id).toBe(idA);
    expect(link.to_id).toBe(idB);
    expect(link.relation).toBe("caused");
    expect(link.created_at).toBeTruthy();
  });

  it.each(["caused", "references", "supersedes", "related"] as const)(
    "accepts all valid relation types ('%s')",
    async (relation) => {
      db.linkMemories({ from_id: idA, to_id: idB, relation: "related" });
      const result = await callTool(server, "update_link", { from_id: idA, to_id: idB, relation });
      expect(result.isError).toBeUndefined();
      expect(parseResult(result).relation).toBe(relation);
    }
  );

  it("returns isError if the link does not exist", async () => {
    const result = await callTool(server, "update_link", {
      from_id: idA,
      to_id: idB,
      relation: "caused",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("no existe");
  });

  it("returns isError if from_id === to_id", async () => {
    const result = await callTool(server, "update_link", {
      from_id: idA,
      to_id: idA,
      relation: "caused",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("no pueden ser el mismo");
  });

  it("does not affect other links when updating one", async () => {
    db.linkMemories({ from_id: idA, to_id: idB, relation: "related" });
    db.linkMemories({ from_id: idA, to_id: idC, relation: "references" });

    await callTool(server, "update_link", { from_id: idA, to_id: idB, relation: "caused" });

    // The A→C link should remain unchanged
    const linkAC = db.getLink(idA, idC);
    expect(linkAC?.relation).toBe("references");
  });

  it("db.getLink reflects the updated relation", async () => {
    db.linkMemories({ from_id: idA, to_id: idB, relation: "related" });
    await callTool(server, "update_link", { from_id: idA, to_id: idB, relation: "supersedes" });

    const link = db.getLink(idA, idB);
    expect(link?.relation).toBe("supersedes");
  });

  it("reverse direction is not affected by updating forward direction", async () => {
    db.linkMemories({ from_id: idA, to_id: idB, relation: "related" });
    db.linkMemories({ from_id: idB, to_id: idA, relation: "related" });

    await callTool(server, "update_link", { from_id: idA, to_id: idB, relation: "caused" });

    const reverseLink = db.getLink(idB, idA);
    expect(reverseLink?.relation).toBe("related");
  });
});
