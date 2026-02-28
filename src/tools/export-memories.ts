import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";
import { CategoryEnum } from "./schemas.js";

export function registerExportMemories(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "export_memories",
    "Exporta memorias como JSON array. Útil para backup, migración o inspección. Soporta filtros opcionales.",
    {
      category: CategoryEnum,
      tag: z.string().optional().describe("Filtrar por tag específico"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(10_000)
        .optional()
        .describe("Máximo de memorias a exportar (default 10.000)"),
    },
    async ({ category, tag, limit }) => {
      const memories = db.exportAll({ category, tag, limit });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ exported: memories.length, memories }),
          },
        ],
      };
    }
  );
}
