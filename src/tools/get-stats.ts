import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryDatabase } from "../db/database.js";
import { ProjectParam } from "./schemas.js";

export function registerGetStats(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "get_stats",
    "Devuelve estadísticas agregadas de la base de datos: total, conteo por categoría, top tags, memoria más antigua y más reciente, longitud promedio de contenido, y memorias sin tags o sin metadata.",
    { project: ProjectParam },
    async ({ project }) => {
      const stats = db.getStats(project);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(stats),
          },
        ],
      };
    }
  );
}
