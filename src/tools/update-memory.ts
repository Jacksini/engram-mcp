import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";
import { UpdateFieldsSchema, requireAtLeastOneUpdateField } from "./schemas.js";

export function registerUpdateMemory(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "update_memory",
    "Actualiza el contenido, categoría, tags o metadata de una memoria existente.",
    {
      id: z.string().uuid("El id debe ser un UUID válido").describe("El ID de la memoria a actualizar"),
      ...UpdateFieldsSchema.shape,
    },
    async ({ id, content, category, tags, metadata, expires_at }) => {
      if (!requireAtLeastOneUpdateField({ content, category, tags, metadata, expires_at })) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "Debes proporcionar al menos un campo para actualizar: content, category, tags, metadata o expires_at.",
            },
          ],
        };
      }

      const updated = db.update(id, { content, category, tags, metadata, expires_at });

      if (!updated) {
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
            text: JSON.stringify(updated),
          },
        ],
      };
    }
  );
}
