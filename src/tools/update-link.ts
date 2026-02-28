import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";
import type { RelationType } from "../types/memory.js";

const RELATION_TYPES = ["caused", "references", "supersedes", "related"] as const;

export function registerUpdateLink(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "update_link",
    "Actualiza el tipo de relación de un enlace ya existente entre dos memorias. " +
      "A diferencia de link_memories (que hace upsert), este tool devuelve error si el enlace no existe. " +
      "Tipos de relación: caused, references, supersedes, related.",
    {
      from_id: z
        .string()
        .uuid("from_id debe ser un UUID válido")
        .describe("ID de la memoria origen del enlace."),
      to_id: z
        .string()
        .uuid("to_id debe ser un UUID válido")
        .describe("ID de la memoria destino del enlace."),
      relation: z
        .enum(RELATION_TYPES)
        .describe("Nuevo tipo de relación: caused | references | supersedes | related."),
    },
    async ({ from_id, to_id, relation }) => {
      if (from_id === to_id) {
        return {
          isError: true,
          content: [
            { type: "text" as const, text: "Error: from_id y to_id no pueden ser el mismo." },
          ],
        };
      }

      const updated = db.updateLink(from_id, to_id, relation as RelationType);
      if (!updated) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: no existe un enlace de '${from_id}' a '${to_id}'.`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(updated, null, 2) }],
      };
    }
  );
}
