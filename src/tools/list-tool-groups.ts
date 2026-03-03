import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryDatabase } from "../db/database.js";
import { getToolGroupsPayload } from "./tool-catalog.js";

export function registerListToolGroups(server: McpServer, _db: MemoryDatabase): void {
  server.tool(
    "list_tool_groups",
    "Lista las herramientas MCP agrupadas por función principal (Create, Read, Update, Delete, Graph, Ops/Admin). Útil para descubrir rápidamente qué tool usar.",
    {},
    async () => {
      const payload = getToolGroupsPayload();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );
}
