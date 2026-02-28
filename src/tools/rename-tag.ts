import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

export function registerRenameTag(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "rename_tag",
    "Renombra un tag en todas las memorias que lo contienen en una sola transacción. " +
    "Si old_tag y new_tag son iguales no hace nada. " +
    "Si una memoria ya tiene new_tag, el tag duplicado es eliminado automáticamente. " +
    "Devuelve cuántas memorias fueron actualizadas.",
    {
      old_tag: z
        .string()
        .min(1, "old_tag no puede estar vacío")
        .describe("Tag actual a renombrar."),
      new_tag: z
        .string()
        .min(1, "new_tag no puede estar vacío")
        .describe("Nuevo nombre para el tag."),
    },
    async ({ old_tag, new_tag }) => {
      if (old_tag === new_tag) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ updated: 0, old_tag, new_tag }),
            },
          ],
        };
      }

      const result = db.renameTag(old_tag, new_tag);
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
