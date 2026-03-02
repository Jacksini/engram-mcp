import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";
import { MemoryInputSchema, ProjectParam } from "./schemas.js";

export function registerSaveMemory(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "save_memory",
    "Guarda una memoria/nota para recuperarla después. Usa categorías y tags para organizarla.",
    {
      ...MemoryInputSchema.shape,
      project: ProjectParam,
      auto_link: z.boolean().optional().default(true)
        .describe("Si false, omite la inferencia automática de enlaces al crear. Default: true."),
    },
    async ({ content, category, tags, metadata, expires_at, project, auto_link }) => {
      const memory = db.create({ content, category, tags, metadata, expires_at, project, auto_link });
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
