import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";
import { ProjectParam } from "./schemas.js";

const schema = {
  id: z.string().uuid("id debe ser un UUID válido").optional()
    .describe(
      "ID de la memoria a analizar. Si se omite, se analizan memorias huérfanas " +
      "(sin ningún enlace) en el proyecto."
    ),
  project: ProjectParam,
  limit: z.number().int().min(1).max(100).optional().default(20)
    .describe("Máximo de sugerencias a retornar. Default: 20."),
};

export function registerSuggestLinks(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "suggest_links",
    "Analiza memorias y sugiere posibles enlaces sin crearlos. " +
    "Usa tres heurísticas: tags compartidos, similitud de contenido (FTS5) y proximidad temporal. " +
    "Si se proporciona un id específico, analiza esa memoria. " +
    "Si no, analiza memorias huérfanas del proyecto.",
    schema,
    async ({ id, project, limit }) => {
      const result = db.suggestLinks({ id, project, limit });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
