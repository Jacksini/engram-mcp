import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";
import { ProjectParam } from "./schemas.js";

const RELATION_TYPES = ["caused", "references", "supersedes", "related"] as const;

const schema = {
  id: z.string().uuid("id debe ser un UUID válido")
    .describe("ID de la memoria de origen para el traversal."),
  max_depth: z.number().int().min(1).max(5).optional().default(3)
    .describe("Profundidad máxima de traversal (1–5). Default: 3."),
  relation: z.enum(RELATION_TYPES).optional()
    .describe("Filtrar el traversal a un único tipo de relación (opcional)."),
  project: ProjectParam,
  limit: z.number().int().min(1).max(200).optional().default(50)
    .describe("Máximo de memorias a retornar en total. Default: 50."),
};

export function registerGetRelatedDeep(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "get_related_deep",
    "Traversal multi-hop del grafo de memorias. Sigue enlaces salientes desde una memoria de origen " +
    "hasta la profundidad indicada, evitando ciclos. Retorna todas las memorias alcanzadas " +
    "ordenadas por profundidad (hop distance).",
    schema,
    async ({ id, max_depth, relation, project, limit }) => {
      const result = db.getRelatedDeep({ id, max_depth, relation, project, limit });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
