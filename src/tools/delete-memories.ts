import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

export function registerDeleteMemories(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "delete_memories",
    "Elimina múltiples memorias por id en una sola transacción SQLite. Informa cuántas se eliminaron y cuáles ids no se encontraron.",
    {
      ids: z
        .array(z.string().uuid("Cada id debe ser un UUID válido"))
        .min(1, "Debe proporcionar al menos un id")
        .max(50, "No se pueden eliminar más de 50 memorias a la vez")
        .describe("Lista de ids de memorias a eliminar"),
    },
    async ({ ids }) => {
      const result = db.deleteBatch(ids);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );
}
