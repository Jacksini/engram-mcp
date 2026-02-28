import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

const RELATION_TYPES = ["caused", "references", "supersedes", "related"] as const;

const schema = {
  from_id: z.string().uuid("from_id debe ser un UUID válido").describe("ID de la memoria origen."),
  to_id:   z.string().uuid("to_id debe ser un UUID válido").describe("ID de la memoria destino."),
  relation: z.enum(RELATION_TYPES).optional().default("related")
    .describe("Tipo de relación: caused | references | supersedes | related. Default: related."),
};

export function registerLinkMemories(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "link_memories",
    "Crea o actualiza un enlace direccional entre dos memorias. " +
    "Si el par (from_id, to_id) ya existe, actualiza el tipo de relación (upsert). " +
    "Tipos de relación: caused, references, supersedes, related.",
    schema,
    async ({ from_id, to_id, relation }) => {
      if (from_id === to_id) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "Error: from_id y to_id no pueden ser el mismo." }],
        };
      }

      const fromExists = db.getById(from_id);
      if (!fromExists) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error: memoria '${from_id}' no encontrada.` }],
        };
      }

      const toExists = db.getById(to_id);
      if (!toExists) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error: memoria '${to_id}' no encontrada.` }],
        };
      }

      const link = db.linkMemories({ from_id, to_id, relation });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(link, null, 2) }],
      };
    }
  );
}
