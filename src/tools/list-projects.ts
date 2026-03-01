import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryDatabase } from "../db/database.js";

export function registerListProjects(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "list_projects",
    "Lista todos los proyectos que existen en la base de datos con el conteo de memorias de cada uno. " +
      "Útil para descubrir qué proyectos están almacenados y cuántas memorias tiene cada uno.",
    {},
    async () => {
      const projects = db.listProjects();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ projects, default_project: db.defaultProject }),
          },
        ],
      };
    }
  );
}
