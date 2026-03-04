import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

export function registerMigrateToProject(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "migrate_to_project",
    "Mueve memorias que contengan un tag específico desde un proyecto origen a un proyecto destino. " +
      "Útil para reorganizar memorias existentes en proyectos separados. " +
      "Ejemplo: migrate_to_project(tag='inventra', source_project='default', project='inventra') mueve memorias con tag 'inventra' desde 'default' a 'inventra'.",
    {
      tag: z
        .string()
        .min(1, "El tag no puede estar vacío")
        .describe("Tag que identifica las memorias a migrar."),
      source_project: z
        .string()
        .min(1, "El proyecto origen no puede estar vacío")
        .describe("Proyecto origen desde el cual migrar memorias."),
      project: z
        .string()
        .min(1, "El proyecto no puede estar vacío")
        .describe("Nombre del proyecto destino."),
    },
    async ({ tag, source_project, project }) => {
      const updated = db.migrateToProject({ tag, source_project, project });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ migrated: updated, tag, source_project, project }),
          },
        ],
      };
    }
  );
}
