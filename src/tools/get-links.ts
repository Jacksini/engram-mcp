import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

const RELATION_TYPES = ["caused", "references", "supersedes", "related"] as const;

export function registerGetLinks(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "get_links",
    "Lista todos los enlaces del grafo de memorias. Permite filtrar por nodo origen, nodo destino o tipo de relación. " +
    "Útil para inspeccionar la estructura completa del grafo o exportarla.",
    {
      from_id: z
        .string()
        .uuid("from_id debe ser un UUID válido")
        .optional()
        .describe("Filtrar enlaces que parten de esta memoria."),
      to_id: z
        .string()
        .uuid("to_id debe ser un UUID válido")
        .optional()
        .describe("Filtrar enlaces que llegan a esta memoria."),
      relation: z
        .enum(RELATION_TYPES)
        .optional()
        .describe("Filtrar por tipo de relación: caused | references | supersedes | related."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Máximo de resultados (1-500), por defecto 50."),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Offset para paginación (>= 0)."),
    },
    async ({ from_id, to_id, relation, limit, offset }) => {
      const result = db.listLinks({ from_id, to_id, relation, limit, offset });
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
