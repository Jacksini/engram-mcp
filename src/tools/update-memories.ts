import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";
import { UpdateItemSchema } from "./schemas.js";

export function registerUpdateMemories(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "update_memories",
    "Actualiza múltiples memorias en una sola transacción SQLite. Informa cuáles se actualizaron y cuáles ids no se encontraron.",
    {
      memories: z
        .array(UpdateItemSchema)
        .min(1, "Debe proporcionar al menos una memoria a actualizar")
        .max(50, "No se pueden actualizar más de 50 memorias a la vez")
        .describe("Lista de memorias a actualizar. Cada item debe incluir id y al menos un campo."),
    },
    async ({ memories }) => {
      const result = db.updateBatch(memories);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              updated: result.updated.length,
              notFound: result.notFound,
              memories: result.updated,
            }),
          },
        ],
      };
    }
  );
}
