import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";
import { CategoryEnum, CompactParams, SortByParam } from "./schemas.js";

export function registerListMemories(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "list_memories",
    "Lista memorias con filtros opcionales por categoría, tag, metadata o rango de fechas. Retorna las más recientes primero por defecto.",
    {
      category: CategoryEnum,
      tag: z.string().optional().describe("Filtrar memorias que contengan este tag"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Máximo de resultados (1-100), por defecto 10"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Offset para paginación (>= 0)"),
      sort_by: SortByParam,
      created_after: z
        .string()
        .optional()
        .describe("ISO datetime. Solo memorias creadas en o después de esta fecha."),
      created_before: z
        .string()
        .optional()
        .describe("ISO datetime. Solo memorias creadas en o antes de esta fecha."),
      updated_after: z
        .string()
        .optional()
        .describe("ISO datetime. Solo memorias actualizadas en o después de esta fecha."),
      updated_before: z
        .string()
        .optional()
        .describe("ISO datetime. Solo memorias actualizadas en o antes de esta fecha."),
      metadata_key: z
        .string()
        .optional()
        .describe("Nombre del campo en metadata a filtrar. Debe combinarse con metadata_value."),
      metadata_value: z
        .string()
        .optional()
        .describe("Valor exacto a buscar en el campo metadata_key via json_extract."),
      ...CompactParams,
    },
    async ({ category, tag, limit, offset, sort_by, created_after, created_before, updated_after, updated_before, metadata_key, metadata_value, compact, content_preview_len }) => {
      const resolvedLimit = limit ?? 10;
      const resolvedOffset = offset ?? 0;
      const { memories, total } = db.listWithTotal({
        category, tag,
        limit: resolvedLimit, offset: resolvedOffset,
        sort_by, created_after, created_before, updated_after, updated_before,
        metadata_key, metadata_value,
      });
      const items = memories.map(({ id, content, category: cat, tags, ...rest }) => {
        const truncated = content_preview_len != null ? content.slice(0, content_preview_len) : content;
        if (compact) return { id, content: truncated, category: cat, tags };
        return { id, content: truncated, category: cat, tags, ...rest };
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total, offset: resolvedOffset, limit: resolvedLimit, memories: items }),
          },
        ],
      };
    }
  );
}
