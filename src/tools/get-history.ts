import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

export function registerGetHistory(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "get_history",
    "Devuelve el historial de cambios de una memoria específica. " +
      "Registra automáticamente cada operación create, update y delete. " +
      "Los resultados se ordenan del más reciente al más antiguo. " +
      "Útil para auditar cambios o encontrar el history_id necesario para restore_memory.",
    {
      memory_id: z
        .string()
        .uuid("memory_id debe ser un UUID válido")
        .describe("ID de la memoria cuyo historial se quiere consultar."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Máximo de entradas a devolver (1-200). Por defecto 50."),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Offset para paginación (>= 0). Por defecto 0."),
    },
    async ({ memory_id, limit, offset }) => {
      const result = db.getHistory({ memory_id, limit, offset });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
