import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

const RELATION_TYPES = ["caused", "references", "supersedes", "related"] as const;

export function registerGetGraph(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "get_graph",
    "Devuelve el grafo completo de memorias enlazadas. " +
      "Incluye nodos (memorias) y aristas (links entre ellas), " +
      "más una cadena Mermaid lista para renderizar como diagrama de flujo. " +
      "Por defecto solo incluye nodos que aparecen en al menos un enlace. " +
      "Usa include_orphans=true para incluir memorias sin enlaces.",
    {
      include_orphans: z
        .boolean()
        .optional()
        .describe(
          "Si true, incluye memorias sin ningún enlace (huérfanas). Por defecto false."
        ),
      relation: z
        .enum(RELATION_TYPES)
        .optional()
        .describe(
          "Filtrar el grafo a un único tipo de relación: caused | references | supersedes | related."
        ),
    },
    async ({ include_orphans, relation }) => {
      const result = db.getGraph({ include_orphans, relation });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
