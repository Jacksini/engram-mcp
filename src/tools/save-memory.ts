import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryDatabase } from "../db/database.js";
import { MemoryInputSchema, ProjectParam } from "./schemas.js";

export function registerSaveMemory(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "save_memory",
    "Guarda una memoria/nota para recuperarla después. Usa categorías y tags para organizarla.",
    { ...MemoryInputSchema.shape, project: ProjectParam },
    async ({ content, category, tags, metadata, expires_at, project }) => {
      const memory = db.create({ content, category, tags, metadata, expires_at, project });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(memory),
          },
        ],
      };
    }
  );
}
