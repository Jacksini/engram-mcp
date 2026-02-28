import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

export function registerRestoreMemory(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "restore_memory",
    "Restaura una memoria a un estado anterior almacenado en su historial. " +
      "Usa get_history para obtener el history_id de la versión a restaurar. " +
      "La restauración se registra como un nuevo evento 'update' en el historial. " +
      "Solo funciona si la memoria todavía existe; las memorias eliminadas no pueden restaurarse con este tool " +
      "(usa save_memory para recrearlas con el contenido de get_history).",
    {
      memory_id: z
        .string()
        .uuid("memory_id debe ser un UUID válido")
        .describe("ID de la memoria a restaurar."),
      history_id: z
        .number()
        .int()
        .positive()
        .describe(
          "ID numérico de la entrada de historial a restaurar (obtenido con get_history)."
        ),
    },
    async ({ memory_id, history_id }) => {
      const restored = db.restoreMemory({ memory_id, history_id });

      if (!restored) {
        // Could be memory not found OR history entry not found
        const history = db.getHistory({ memory_id, limit: 1 });
        if (history.total === 0) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Error: memoria '${memory_id}' no encontrada o eliminada.`,
              },
            ],
          };
        }
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: entrada de historial ${history_id} no encontrada para la memoria '${memory_id}'.`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(restored, null, 2) }],
      };
    }
  );
}
