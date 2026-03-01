import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";
import { CategoryEnum, CompactParams, SortByParam, ProjectParam } from "./schemas.js";

export function registerSearchMemories(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "search_memories",
    "Busca memorias usando búsqueda full-text. Por defecto usa OR (cualquier término). Usa mode='all' para requerir todos los términos.",
    {
      query: z
        .string()
        .min(1, "La consulta no puede estar vacía")
        .max(500, "La consulta no puede superar 500 caracteres")
        .describe("Texto de búsqueda"),
      category: CategoryEnum,
      tag: z.string().optional().describe("Filtrar por tag específico"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Máximo de resultados (1-100), por defecto 10"),
      mode: z
        .enum(["any", "all", "near"])
        .optional()
        .describe("'any' = OR entre términos (default), 'all' = AND entre términos, 'near' = términos próximos (NEAR)"),
      near_distance: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Solo para mode='near'. Distancia máxima en tokens entre términos (default 10)."),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Offset para paginación (>= 0)"),
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
      sort_by: SortByParam,
      project: ProjectParam,
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
    async ({ query, category, tag, limit, mode, near_distance, offset, created_after, created_before, updated_after, updated_before, sort_by, project, metadata_key, metadata_value, compact, content_preview_len }) => {
      const resolvedLimit = limit ?? 10;
      const resolvedOffset = offset ?? 0;
      const { memories, total } = db.searchWithTotal({
        query, category, tag, project,
        limit: resolvedLimit, mode, near_distance,
        offset: resolvedOffset,
        created_after, created_before, updated_after, updated_before, sort_by,
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
