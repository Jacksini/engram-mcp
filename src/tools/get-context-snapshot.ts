import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

export function registerGetContextSnapshot(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "get_context_snapshot",
    "Devuelve un resumen compacto de todas las memorias agrupado por categoría. Ideal para cargar contexto al inicio de una sesión con el mínimo de tokens. Incluye: total de memorias, conteo por categoría con las N más recientes, e índice de frecuencia de tags.",
    {
      recent_per_category: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Cuántas memorias recientes incluir por categoría (1-10), por defecto 3"),
      content_preview_len: z
        .number()
        .int()
        .min(20)
        .max(500)
        .optional()
        .describe("Si se especifica, trunca el contenido de los items recientes a este número de caracteres. Útil para bootstrapping mínimo de tokens."),
      include_tags_index: z
        .boolean()
        .optional()
        .describe("Si false, omite el índice de frecuencia de tags (ahorra la segunda query SQL). Por defecto true."),
    },
    async ({ recent_per_category, content_preview_len, include_tags_index }) => {
      const snapshot = db.getContextSnapshot(
        recent_per_category ?? 3,
        content_preview_len,
        include_tags_index ?? true,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(snapshot),
          },
        ],
      };
    }
  );
}
