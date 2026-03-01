import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

export function registerMigrateToProject(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "migrate_to_project",
    "Mueve memorias que contengan un tag específico a un proyecto destino. " +
      "Útil para reorganizar memorias existentes en proyectos separados. " +
      "Ejemplo: migrate_to_project(tag='inventra', project='inventra') mueve todas las memorias con tag 'inventra' al proyecto 'inventra'.",
    {
      tag: z
        .string()
        .min(1, "El tag no puede estar vacío")
        .describe("Tag que identifica las memorias a migrar."),
      project: z
        .string()
        .min(1, "El proyecto no puede estar vacío")
        .describe("Nombre del proyecto destino."),
    },
    async ({ tag, project }) => {
      const updated = db.migrateToProject({ tag, project });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ migrated: updated, tag, project }),
          },
        ],
      };
    }
  );
}
