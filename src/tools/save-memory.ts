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
      deduplicate: z.boolean().optional().default(false)
        .describe("Si true, calcula SHA-256 del contenido y devuelve la memoria existente si ya existe en el mismo proyecto (con _deduplicated: true). Default: false."),
    },
    async ({ content, category, tags, metadata, expires_at, project, auto_link, deduplicate }) => {
      const memory = db.create({ content, category, tags, metadata, expires_at, project, auto_link, deduplicate });
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
