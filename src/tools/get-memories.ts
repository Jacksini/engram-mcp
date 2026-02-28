import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";
import { CompactParams } from "./schemas.js";

export function registerGetMemories(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "get_memories",
    "Recupera múltiples memorias por id en una sola query. Los ids no encontrados se reportan en 'notFound' sin lanzar error.",
    {
      ids: z
        .array(z.string().uuid("Cada id debe ser un UUID válido"))
        .min(1, "Debe proporcionar al menos un id")
        .max(50, "No se pueden obtener más de 50 memorias a la vez")
        .describe("Lista de ids de memorias a recuperar"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Número máximo de memorias a devolver (1-50). Si se omite se devuelven todas las encontradas."),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Número de memorias a saltar antes de devolver resultados (paginación). Por defecto 0."),
      ...CompactParams,
    },
    async ({ ids, limit, offset, compact, content_preview_len }) => {
      const allMemories = db.getByIds(ids);
      const foundIds = new Set(allMemories.map((m) => m.id));
      const notFound = ids.filter((id) => !foundIds.has(id));

      const off = offset ?? 0;
      const paged = limit != null ? allMemories.slice(off, off + limit) : allMemories.slice(off);

      const items = paged.map(({ id, content, category, tags, ...rest }) => {
        const truncated = content_preview_len != null ? content.slice(0, content_preview_len) : content;
        if (compact) return { id, content: truncated, category, tags };
        return { id, content: truncated, category, tags, ...rest };
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: allMemories.length, count: items.length, notFound, memories: items }),
          },
        ],
      };
    }
  );
}

