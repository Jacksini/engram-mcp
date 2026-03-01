import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";
import { MemoryInputSchema, ProjectParam } from "./schemas.js";

const ImportRowSchema = z.object({
  id: z.string().uuid().optional().describe("ID existente. Solo relevante en modo 'upsert'."),
  ...MemoryInputSchema.shape,
});

export function registerImportMemories(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "import_memories",
    "Importa un array de memorias en una sola transacción. mode='insert' crea nuevas siempre (ignora id). mode='upsert' actualiza si el id ya existe, si no inserta.",
    {
      memories: z
        .array(ImportRowSchema)
        .min(1, "Debe proporcionar al menos una memoria")
        .max(500, "No se pueden importar más de 500 memorias a la vez")
        .describe("Array de memorias a importar"),
      mode: z
        .enum(["insert", "upsert"])
        .optional()
        .describe("'insert' (default): siempre crea nuevas. 'upsert': actualiza si el id ya existe."),
      project: ProjectParam,
    },
    async ({ memories, mode, project }) => {
      const inputs = memories.map(m => ({ ...m, project }));
      const result = db.importBatch(inputs, mode ?? "insert");
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
