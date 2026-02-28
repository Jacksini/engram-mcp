import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

const RELATION_TYPES = ["caused", "references", "supersedes", "related"] as const;

const schema = {
  id: z.string().uuid("id debe ser un UUID válido").describe("ID de la memoria cuyos enlaces se quieren recuperar."),
  relation: z.enum(RELATION_TYPES).optional()
    .describe("Filtrar por tipo de relación (opcional)."),
  direction: z.enum(["from", "to", "both"]).optional().default("both")
    .describe(
      "from = enlaces salientes (id → otras), " +
      "to = enlaces entrantes (otras → id), " +
      "both = todos (default)."
    ),
};

export function registerGetRelated(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "get_related",
    "Recupera las memorias vinculadas a una memoria dada. " +
    "Permite filtrar por tipo de relación y dirección (from, to, both).",
    schema,
    async ({ id, relation, direction }) => {
      const results = db.getRelated({ id, relation, direction });
      const payload = {
        total: results.length,
        results,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );
}
