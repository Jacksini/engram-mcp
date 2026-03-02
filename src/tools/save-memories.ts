import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";
import { MemoryInputSchema, CompactParams, ProjectParam } from "./schemas.js";

export function registerSaveMemories(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "save_memories",
    "Guarda múltiples memorias en una sola transacción SQLite. Ideal para bootstrapping de contexto masivo o guardar varias notas de golpe. Más eficiente que llamar save_memory repetidamente.",
    {
      memories: z
        .array(MemoryInputSchema)
        .min(1, "Debe proporcionar al menos una memoria")
        .max(50, "No se pueden guardar más de 50 memorias a la vez")
        .describe("Lista de memorias a guardar"),
      project: ProjectParam,
      auto_link: z.boolean().optional().default(true)
        .describe("Si false, omite la inferencia automática de enlaces para todas las memorias del lote. Default: true."),
      ...CompactParams,
    },
    async ({ memories, project, auto_link, compact, content_preview_len }) => {
      // Apply the tool-level project and auto_link to each memory that doesn't specify its own
      const inputs = memories.map((m) => ({ ...m, project: project, auto_link }));
      const created = db.createBatch(inputs);
      const items = created.map(({ id, content, category: cat, tags, ...rest }) => {
        const truncated = content_preview_len != null ? content.slice(0, content_preview_len) : content;
        if (compact) return { id, content: truncated, category: cat, tags };
        return { id, content: truncated, category: cat, tags, ...rest };
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ saved: created.length, memories: items }),
          },
        ],
      };
    }
  );
}
