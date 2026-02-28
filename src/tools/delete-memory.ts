import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

export function registerDeleteMemory(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "delete_memory",
    "Elimina una memoria por su ID.",
    {
      id: z.string().uuid("El id debe ser un UUID válido").describe("El ID de la memoria a eliminar"),
    },
    async ({ id }) => {
      const deleted = db.delete(id);

      if (!deleted) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `No se encontró memoria con ID: ${id}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Memoria ${id} eliminada correctamente.`,
          },
        ],
      };
    }
  );
}
