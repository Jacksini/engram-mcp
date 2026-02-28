import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

export function registerGetMemory(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "get_memory",
    "Recupera una memoria específica por su ID.",
    {
      id: z.string().uuid("El id debe ser un UUID válido").describe("El ID de la memoria"),
    },
    async ({ id }) => {
      const memory = db.getById(id);

      if (!memory) {
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
            text: JSON.stringify(memory),
          },
        ],
      };
    }
  );
}
