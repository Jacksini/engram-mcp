import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatGroupedDescription } from "./tool-catalog.js";

export function patchGroupedToolDescriptions(server: McpServer): void {
  const originalTool = server.tool.bind(server) as McpServer["tool"];

  const patchedTool = ((name: string, description: string, ...rest: unknown[]) => {
    const groupedDescription = formatGroupedDescription(name, description);
    return (originalTool as unknown as (...args: unknown[]) => unknown)(name, groupedDescription, ...rest);
  }) as unknown as McpServer["tool"];

  (server as unknown as { tool: McpServer["tool"] }).tool = patchedTool;
}
